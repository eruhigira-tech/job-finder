const test = require('node:test');
const assert = require('node:assert');
const { normalizeJobs, normalizeType, safeUrl } = require('../normalize');

const sample = {
  job_id: 'abc',
  job_title: 'Backend Developer',
  employer_name: 'Acme',
  job_city: 'Kigali',
  job_country: 'RW',
  job_employment_types: ['FULLTIME'],
  job_is_remote: true,
  job_posted_at_datetime_utc: '2026-11-20T10:00:00.000Z',
  job_apply_link: 'https://example.com/apply',
  job_description: 'Build   APIs.\n\nWork with a great team.',
};

test('accepts the { data: [] } shape', () => {
  const jobs = normalizeJobs({ data: [sample] });
  assert.strictEqual(jobs.length, 1);
  assert.strictEqual(jobs[0].title, 'Backend Developer');
  assert.strictEqual(jobs[0].remote, true);
  assert.deepStrictEqual(jobs[0].types, ['FULLTIME']);
  assert.strictEqual(jobs[0].snippet, 'Build APIs. Work with a great team.');
});

test('accepts the { data: { jobs: [] } } shape', () => {
  assert.strictEqual(normalizeJobs({ data: { jobs: [sample] } }).length, 1);
});

test('returns null for an unexpected shape', () => {
  assert.strictEqual(normalizeJobs({ nope: 1 }), null);
  assert.strictEqual(normalizeJobs(null), null);
});

test('removes unsafe links (XSS via javascript: URLs)', () => {
  const [job] = normalizeJobs({ data: [{ ...sample, job_apply_link: 'javascript:alert(1)' }] });
  assert.strictEqual(job.link, null);
  assert.strictEqual(safeUrl('data:text/html,<script>1</script>'), null);
  assert.strictEqual(safeUrl('https://ok.example/x'), 'https://ok.example/x');
});

test('removes duplicate jobs', () => {
  assert.strictEqual(normalizeJobs({ data: [sample, sample] }).length, 1);
});

test('maps employment types', () => {
  assert.strictEqual(normalizeType('Full-time'), 'FULLTIME');
  assert.strictEqual(normalizeType('PARTTIME'), 'PARTTIME');
  assert.strictEqual(normalizeType('Contractor'), 'CONTRACTOR');
  assert.strictEqual(normalizeType('Internship'), 'INTERN');
  assert.strictEqual(normalizeType(undefined), 'OTHER');
});
