'use strict';

/* ============================================================
   BNDR — VOID GLASS (NO LIBS)
   Storage schema:
   {
     note: { title, body, updatedAt },
     websites: [{ id, label, url, createdAt }],
     subs: [{ id, name, amount, cycle, renewal, createdAt }]
   }
============================================================ */

const KEY = 'bndr_void_v1';

const $ = (id) => document.getElementById(id);

const el = {
  noteTitle: $('note-title'),
  noteBody: $('note-body'),
  noteStatus: $('note-status'),
  noteMeta: $('note-meta'),
  btnNoteSave: $('btn-note-save'),

  webForm: $('web-form'),
  webLabel: $('web-label'),
  webUrl: $('web-url'),
  webList: $('web-list'),
  webCount: $('web-count'),

  subForm: $('sub-form'),
  subName: $('sub-name'),
  subAmount: $('sub-amount'),
  subCycle: $('sub-cycle'),
  subDate: $('sub-date'),
  subList: $('sub-list'),
  subCount: $('sub-count'),

  btnExport: $('btn-export'),
  btnClear: $('btn-clear'),
  importFile: $('import-file'),

  toast: $('toast'),
};

function now() { return Date.now(); }

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { note: { title:'', body:'', updatedAt: 0 }, websites: [], subs: [] };
    const data = JSON.parse(raw);
    return {
      note: data.note ?? { title:'', body:'', updatedAt: 0 },
      websites: Array.isArray(data.websites) ? data.websites : [],
      subs: Array.isArray(data.subs) ? data.subs : [],
    };
  } catch {
    return { note: { title:'', body:'', updatedAt: 0 }, websites: [], subs: [] };
  }
}

function save(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

let state = load();

/* ---------- Toast ---------- */
let toastT = 0;
function toast(msg) {
  clearTimeout(toastT);
  el.toast.textContent = msg;
  el.toast.classList.add('on');
  toastT = setTimeout(() => el.toast.classList.remove('on'), 1600);
}

/* ---------- Date helpers (local safe) ---------- */
function parseISODateLocal(iso) {
  // iso: "YYYY-MM-DD"
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]) - 1, d = Number(m[3]);
  const dt = new Date(y, mo, d);
  dt.setHours(0,0,0,0);
  return dt;
}

