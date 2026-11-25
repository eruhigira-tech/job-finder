const test = require('node:test');
const assert = require('node:assert');
const cache = require('../cache');
const { createApp } = require('../server');

function fakeApi(status = 200, body = { data: [{ job_id: '1', job_title: 'Dev', employer_name: 'Acme' }] }) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => 'upstream text' };
  };
  return { fetchImpl, calls };
}

async function start(opts) {
  const app = createApp({ apiKey: 'test-key', rateLimit: 1000, ...opts });
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

test.beforeEach(() => cache.clear());

test('GET /health works and names the server', async () => {
  const { server, url } = await start();
  const res = await fetch(`${url}/health`);
  const body = await res.json();
  server.close();
  assert.strictEqual(res.status, 200);
  assert.strictEqual(body.status, 'ok');
  assert.ok(res.headers.get('x-served-by'));
});

test('sends security headers', async () => {
  const { server, url } = await start();
  const res = await fetch(`${url}/health`);
  server.close();
  assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(res.headers.get('content-security-policy'));
  assert.strictEqual(res.headers.get('x-powered-by'), null);
});

test('rejects script injection in the search term with 400', async () => {
  const api = fakeApi();
  const { server, url } = await start({ fetchImpl: api.fetchImpl });
  const q = encodeURIComponent('<img src=x onerror=alert(1)>');
  const res = await fetch(`${url}/api/jobs?q=${q}`);
  server.close();
  assert.strictEqual(res.status, 400);
  assert.strictEqual(api.calls.length, 0, 'the upstream API must not be called');
});

test('rejects empty, bad page, bad country and bad date filters', async () => {
  const { server, url } = await start({ fetchImpl: fakeApi().fetchImpl });
  const bad = ['q=', 'q=developer&page=9', 'q=developer&page=abc', 'q=developer&country=zz', 'q=developer&date_posted=never'];
  for (const qs of bad) {
    const res = await fetch(`${url}/api/jobs?${qs}`);
    assert.strictEqual(res.status, 400, qs);
  }
  server.close();
});

test('first request is a MISS, second is a HIT, and the API is called once', async () => {
  const api = fakeApi();
  const { server, url } = await start({ fetchImpl: api.fetchImpl });
  const a = await fetch(`${url}/api/jobs?q=Developer`);
  const b = await fetch(`${url}/api/jobs?q=developer`); // same search, different case
  const body = await b.json();
  server.close();
  assert.strictEqual(a.headers.get('x-cache'), 'MISS');
  assert.strictEqual(b.headers.get('x-cache'), 'HIT');
  assert.strictEqual(api.calls.length, 1);
  assert.strictEqual(body.jobs[0].title, 'Dev');
});

test('upstream errors are not cached', async () => {
  const api = fakeApi(429, {});
  const { server, url } = await start({ fetchImpl: api.fetchImpl });
  const a = await fetch(`${url}/api/jobs?q=developer`);
  await fetch(`${url}/api/jobs?q=developer`);
  server.close();
  assert.strictEqual(a.status, 429);
  assert.strictEqual(api.calls.length, 2);
});

test('rejected credentials give a clear 502 without leaking upstream details', async () => {
  const { server, url } = await start({ fetchImpl: fakeApi(403, {}).fetchImpl });
  const res = await fetch(`${url}/api/jobs?q=developer`);
  const body = await res.json();
  server.close();
  assert.strictEqual(res.status, 502);
  assert.ok(!JSON.stringify(body).includes('upstream text'));
});

test('unexpected API shape gives 502', async () => {
  const { server, url } = await start({ fetchImpl: fakeApi(200, { hello: 'world' }).fetchImpl });
  const res = await fetch(`${url}/api/jobs?q=developer`);
  server.close();
  assert.strictEqual(res.status, 502);
});

test('falls back to the older /search endpoint when /search-v2 is a 404', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(new URL(url).pathname);
    if (calls.length === 1) return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
    return { ok: true, status: 200, json: async () => ({ data: [{ job_id: '2', job_title: 'Ops' }] }), text: async () => '' };
  };
  const { server, url } = await start({ fetchImpl });
  const res = await fetch(`${url}/api/jobs?q=operations`);
  server.close();
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(calls, ['/search-v2', '/search']);
});

test('rate limiter returns 429 after too many requests', async () => {
  const { server, url } = await start({ rateLimit: 3, fetchImpl: fakeApi().fetchImpl });
  const codes = [];
  for (let i = 0; i < 5; i++) codes.push((await fetch(`${url}/api/jobs?q=developer`)).status);
  server.close();
  assert.deepStrictEqual(codes.slice(0, 3), [200, 200, 200]);
  assert.strictEqual(codes[4], 429);
});
