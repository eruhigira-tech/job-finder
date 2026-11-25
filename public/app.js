'use strict';
/* Job Finder front end.
   Security: nothing from the API is ever put into innerHTML. All text goes through
   textContent / createTextNode, and links are only created for http(s) URLs. */

const $ = (id) => document.getElementById(id);
const KEYS = { tracker: 'jf.tracker.v1', settings: 'jf.settings.v1' };
const QUERY_RE = /^[\p{L}\p{N} ,.'+#&/-]{2,80}$/u; // same rule as the server
const STATUSES = [['saved', 'Saved'], ['applied', 'Applied'], ['interview', 'Interview'], ['offer', 'Offer'], ['rejected', 'Closed']];
const TYPE_LABELS = { FULLTIME: 'Full-time', PARTTIME: 'Part-time', CONTRACTOR: 'Contract', INTERN: 'Internship', OTHER: 'Other' };
const SUGGESTIONS = ['software engineer', 'accountant', 'data analyst', 'project manager', 'nurse', 'marketing'];

/* ---------- storage (wrapped: it can be blocked or full) ---------- */
function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

let allJobs = [];
let tracker = Array.isArray(load(KEYS.tracker, [])) ? load(KEYS.tracker, []) : [];
let settings = Object.assign({ theme: null, country: 'rw', recents: [] }, load(KEYS.settings, {}));
if (!Array.isArray(settings.recents)) settings.recents = [];
let controller = null;

/* ---------- helpers ---------- */
function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) n.append(kid);
  return n;
}

function safeUrl(u) {
  try { const x = new URL(String(u)); return x.protocol === 'http:' || x.protocol === 'https:' ? x.href : null; } catch { return null; }
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
function timeAgo(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const hours = Math.round((t - Date.now()) / 36e5);
  if (Math.abs(hours) < 24) return hours === 0 ? 'just now' : rtf.format(hours, 'hour');
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return rtf.format(days, 'day');
  return rtf.format(Math.round(days / 30), 'month');
}

function placeOf(j) { return [j.city, j.country].filter(Boolean).join(', ') || 'Location not listed'; }
function primaryType(j) { return (j.types && j.types[0]) || 'OTHER'; }
function setStatus(msg, isError = false) {
  $('status').textContent = msg;
  $('status').className = isError ? 'error' : '';
}

/* ---------- theme + settings ---------- */
function applyTheme(theme) { document.documentElement.setAttribute('data-theme', theme); }
$('themeBtn').addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  settings.theme = next;
  applyTheme(next);
  save(KEYS.settings, settings);
});

function remember(q) {
  settings.recents = [q, ...settings.recents.filter((r) => r.toLowerCase() !== q.toLowerCase())].slice(0, 5);
  save(KEYS.settings, settings);
  renderRecents();
}
function renderRecents() {
  $('recents').replaceChildren(...settings.recents.map((r) =>
    el('button', { class: 'chip', type: 'button', text: r, onclick: () => runSearch(r) })));
}
function renderSuggestions() {
  $('suggestions').replaceChildren(...SUGGESTIONS.map((s) =>
    el('button', { class: 'chip', type: 'button', text: s, onclick: () => runSearch(s) })));
}

/* ---------- search ---------- */
function runSearch(q) { $('query').value = q; search(); }

async function search() {
  const q = $('query').value.trim();
  if (!QUERY_RE.test(q)) {
    setStatus('Enter 2 to 80 letters, numbers or spaces.', true);
    return;
  }
  settings.country = $('country').value;
  save(KEYS.settings, settings);

  if (controller) controller.abort();
  controller = new AbortController();

  $('searchBtn').disabled = true;
  $('empty').hidden = true;
  setStatus('Searching…');
  $('results').replaceChildren(...Array.from({ length: 4 }, () => el('div', { class: 'skeleton' })));

  try {
    const params = new URLSearchParams({ q, country: $('country').value, date_posted: $('datePosted').value });
    const res = await fetch(`/api/jobs?${params}`, { signal: controller.signal });
    let data = {};
    try { data = await res.json(); } catch { /* non-JSON error page */ }
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);

    allJobs = Array.isArray(data.jobs) ? data.jobs : [];
    const served = res.headers.get('X-Served-By');
    const cacheState = res.headers.get('X-Cache');
    if (served) {
      $('servedBy').textContent = `${served}${cacheState ? ' · cache ' + cacheState : ''}`;
      $('servedBy').hidden = false;
    }
    remember(q);
    $('controls').hidden = allJobs.length === 0;
    renderInsights(allJobs);
    render();
  } catch (err) {
    if (err.name === 'AbortError') return;
    allJobs = [];
    $('controls').hidden = true;
    $('insights').hidden = true;
    $('results').replaceChildren();
    $('empty').hidden = false;
    setStatus(err.message || 'Network error. Check your connection.', true);
  } finally {
    $('searchBtn').disabled = false;
  }
}