function toISODateLocal(dt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function daysUntil(isoDate) {
  const d = parseISODateLocal(isoDate);
  if (!d) return null;
  const today = new Date();
  today.setHours(0,0,0,0);
  const diff = d.getTime() - today.getTime();
  return Math.ceil(diff / 86400000);
}

function addMonthsLocal(iso, n) {
  const d = parseISODateLocal(iso);
  if (!d) return iso;
  const day = d.getDate();
  d.setMonth(d.getMonth() + n);

  // clamp for month overflow (e.g., Jan 31 -> Feb)
  while (d.getDate() < day) d.setDate(d.getDate() - 1);
  return toISODateLocal(d);
}

function addYearsLocal(iso, n) {
  const d = parseISODateLocal(iso);
  if (!d) return iso;
  d.setFullYear(d.getFullYear() + n);
  return toISODateLocal(d);
}

function fmtDate(iso) {
  const d = parseISODateLocal(iso);
  if (!d) return '—';
  return d.toLocaleDateString(undefined, { year:'numeric', month:'short', day:'2-digit' });
}

function cleanUrl(url) {
  let u = String(url || '').trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try { new URL(u); return u; } catch { return ''; }
}

function clip(text) {
  navigator.clipboard?.writeText(String(text || '')).then(() => toast('Copied'));
}

/* ---------- Notes ---------- */
let noteDirty = false;
let noteDebounce = 0;

function updateNoteMeta() {
  const n = state.note;
  const chars = (n.body || '').length;
  const saved = n.updatedAt ? new Date(n.updatedAt).toLocaleString() : '—';
  el.noteMeta.textContent = `${chars} chars · ${saved}`;
}

function setNoteStatus(text) {
  el.noteStatus.textContent = text;
}

function writeNoteFromUI() {
  state.note.title = el.noteTitle.value;
  state.note.body = el.noteBody.value;
}

function saveNote() {
  writeNoteFromUI();
  state.note.updatedAt = now();
  save(state);
  noteDirty = false;
  setNoteStatus('Saved');
  updateNoteMeta();
  toast('Note saved');
}

function scheduleAutosave() {
  noteDirty = true;
  setNoteStatus('Typing…');
  clearTimeout(noteDebounce);
  noteDebounce = setTimeout(() => {
    if (!noteDirty) return;
    saveNote();
  }, 520);
}

/* ---------- Websites ---------- */
function webBadgeChar(label, url) {
  const t = String(label || '').trim();
  if (t) return t[0].toUpperCase();
  try {
    const host = new URL(url).hostname.replace(/^www\./,'');
    return (host[0] || '•').toUpperCase();
  } catch {
    return '•';
  }
}

function renderWebsites() {
  el.webCount.textContent = String(state.websites.length);

  if (!state.websites.length) {
    el.webList.innerHTML = `<div class="item"><div class="main"><div class="title">No websites yet</div><div class="meta">Add one above.</div></div></div>`;
    return;
  }

  const items = [...state.websites].sort((a,b) => (a.label || a.url).localeCompare(b.label || b.url));
  el.webList.innerHTML = items.map(w => {
    const badge = webBadgeChar(w.label, w.url);
    const title = (w.label || w.url);
    return `
      <div class="item" role="listitem">
        <div class="badge" aria-hidden="true" style="display:flex;align-items:center;justify-content:center;font-weight:900;color:#000;font-size:11px;">
          ${badge}
        </div>
        <div class="main">
          <div class="title"><a href="${escapeAttr(w.url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(title)}</a></div>
          <div class="meta">${escapeHTML(w.url)}</div>
        </div>
        <div class="pills">
          <button class="pill" data-act="copy" data-id="${w.id}" type="button">Copy</button>
          <button class="pill" data-act="del" data-id="${w.id}" type="button">Remove</button>
        </div>
      </div>
    `;
  }).join('');
}

function addWebsite(label, url) {
  const clean = cleanUrl(url);
  if (!clean) { toast('Invalid URL'); return; }
  state.websites.push({ id: now(), label: (label || '').trim(), url: clean, createdAt: now() });
  save(state);
  renderWebsites();
  toast('Website added');
}

/* ---------- Subscriptions ---------- */
function normalizeSubs() {
  // Keep “next renewal” sane: if date is in the past, roll forward based on cycle.
  let changed = false;
  for (const s of state.subs) {
    let d = daysUntil(s.renewal);
    if (d === null) continue;

    if (d < 0) {
      // roll until future (bounded)
      let guard = 0;
      while (d < 0 && guard < 36) {
        s.renewal = (s.cycle === 'yearly')
          ? addYearsLocal(s.renewal, 1)
          : addMonthsLocal(s.renewal, 1);
        d = daysUntil(s.renewal);
        guard++;
      }
      changed = true;
    }
  }
  if (changed) save(state);
}

function urgencyClass(days) {
  if (days === null) return '';
  if (days <= 0) return 'is-due';
  if (days <= 3) return 'is-soon';
  return '';
}

function renderSubs() {
  normalizeSubs();
  el.subCount.textContent = String(state.subs.length);

  if (!state.subs.length) {
    el.subList.innerHTML = `<div class="item"><div class="main"><div class="title">No subscriptions yet</div><div class="meta">Add one above.</div></div></div>`;
    return;
  }

  const items = [...state.subs].sort((a,b) => String(a.renewal).localeCompare(String(b.renewal)));
  el.subList.innerHTML = items.map(s => {
    const d = daysUntil(s.renewal);
    const when =
      d === null ? '—' :
      d === 0 ? 'Renews today' :
      d > 0 ? `${d} day${d===1?'':'s'} remaining` :
      `Overdue`;

    const amt = String(s.amount || '').trim();
    const metaParts = [
      `${s.cycle === 'yearly' ? 'Yearly' : 'Monthly'}`,
      `Next: ${fmtDate(s.renewal)}`,
      when
    ];
    if (amt) metaParts.unshift(amt);

    return `
      <div class="item ${urgencyClass(d)}" role="listitem">
        <div class="badge" aria-hidden="true"></div>
        <div class="main">
          <div class="title">${escapeHTML(s.name)}</div>
          <div class="meta">${metaParts.map(escapeHTML).join(' · ')}</div>
        </div>
        <div class="pills">
          <button class="pill" data-act="paid" data-id="${s.id}" type="button">Mark paid</button>
          <button class="pill" data-act="copy" data-id="${s.id}" type="button">Copy</button>
          <button class="pill" data-act="del" data-id="${s.id}" type="button">Remove</button>
        </div>
      </div>
    `;
  }).join('');
}

function addSub({ name, amount, cycle, renewal }) {
  const dt = parseISODateLocal(renewal);
  if (!dt) { toast('Pick a valid renewal date'); return; }

  state.subs.push({
    id: now(),
    name: String(name).trim(),
    amount: String(amount || '').trim(),
    cycle: (cycle === 'yearly') ? 'yearly' : 'monthly',
    renewal: toISODateLocal(dt),
    createdAt: now(),
  });

  save(state);
  renderSubs();
  toast('Subscription added');
}

function markPaid(subId) {
  const s = state.subs.find(x => String(x.id) === String(subId));
  if (!s) return;

  s.renewal = (s.cycle === 'yearly')
    ? addYearsLocal(s.renewal, 1)
    : addMonthsLocal(s.renewal, 1);

  save(state);
  renderSubs();
  toast('Renewal advanced');
}

/* ---------- Export / Import / Clear ---------- */
function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function doExport() {
  const payload = JSON.stringify(state, null, 2);
  const stamp = new Date().toISOString().slice(0,10);
  download(`bndr-void-${stamp}.json`, payload, 'application/json');
  toast('Exported');
}

function doImport(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const incoming = JSON.parse(String(r.result || ''));
      const next = {
        note: incoming.note ?? { title:'', body:'', updatedAt: 0 },
        websites: Array.isArray(incoming.websites) ? incoming.websites : [],
        subs: Array.isArray(incoming.subs) ? incoming.subs : [],
      };
      state = next;
      save(state);
      hydrate();
      toast('Imported');
    } catch {
      toast('Invalid JSON');
    }
  };
  r.readAsText(file);
}

