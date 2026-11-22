require('dotenv').config();
const express = require('express');
const os = require('os');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_HOST = process.env.RAPIDAPI_HOST || 'jsearch.p.rapidapi.com';
const API_KEY = process.env.RAPIDAPI_KEY;

if (!API_KEY) {
  console.error('Missing RAPIDAPI_KEY. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

// Simple in-memory cache (bonus: performance optimisation)
const cache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;

// Identify which server answered (used to prove load balancing)
app.use((req, res, next) => {
  res.setHeader('X-Served-By', os.hostname());
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', server: os.hostname() });
});

app.get('/api/jobs', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q || q.length > 100) {
    return res.status(400).json({ error: 'Enter a search term (1-100 characters).' });
  }
  const page = Math.min(Math.max(parseInt(req.query.page, 10) || 1, 1), 5);
  const cacheKey = `${q.toLowerCase()}|${page}`;

  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.time < CACHE_TTL_MS) {
    return res.json({ jobs: hit.jobs, cached: true });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const url = new URL(`https://${API_HOST}/search`);
    url.searchParams.set('query', q);
    url.searchParams.set('page', page);
    url.searchParams.set('num_pages', '1');

    const response = await fetch(url, {
      headers: { 'x-rapidapi-key': API_KEY, 'x-rapidapi-host': API_HOST },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (response.status === 429) {
      return res.status(429).json({ error: 'API rate limit reached. Please try again later.' });
    }
    if (response.status === 401 || response.status === 403) {
      return res.status(502).json({ error: 'Server API credentials were rejected.' });
    }
    if (!response.ok) {
      return res.status(502).json({ error: `Upstream API error (${response.status}).` });
    }

    const body = await response.json();
    if (!Array.isArray(body.data)) {
      return res.status(502).json({ error: 'Unexpected response from the jobs API.' });
    }

    const jobs = body.data.map((j) => ({
      id: j.job_id,
      title: j.job_title,
      company: j.employer_name,
      city: j.job_city,
      country: j.job_country,
      type: j.job_employment_type,
      remote: Boolean(j.job_is_remote),
      posted: j.job_posted_at_datetime_utc,
      link: j.job_apply_link,
    }));

    cache.set(cacheKey, { jobs, time: Date.now() });
    res.json({ jobs, cached: false });
  } catch (err) {
    clearTimeout(timer);
    const timedOut = err.name === 'AbortError';
    res.status(timedOut ? 504 : 502).json({
      error: timedOut ? 'The jobs API took too long to respond.' : 'Could not reach the jobs API.',
    });
  }
});

app.listen(PORT, () => console.log(`Job Finder running on port ${PORT}`));