$('searchForm').addEventListener('submit', (e) => { e.preventDefault(); search(); });

/* ---------- results ---------- */
function render() {
  const text = $('filterText').value.trim().toLowerCase();
  const type = $('filterType').value;
  const remote = $('remoteOnly').checked;
  const sort = $('sortBy').value;

  const jobs = allJobs.filter((j) =>
    (!text || `${j.title} ${j.company}`.toLowerCase().includes(text)) &&
    (!type || (j.types || []).includes(type)) &&
    (!remote || j.remote));

  jobs.sort((a, b) => {
    if (sort === 'title') return (a.title || '').localeCompare(b.title || '');
    if (sort === 'company') return (a.company || '').localeCompare(b.company || '');
    return Date.parse(b.posted || 0) - Date.parse(a.posted || 0);
  });

  if (!allJobs.length) setStatus('No jobs found. Try a broader title, another country, or "Any time".');
  else setStatus(jobs.length ? `${jobs.length} of ${allJobs.length} jobs shown` : 'No jobs match your filters.');
  $('results').replaceChildren(...jobs.map(card));
}

function isSaved(id) { return tracker.some((t) => t.id === id); }

function card(j) {
  const link = safeUrl(j.link);
  const initial = (j.company || j.title || '?').trim().charAt(0).toUpperCase();
  const when = j.posted ? timeAgo(j.posted) : '';
  const snippet = j.snippet ? el('p', { class: 'snippet', hidden: true, text: j.snippet }) : null;

  const saveBtn = el('button', { class: 'btn-secondary', type: 'button', 'aria-pressed': String(isSaved(j.id)) });
  const paintSave = () => {
    const on = isSaved(j.id);
    saveBtn.setAttribute('aria-pressed', String(on));
    saveBtn.textContent = on ? '★ Saved' : '☆ Save';
  };
  paintSave();
  saveBtn.addEventListener('click', () => {
    if (isSaved(j.id)) tracker = tracker.filter((t) => t.id !== j.id);
    else tracker.push({ id: j.id, job: j, status: 'saved', savedAt: Date.now() });
    save(KEYS.tracker, tracker);
    paintSave();
    updateTrackerCount();
  });

  const actions = [saveBtn];
  if (snippet) {
    const more = el('button', { class: 'btn-secondary', type: 'button', 'aria-expanded': 'false', text: 'Details' });
    more.addEventListener('click', () => {
      snippet.hidden = !snippet.hidden;
      more.setAttribute('aria-expanded', String(!snippet.hidden));
    });
    actions.push(more);
  }
  if (link) actions.push(el('a', { class: 'btn-link btn-apply', href: link, target: '_blank', rel: 'noopener noreferrer', text: 'Apply →' }));

  return el('article', { class: 'card' },
    el('div', { class: 'card-top' },
      el('div', { class: 'avatar', 'aria-hidden': 'true', text: initial }),
      el('div', {},
        el('h3', { text: j.title || 'Untitled role' }),
        el('div', { class: 'meta', text: `${j.company || 'Unknown company'} · ${placeOf(j)}` }))),
    el('div', { class: 'badges' },
      el('span', { class: 'badge', text: TYPE_LABELS[primaryType(j)] || 'Other' }),
      j.remote ? el('span', { class: 'badge badge-remote', text: 'Remote' }) : null,
      when ? el('span', { text: `Posted ${when}` }) : null),
    snippet,
    el('div', { class: 'card-actions' }, ...actions));
}

