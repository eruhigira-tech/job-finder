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

// 0 locally; set TRUST_PROXY=2 on Web01/Web02 (HAProxy + nginx in front)
app.set('trust proxy', Number(process.env.TRUST_PROXY) || 0);
// 'upgrade-insecure-requests' is disabled: the lab serves plain HTTP and it would break CSS/JS
app.use(helmet({ contentSecurityPolicy: { directives: { 'upgrade-insecure-requests': null } } }));
app.use('/api/', rateLimit({ windowMs: 60 * 1000, limit: 30 }));

// Unique feature: every response says which server handled it
app.use((req, res, next) => {
  res.setHeader('X-Served-By', os.hostname());
  next();
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (req, res) => res.json({ status: 'ok', server: os.hostname() }));

app.get('/api/jobs', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!/^[\p{L}\p{N} ,.'-]{2,80}$/u.test(q)) {
    return res.status(400).json({ error: 'Enter 2 to 80 letters, numbers or spaces.' });
  }
  const cursor = req.query.cursor ? String(req.query.cursor) : '';
  if (cursor.length > 1000) return res.status(400).json({ error: 'Invalid cursor.' });

  const key = JSON.stringify([q.toLowerCase(), cursor]);
  const hit = cache.get(key);
  res.set('X-Cache', hit ? 'HIT' : 'MISS');
  if (hit) return res.json(hit);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const url = new URL(`https://${API_HOST}/search-v2`);
    url.searchParams.set('query', q);
    url.searchParams.set('num_pages', '1');
    url.searchParams.set('country', 'rw');
    if (cursor) url.searchParams.set('cursor', cursor);

    const response = await fetch(url, {
      headers: { 'x-rapidapi-key': API_KEY, 'x-rapidapi-host': API_HOST },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (response.status === 429) {
      return res.status(429).json({ error: 'API rate limit reached. Please try again later.' });
    }
    if (response.status === 401 || response.status === 403) {
      console.error('Upstream auth error:', response.status, (await response.text()).slice(0, 200));
      return res.status(502).json({ error: 'The server API key was rejected or the plan is not subscribed.' });
    }
    if (!response.ok) {
      return res.status(502).json({ error: `Upstream API error (${response.status}).` });
    }

    const body = await response.json();
    const list = body && body.data && body.data.jobs;
    if (!Array.isArray(list)) {
      return res.status(502).json({ error: 'Unexpected response from the jobs API.' });
    }

    const payload = {
      jobs: list.map((j) => ({
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
        source: j.job_publisher,
      })),
      cursor: (body.data && body.data.cursor) || null,
    };
    cache.set(key, payload); // only successful responses are cached
    res.json(payload);
  } catch (err) {
    clearTimeout(timer);
    const timedOut = err.name === 'AbortError';
    res.status(timedOut ? 504 : 502).json({
      error: timedOut ? 'The jobs API took too long to respond.' : 'Could not reach the jobs API.',
    });
  }
});

app.listen(PORT, () => console.log(`Job Finder running on port ${PORT}`));
