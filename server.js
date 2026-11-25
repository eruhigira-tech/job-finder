'use strict';
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const os = require('os');
const path = require('path');
const cache = require('./cache');
const { normalizeJobs } = require('./normalize');

// Whitelists: anything not on these lists is rejected before it reaches the API.
const COUNTRIES = ['rw', 'ke', 'ug', 'tz', 'za', 'ng', 'gh', 'et', 'us', 'gb', 'ca', 'de', 'fr', 'in', 'ae'];
const DATE_POSTED = ['all', 'today', '3days', 'week', 'month'];
// Letters, numbers, spaces and a few characters needed for "C++", "C#", "R&D".
// Angle brackets, quotes, semicolons etc. are rejected, which blocks script injection.
const QUERY_RE = /^[\p{L}\p{N} ,.'+#&/-]{2,80}$/u;

function createApp(opts = {}) {
  const apiKey = opts.apiKey !== undefined ? opts.apiKey : process.env.RAPIDAPI_KEY;
  const apiHost = opts.apiHost || process.env.RAPIDAPI_HOST || 'jsearch.p.rapidapi.com';
  const doFetch = opts.fetchImpl || fetch;
  const trustProxy = Number(opts.trustProxy !== undefined ? opts.trustProxy : process.env.TRUST_PROXY || 0);
  const rateMax = Number(opts.rateLimit !== undefined ? opts.rateLimit : process.env.RATE_LIMIT || 30);
  const endpoints = opts.endpoints || [process.env.JSEARCH_ENDPOINT || '/search-v2', '/search'];

  const app = express();
  // Number of proxies in front of Node (HAProxy + nginx = 2, Docker compose = 1, none = 0).
  if (trustProxy > 0) app.set('trust proxy', trustProxy);

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        // The lab is served over plain http, so do not force https upgrades.
        'upgrade-insecure-requests': null,
      },
    },
  }));

  // Identify which server answered (this proves load balancing in the demo).
  app.use((req, res, next) => {
    res.setHeader('X-Served-By', os.hostname());
    next();
  });

  app.use(express.static(path.join(__dirname, 'public')));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', server: os.hostname(), uptime: Math.round(process.uptime()), cache: cache.stats() });
  });

  app.use('/api/', rateLimit({
    windowMs: 60 * 1000,
    limit: rateMax,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many requests. Please wait a minute and try again.' },
  }));

  app.get('/api/jobs', async (req, res) => {
    if (!apiKey) {
      return res.status(500).json({ error: 'Server is not configured: RAPIDAPI_KEY is missing.' });
    }

    // ---- Input validation (never trust the client) ----
    const q = String(req.query.q || '').trim();
    if (!QUERY_RE.test(q)) {
      return res.status(400).json({ error: 'Enter 2 to 80 letters, numbers or spaces.' });
    }
    const page = req.query.page === undefined ? 1 : Number(req.query.page);
    if (!Number.isInteger(page) || page < 1 || page > 5) {
      return res.status(400).json({ error: 'Page must be a whole number from 1 to 5.' });
    }
    const country = String(req.query.country || 'rw').toLowerCase();
    if (!COUNTRIES.includes(country)) {
      return res.status(400).json({ error: 'Unsupported country.' });
    }
    const datePosted = String(req.query.date_posted || 'all');
    if (!DATE_POSTED.includes(datePosted)) {
      return res.status(400).json({ error: 'Unsupported date filter.' });
    }

    // ---- Cache (key is built from the normalised inputs) ----
    const key = JSON.stringify([q.toLowerCase(), page, country, datePosted]);
    const cached = cache.get(key);
    if (cached) {
      res.set('X-Cache', 'HIT');
      return res.json({ jobs: cached.jobs, meta: { cached: true, fetchedAt: cached.fetchedAt } });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    try {
      let response;
      for (const endpoint of endpoints) {
        const url = new URL(`https://${apiHost}${endpoint}`);
        url.searchParams.set('query', q);
        url.searchParams.set('page', String(page));
        url.searchParams.set('num_pages', '1');
        url.searchParams.set('country', country);
        if (datePosted !== 'all') url.searchParams.set('date_posted', datePosted);

        response = await doFetch(url, {
          headers: { 'x-rapidapi-key': apiKey, 'x-rapidapi-host': apiHost },
          signal: controller.signal,
        });
        if (response.status !== 404) break; // try the next endpoint only on 404
      }
      clearTimeout(timer);

      if (response.status === 429) {
        return res.status(429).json({ error: 'The jobs API quota is used up. Please try again later.' });
      }
      if (response.status === 401 || response.status === 403) {
        console.error('Upstream rejected credentials:', response.status, await response.text());
        return res.status(502).json({
          error: 'The jobs API rejected the server key. Check RAPIDAPI_KEY and that you are subscribed to JSearch.',
        });
      }
      if (!response.ok) {
        console.error('Upstream error:', response.status, await response.text());
        return res.status(502).json({ error: `The jobs API returned an error (${response.status}).` });
      }

      const jobs = normalizeJobs(await response.json());
      if (!jobs) {
        return res.status(502).json({ error: 'Unexpected response from the jobs API.' });
      }

      const fetchedAt = new Date().toISOString();
      cache.set(key, { jobs, fetchedAt }); // only successful responses are cached
      res.set('X-Cache', 'MISS');
      return res.json({ jobs, meta: { cached: false, fetchedAt } });
    } catch (err) {
      clearTimeout(timer);
      const timedOut = err && err.name === 'AbortError';
      console.error('Fetch failed:', err && err.message);
      return res.status(timedOut ? 504 : 502).json({
        error: timedOut ? 'The jobs API took too long to respond.' : 'Could not reach the jobs API.',
      });
    }
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

  // Last-resort error handler: never leak stack traces to the browser.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on the server.' });
  });

  return app;
}

if (require.main === module) {
  if (!process.env.RAPIDAPI_KEY) {
    console.error('Missing RAPIDAPI_KEY. Copy .env.example to .env and fill it in.');
    process.exit(1);
  }
  const PORT = process.env.PORT || 3000;
  const server = createApp().listen(PORT, () => console.log(`Job Finder running on port ${PORT}`));
  // Lets Docker / Kubernetes stop the container cleanly.
  process.on('SIGTERM', () => server.close(() => process.exit(0)));
}

module.exports = { createApp, QUERY_RE, COUNTRIES, DATE_POSTED };
