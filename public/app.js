const $ = (id) => document.getElementById(id);
let allJobs = [];

async function search() {
  const q = $('query').value.trim();
  if (!q) { setStatus('Please enter a search term.', true); return; }

  $('searchBtn').disabled = true;
  setStatus('Searching…');
  $('results').replaceChildren();

  try {
    const res = await fetch(`/api/jobs?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Something went wrong.');
    allJobs = data.jobs;
    $('controls').hidden = false;
    render();
  } catch (err) {
    allJobs = [];
    $('controls').hidden = true;
    setStatus(err.message || 'Network error. Check your connection.', true);
  } finally {
    $('searchBtn').disabled = false;
  }
}

function render() {
  const text = $('filterText').value.toLowerCase();
  const type = $('filterType').value;
  const remote = $('remoteOnly').checked;
  const sort = $('sortBy').value;

  let jobs = allJobs.filter((j) =>
    (!text || `${j.title} ${j.company}`.toLowerCase().includes(text)) &&
    (!type || (j.types || []).includes(type)) &&
    (!remote || j.remote)
  );

  jobs.sort((a, b) => {
    if (sort === 'title') return (a.title || '').localeCompare(b.title || '');
    if (sort === 'company') return (a.company || '').localeCompare(b.company || '');
    return new Date(b.posted || 0) - new Date(a.posted || 0);
  });

  setStatus(jobs.length ? `${jobs.length} job(s) shown` : 'No jobs match your search or filters.');
  $('results').replaceChildren(...jobs.map(card));
}

function card(j) {
  const div = document.createElement('div');
  div.className = 'card';

  const h = document.createElement('h3');
  h.textContent = j.title || 'Untitled role';

  const meta = document.createElement('div');
  meta.className = 'meta';
  const place = [j.city, j.country].filter(Boolean).join(', ') || 'Location not listed';
  meta.textContent = `${j.company || 'Unknown company'} · ${place}`;

  const badges = document.createElement('p');
  if (j.type) badges.append(badge(j.type));
  if (j.remote) badges.append(badge('REMOTE'));
  if (j.posted) badges.append(document.createTextNode(new Date(j.posted).toLocaleDateString()));

  div.append(h, meta, badges);

  if (j.link && /^https?:\/\//.test(j.link)) {
    const a = document.createElement('a');
    a.href = j.link; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Apply →';
    div.append(a);
  }
  return div;
}

function badge(t) {
  const s = document.createElement('span');
  s.className = 'badge'; s.textContent = t;
  return s;
}

function setStatus(msg, isError = false) {
  $('status').textContent = msg;
  $('status').className = isError ? 'error' : '';
}

$('searchBtn').addEventListener('click', search);
$('query').addEventListener('keydown', (e) => e.key === 'Enter' && search());
['filterText', 'filterType', 'remoteOnly', 'sortBy'].forEach((id) =>
  $(id).addEventListener('input', render)
);