function doClear() {
  if (!confirm('Clear all BNDR data on this device?')) return;
  localStorage.removeItem(KEY);
  state = load();
  hydrate();
  toast('Cleared');
}

/* ---------- Escaping ---------- */
function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
function escapeAttr(s) { return escapeHTML(s).replace(/"/g, '&quot;'); }

/* ---------- UI Wiring ---------- */
function hydrate() {
  el.noteTitle.value = state.note.title || '';
  el.noteBody.value = state.note.body || '';
  setNoteStatus(state.note.updatedAt ? 'Ready' : 'Idle');
  updateNoteMeta();
  renderWebsites();
  renderSubs();
}

/* Notes events */
el.noteTitle.addEventListener('input', scheduleAutosave);
el.noteBody.addEventListener('input', scheduleAutosave);
el.btnNoteSave.addEventListener('click', saveNote);

/* Websites form */
el.webForm.addEventListener('submit', (e) => {
  e.preventDefault();
  addWebsite(el.webLabel.value, el.webUrl.value);
  el.webLabel.value = '';
  el.webUrl.value = '';
});

/* Websites list actions */
el.webList.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const id = btn.getAttribute('data-id');
  const act = btn.getAttribute('data-act');
  const w = state.websites.find(x => String(x.id) === String(id));
  if (!w) return;

  if (act === 'copy') clip(w.url);
  if (act === 'del') {
    state.websites = state.websites.filter(x => String(x.id) !== String(id));
    save(state);
    renderWebsites();
    toast('Removed');
  }
});

/* Subscriptions form */
el.subForm.addEventListener('submit', (e) => {
  e.preventDefault();
  addSub({
    name: el.subName.value,
    amount: el.subAmount.value,
    cycle: el.subCycle.value,
    renewal: el.subDate.value
  });
  el.subName.value = '';
  el.subAmount.value = '';
  el.subCycle.value = 'monthly';
  el.subDate.value = '';
});

/* Subscriptions list actions */
el.subList.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const id = btn.getAttribute('data-id');
  const act = btn.getAttribute('data-act');
  const s = state.subs.find(x => String(x.id) === String(id));
  if (!s) return;

  if (act === 'paid') markPaid(id);
  if (act === 'copy') clip(`${s.name} · ${s.cycle} · ${fmtDate(s.renewal)}`);
  if (act === 'del') {
    state.subs = state.subs.filter(x => String(x.id) !== String(id));
    save(state);
    renderSubs();
    toast('Removed');
  }
});

/* Export / Import / Clear */
el.btnExport.addEventListener('click', doExport);
el.btnClear.addEventListener('click', doClear);
el.importFile.addEventListener('change', (e) => {
  const f = e.target.files?.[0];
  if (f) doImport(f);
  e.target.value = '';
});

/* Keyboard: Cmd/Ctrl+S saves note */
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    saveNote();
  }
});

/* Boot */
hydrate();
