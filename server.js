require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const os = require('os');
const path = require('path');
const cache = require('./cache');

const app = express();
const PORT = process.env.PORT || 3000;
const API_HOST = process.env.RAPIDAPI_HOST || 'jsearch.p.rapidapi.com';
const API_KEY = process.env.RAPIDAPI_KEY;

if (!API_KEY) {
  console.error('Missing RAPIDAPI_KEY. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

app.set('trust proxy', 2); // HAProxy + nginx in front; use 1 if only one proxy
app.use(helmet());
app.use('/api/', rateLimit({ windowMs: 60 * 1000, limit: 30 }));

app.use((req, res, next) => {
  res.setHeader('X-Served-By', os.hostname());
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', server: os.hostname() });
});

app.get('/api/jobs', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!/^[\p{L}\p{N} ,.'-]{2,80}$/u.test(q)) {
    return res.status(400).json({ error: 'Enter 2 to 80 letters, numbers or spaces.' });
  }
  const key = q.toLowerCase();
  const cached = cache.get(key);
  if (cached) {
    res.set('X-Cache', 'HIT');
    return res.json({ jobs: cached });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);

  try {
    const url = new URL(`https://${API_HOST}/search-v2`);
    url.searchParams.set('query', q);
    url.searchParams.set('num_pages', '1');
    url.searchParams.set('country', 'rw');

    const response = await fetch(url, {
      headers: { 'x-rapidapi-key': API_KEY, 'x-rapidapi-host': API_HOST },
      signal: controller.signal,
    });

    if (response.status === 429) {
      return res.status(429).json({ error: 'API rate limit reached. Please try again later.' });
    }
    if (!response.ok) {
      console.error('JSearch upstream error:', response.status, await response.text());
      return res.status(502).json({ error: `Upstream API error (${response.status}).` });
    }

    const body = await response.json();
    const list = body && body.data && body.data.jobs;
    if (!Array.isArray(list)) {
      return res.status(502).json({ error: 'Unexpected response from the jobs API.' });
    }

    const jobs = list.map((j) => ({
      id: j.job_id,
      title: j.job_title,
      company: j.employer_name,
      city: j.job_city,
      country: j.job_country,
      type: j.job_employment_type,
      types: j.job_employment_types || [],
      remote: Boolean(j.job_is_remote),
      posted: j.job_posted_at_datetime_utc,
      link: j.job_apply_link,
    }));

    cache.set(key, jobs); // only successful responses are cached
    res.set('X-Cache', 'MISS');
    res.json({ jobs });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'AbortError';
    console.error('JSearch request failed:', err);
    res.status(timedOut ? 504 : 502).json({
      error: timedOut ? 'The jobs API took too long to respond.' : 'Could not reach the jobs API.',
    });
  } finally {
    clearTimeout(timer);
  }
});

app.listen(PORT, () => console.log(`Job Finder running on port ${PORT}`));