/* ---------- insights (data visualisation) ---------- */
function countBy(items) {
  const m = new Map();
  for (const i of items) if (i) m.set(i, (m.get(i) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function bars(title, entries) {
  const max = Math.max(1, ...entries.map((e) => e[1]));
  return el('div', { class: 'chart' },
    el('h3', { text: title }),
    ...entries.map(([label, n]) => {
      const fill = el('div', { class: 'bar-fill' });
      fill.style.width = `${Math.round((n / max) * 100)}%`;
      return el('div', { class: 'bar-row' },
        el('span', { class: 'bar-label', title: label, text: label }),
        el('div', { class: 'bar-track', role: 'img', 'aria-label': `${label}: ${n}` }, fill),
        el('span', { class: 'bar-val', text: String(n) }));
    }));
}

function tile(label, value, sub) {
  return el('div', { class: 'tile' },
    el('div', { class: 'label', text: label }),
    el('div', { class: 'value', text: value }),
    el('div', { class: 'sub', text: sub || ' ' }));
}

function renderInsights(jobs) {
  const box = $('insights');
  if (!jobs.length) { box.hidden = true; box.replaceChildren(); return; }

  const remoteN = jobs.filter((j) => j.remote).length;
  const types = countBy(jobs.map(primaryType));
  const companies = countBy(jobs.map((j) => j.company)).slice(0, 5);
  const newest = jobs.map((j) => Date.parse(j.posted)).filter((t) => !Number.isNaN(t));
  const newestText = newest.length ? timeAgo(new Date(Math.max(...newest)).toISOString()) : 'n/a';

  box.replaceChildren(
    el('div', { class: 'tiles' },
      tile('Jobs found', String(jobs.length), 'in this search'),
      tile('Remote roles', `${Math.round((remoteN / jobs.length) * 100)}%`, `${remoteN} of ${jobs.length}`),
      tile('Top job type', TYPE_LABELS[types[0][0]] || 'Other', `${types[0][1]} listings`),
      tile('Newest posting', newestText, 'most recent')),
    el('div', { class: 'charts' },
      bars('Job types', types.map(([k, n]) => [TYPE_LABELS[k] || 'Other', n])),
      bars('Top hiring companies', companies.length ? companies : [['No company data', 0]])));
  box.hidden = false;
}

['filterText', 'filterType', 'remoteOnly', 'sortBy'].forEach((id) => $(id).addEventListener('input', render));

/* ---------- tracker (unique feature) ---------- */
function updateTrackerCount() { $('trackerCount').textContent = String(tracker.length); }

function renderBoard() {
  $('board').replaceChildren(...STATUSES.map(([key, label]) => {
    const items = tracker.filter((t) => t.status === key);
    const cards = items.map((t) => {
      const sel = el('select', { 'aria-label': `Stage for ${t.job.title}` },
        ...STATUSES.map(([k, l]) => el('option', { value: k, selected: k === t.status, text: l })));
      sel.addEventListener('change', () => {
        t.status = STATUSES.some(([k]) => k === sel.value) ? sel.value : 'saved';
        save(KEYS.tracker, tracker);
        renderBoard();
      });
      const link = safeUrl(t.job.link);
      return el('div', { class: 'mini' },
        el('strong', { text: t.job.title || 'Untitled role' }),
        el('span', { class: 'meta', text: `${t.job.company || 'Unknown'} · ${placeOf(t.job)}` }),
        sel,
        el('div', { class: 'row' },
          link ? el('a', { href: link, target: '_blank', rel: 'noopener noreferrer', text: 'Open' }) : null,
          el('button', {
            class: 'link-btn', type: 'button', text: 'Remove',
            onclick: () => { tracker = tracker.filter((x) => x.id !== t.id); save(KEYS.tracker, tracker); updateTrackerCount(); renderBoard(); },
          })));
    });
    return el('div', { class: 'col' },
      el('h3', {}, el('span', { text: label }), el('span', { text: String(items.length) })),
      ...(cards.length ? cards : [el('div', { class: 'col-empty', text: 'Nothing here yet' })]));
  }));
}

function csvCell(v) {
  let s = String(v == null ? '' : v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // stop spreadsheet formula injection
  return `"${s.replace(/"/g, '""')}"`;
}
$('exportBtn').addEventListener('click', () => {
  if (!tracker.length) { return; }
  const rows = [['Title', 'Company', 'Location', 'Stage', 'Link', 'Saved on']].concat(tracker.map((t) => [
    t.job.title, t.job.company, placeOf(t.job), (STATUSES.find(([k]) => k === t.status) || [, t.status])[1],
    safeUrl(t.job.link) || '', new Date(t.savedAt).toISOString().slice(0, 10)]));
  const blob = new Blob([rows.map((r) => r.map(csvCell).join(',')).join('\n')], { type: 'text/csv' });
  const a = el('a', { href: URL.createObjectURL(blob), download: 'job-tracker.csv' });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('clearBtn').addEventListener('click', () => {
  if (tracker.length && window.confirm('Remove all jobs from your tracker?')) {
    tracker = []; save(KEYS.tracker, tracker); updateTrackerCount(); renderBoard(); render();
  }
});

/* ---------- tabs ---------- */
function showTab(name) {
  const isSearch = name === 'search';
  $('view-search').hidden = !isSearch;
  $('view-tracker').hidden = isSearch;
  $('tab-search').setAttribute('aria-selected', String(isSearch));
  $('tab-tracker').setAttribute('aria-selected', String(!isSearch));
  if (!isSearch) renderBoard(); else if (allJobs.length) render();
}
$('tab-search').addEventListener('click', () => showTab('search'));
$('tab-tracker').addEventListener('click', () => showTab('tracker'));

/* ---------- init ---------- */
if (settings.country && [...$('country').options].some((o) => o.value === settings.country)) $('country').value = settings.country;
renderRecents();
renderSuggestions();
updateTrackerCount();
