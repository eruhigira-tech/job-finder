'use strict';
// Turns the raw JSearch response into the small, safe shape the front end uses.
// It accepts both response shapes seen on RapidAPI:
//   { data: [ ...jobs ] }            (older /search)
//   { data: { jobs: [ ...jobs ] } }  (newer /search-v2)

function safeUrl(value) {
  try {
    const u = new URL(String(value));
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

function normalizeType(raw) {
  const s = String(raw || '').toLowerCase();
  if (s.includes('full')) return 'FULLTIME';
  if (s.includes('part')) return 'PARTTIME';
  if (s.includes('contract')) return 'CONTRACTOR';
  if (s.includes('intern')) return 'INTERN';
  return 'OTHER';
}

function extractList(body) {
  const data = body && body.data;
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.jobs)) return data.jobs;
  return null;
}

function normalizeJobs(body) {
  const list = extractList(body);
  if (!list) return null;

  const seen = new Set();
  const jobs = [];
  for (const j of list) {
    if (!j || typeof j !== 'object') continue;
    const title = String(j.job_title || '').trim();
    const company = String(j.employer_name || '').trim();
    const city = j.job_city || '';
    const id = String(j.job_id || `${title}|${company}|${city}`);
    if (seen.has(id)) continue;
    seen.add(id);

    const rawTypes = Array.isArray(j.job_employment_types) && j.job_employment_types.length
      ? j.job_employment_types
      : [j.job_employment_type];
    const types = [...new Set(rawTypes.map(normalizeType))];

    const applyOption = Array.isArray(j.apply_options) && j.apply_options[0]
      ? j.apply_options[0].apply_link
      : null;
    const link = safeUrl(j.job_apply_link) || safeUrl(applyOption) || safeUrl(j.job_google_link);

    jobs.push({
      id,
      title,
      company,
      city,
      country: j.job_country || '',
      types,
      remote: Boolean(j.job_is_remote),
      posted: j.job_posted_at_datetime_utc || null,
      link,
      snippet: String(j.job_description || '').replace(/\s+/g, ' ').trim().slice(0, 320),
    });
  }
  return jobs;
}

module.exports = { normalizeJobs, normalizeType, safeUrl };
