const $ = (id) => document.getElementById(id);
const QUICK = ['developer in Kigali', 'data analyst in Kigali', 'accountant in Kigali', 'remote developer'];
let allJobs = [], cursor = null, lastQuery = '';

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
let saved = new Set(store.get('saved', []));

function applyTheme(t) { document.documentElement.dataset.theme = t; store.set('theme', t); }
applyTheme(store.get('theme', matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
$('themeBtn').onclick = () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');

QUICK.forEach((q) => {
  const b = document.createElement('button');
  b.type = 'button'; b.textContent = q;
  b.onclick = () => { $('query').value = q; search(); };
  $('quick').append(b);
});

async function search(append = false) {
  const q = $('query').value.trim();
  if (!q) return setStatus('Please enter a search term.', true);
  if (!append) { lastQuery = q; cursor = null; allJobs = []; store.set('lastQuery', q); showSkeleton(); }
  $('searchBtn').disabled = true; $('moreBtn').disabled = true;
  setStatus('Searching…');
  try {
    const url = `/api/jobs?q=${encodeURIComponent(lastQuery)}` + (append && cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong.');
    allJobs = allJobs.concat(data.jobs);
    cursor = data.cursor;
    $('controls').hidden = false;
    showBadge(res.headers.get('X-Served-By'), res.headers.get('X-Cache'));
    render();
  } catch (err) {
    if (!append) { allJobs = []; $('results').replaceChildren(); $('controls').hidden = true; }
    setStatus(err.message || 'Network error. Check your connection.', true);
  } finally {
    $('searchBtn').disabled = false; $('moreBtn').disabled = false;
  }
}

function render() {
  const text = $('filterText').value.toLowerCase(), type = $('filterType').value;
  const remote = $('remoteOnly').checked, savedOnly = $('savedOnly').checked, sort = $('sortBy').value;
  const jobs = allJobs.filter((j) =>
    (!text || `${j.title} ${j.company}`.toLowerCase().includes(text)) &&
    (!type || (j.types || []).includes(type)) && (!remote || j.remote) && (!savedOnly || saved.has(j.id)));
  jobs.sort((a, b) => sort === 'title' ? (a.title || '').localeCompare(b.title || '')
    : sort === 'company' ? (a.company || '').localeCompare(b.company || '')
    : new Date(b.posted || 0) - new Date(a.posted || 0));
  setStatus(jobs.length ? `${jobs.length} job(s) shown` : allJobs.length ? 'No jobs match your filters.' : 'No jobs found. Try another search.');
  $('results').replaceChildren(...jobs.map(card));
  $('moreBtn').hidden = !cursor;
}

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; }

function ago(iso) {
  if (!iso) return 'Date not listed';
  const d = Math.floor((Date.now() - new Date(iso)) / 864e5);
  return d <= 0 ? 'Posted today' : d === 1 ? 'Posted yesterday' : `Posted ${d} days ago`;
}

function card(j) {
  const c = el('article', 'card');
  c.append(el('h3', '', j.title || 'Untitled role'));
  c.append(el('div', 'meta', `${j.company || 'Unknown company'} · ${[j.city, j.country].filter(Boolean).join(', ') || 'Rwanda'}`));
  const b = el('div', 'badges');
  if (j.type) b.append(el('span', 'badge', j.type));
  if (j.remote) b.append(el('span', 'badge', 'Remote'));
  if (j.source) b.append(el('span', 'badge', j.source));
  c.append(b, el('div', 'muted', ago(j.posted)));
  const row = el('div', 'row');
  const star = el('button', 'star' + (saved.has(j.id) ? ' on' : ''), saved.has(j.id) ? '★' : '☆');
  star.type = 'button'; star.setAttribute('aria-label', 'Save job');
  star.onclick = () => { saved.has(j.id) ? saved.delete(j.id) : saved.add(j.id); store.set('saved', [...saved]); render(); };
  row.append(star);
  if (j.link && /^https?:\/\//.test(j.link)) {
    const a = el('a', 'apply', 'Apply →');
    a.href = j.link; a.target = '_blank'; a.rel = 'noopener noreferrer';
    row.append(a);
  }
  c.append(row);
  return c;
}

function showSkeleton() { $('results').replaceChildren(...Array.from({ length: 6 }, () => el('div', 'skeleton'))); }
function showBadge(server, cacheState) {
  if (!server) return;
  $('serverBadge').hidden = false;
  $('serverBadge').textContent = `Served by ${server}${cacheState ? ` · cache ${cacheState}` : ''}`;
}
function setStatus(msg, isError = false) { $('status').textContent = msg; $('status').className = isError ? 'error' : ''; }

$('searchForm').addEventListener('submit', (e) => { e.preventDefault(); search(); });
$('moreBtn').onclick = () => search(true);
['filterText', 'filterType', 'remoteOnly', 'savedOnly', 'sortBy'].forEach((id) => $(id).addEventListener('input', render));
$('query').value = store.get('lastQuery', '');
