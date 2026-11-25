const test = require('node:test');
const assert = require('node:assert');
const cache = require('../cache');

test.beforeEach(() => cache.clear());

test('stores and returns a value', () => {
  cache.set('a', { n: 1 });
  assert.deepStrictEqual(cache.get('a'), { n: 1 });
});

test('unknown keys miss', () => assert.strictEqual(cache.get('nope'), null));

test('stats count hits and misses', () => {
  cache.set('k', 1);
  cache.get('k');
  cache.get('missing');
  const s = cache.stats();
  assert.strictEqual(s.hits, 1);
  assert.strictEqual(s.misses, 1);
  assert.strictEqual(s.size, 1);
});

test('oldest entry is evicted when the cache is full', () => {
  for (let i = 0; i < 205; i++) cache.set(`k${i}`, i);
  assert.strictEqual(cache.stats().size, 200);
  assert.strictEqual(cache.get('k0'), null);
  assert.strictEqual(cache.get('k204'), 204);
});
