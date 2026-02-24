'use strict';

/* ============================================================
   BNDR — VOID GLASS (NO LIBS)
   - Websites list
   - Subscriptions list (separate) w/ renewal logic:
       advance: fixed | rolling | interval (custom days)
       cycle: monthly | yearly
     Mark paid respects advance rule + cycle/interval
   - Monthly total row (yearly->monthly)
   - Calculator
   - Surface toggle: void <-> charcoal
============================================================ */

const KEY = 'bndr_void_v2';
const PREF = 'bndr_void_prefs_v1';

const $ = (id) => document.getElementById(id);

const el = {
  // surface
  btnSurface: $('btn-surface'),
  surfaceLabel: $('surface-label'),

  // notes
  noteTitle: $('note-title'),
  noteBody: $('note-body'),
  noteStatus: $('note-status'),
  noteMeta: $('note-meta'),
  btnNoteSave: $('btn-note-save'),

  // websites
  webForm: $('web-form'),
  webLabel: $('web-label'),
  webUrl: $('web-url'),
  webList: $('web-list'),
  webCount: $('web-count'),

  // subs
  subForm: $('sub-form'),
  subName: $('sub-name'),
  subAmount: $('sub-amount'),
  subCycle: $('sub-cycle'),
  subAdvance: $('sub-advance'),
  subInterval: $('sub-interval'),
  subDate: $('sub-date'),
  subList: $('sub-list'),
  subCount: $('sub-count'),
  subMonthly: $('sub-monthly'),
  subSoon: $('sub-soon'),

  // export/import/clear
  btnExport: $('btn-export'),
  btnClear: $('btn-clear'),
  importFile: $('import-file'),

  // toast
  toast: $('toast'),

  // calc
  calcExpr: $('calc-expr'),
  calcRes: $('calc-res'),
  calcGrid: document.querySelector('.calc-grid'),
  calcCopy: $('calc-copy'),
};

function now() { return Date.now(); }

/* ---------- Prefs (surface) ---------- */
function loadPrefs(){
  try{ return JSON.parse(localStorage.getItem(PREF) || '{}'); } catch { return {}; }
}
function savePrefs(p){ localStorage.setItem(PREF, JSON.stringify(p)); }
let prefs = loadPrefs();

function setSurface(mode){
  const m = (mode === 'charcoal') ? 'charcoal' : 'void';
  document.documentElement.setAttribute('data-surface', m);
  el.surfaceLabel.textContent = (m === 'charcoal') ? 'Charcoal' : 'Void';
  prefs.surface = m;
  savePrefs(prefs);
}

/* ---------- State ---------- */
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
function save(state) { localStorage.setItem(KEY, JSON.stringify(state)); }
let state = load();

/* ---------- Toast ---------- */
let toastT = 0;
function toast(msg) {
  clearTimeout(toastT);
  el.toast.textContent = String(msg || '');
  el.toast.classList.add('on');
  toastT = setTimeout(() => el.toast.classList.remove('on'), 1600);
}

/* ---------- Date helpers ---------- */
function parseISODateLocal(iso) {
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
function todayISO(){
  const t = new Date();
  t.setHours(0,0,0,0);
  return toISODateLocal(t);
}
function daysUntil(isoDate) {
  const d = parseISODateLocal(isoDate);
  if (!d) return null;
  const today = new Date();
  today.setHours(0,0,0,0);
  const diff = d.getTime() - today.getTime();
  return Math.ceil(diff / 86400000);
}
function addDaysLocal(iso, n){
  const d = parseISODateLocal(iso);
  if(!d) return iso;
  d.setDate(d.getDate() + n);
  return toISODateLocal(d);
}
function addMonthsLocal(iso, n) {
  const d = parseISODateLocal(iso);
  if (!d) return iso;
  const day = d.getDate();
  d.setMonth(d.getMonth() + n);
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

/* ---------- Escaping ---------- */
function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
function escapeAttr(s) { return escapeHTML(s).replace(/"/g, '&quot;'); }

/* ---------- Notes ---------- */
let noteDirty = false;
let noteDebounce = 0;

function updateNoteMeta() {
  const n = state.note;
  const chars = (n.body || '').length;
  const saved = n.updatedAt ? new Date(n.updatedAt).toLocaleString() : '—';
  el.noteMeta.textContent = `${chars} chars · ${saved}`;
}
function setNoteStatus(text) { el.noteStatus.textContent = text; }

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
function cleanUrl(url) {
  let u = String(url || '').trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try { new URL(u); return u; } catch { return ''; }
}
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
        <div class="badge" aria-hidden="true" style="display:flex;align-items:center;justify-content:center;font-weight:950;color:#000;font-size:11px;">
          ${escapeHTML(badge)}
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
function parseAmount(raw){
  const s = String(raw||'').trim();
  if(!s) return null;
  const n = parseFloat(s.replace(/[^0-9.]/g,''));
  return Number.isFinite(n) ? n : null;
}
function fmtMoney(n){
  if(!Number.isFinite(n)) return '$0.00';
  return n.toLocaleString(undefined, { style:'currency', currency:'USD' });
}
function urgencyClass(days) {
  if (days === null) return '';
  if (days <= 0) return 'is-due';
  if (days <= 3) return 'is-soon';
  return '';
}
function nextRenewalISO(sub){
  // Normalize overdue behavior:
  // - fixed: keep stepping from renewal date
  // - rolling: if overdue, set to today + period (one step)
  // - interval: step by interval days from renewal date
  const d = daysUntil(sub.renewal);
  if(d === null) return sub.renewal;

  if(d >= 0) return sub.renewal;

  const adv = sub.advance || 'fixed';
  if(adv === 'rolling'){
    const base = todayISO();
    return advanceFrom(base, sub);
  }

  // fixed/interval: step forward until future (guarded)
  let cur = sub.renewal;
  let guard = 0;
  while(daysUntil(cur) < 0 && guard < 60){
    cur = advanceFrom(cur, sub);
    guard++;
  }
  return cur;
}
function advanceFrom(baseISO, sub){
  const adv = sub.advance || 'fixed';
  if(adv === 'interval'){
    const k = Number(sub.intervalDays || 30);
    const days = (Number.isFinite(k) && k > 0) ? Math.floor(k) : 30;
    return addDaysLocal(baseISO, days);
  }
  // monthly/yearly by cycle
  if(sub.cycle === 'yearly') return addYearsLocal(baseISO, 1);
  return addMonthsLocal(baseISO, 1);
}
function computeMonthlyTotal(){
  let total = 0;
  let hasAny = false;
  for(const s of state.subs){
    const amt = parseAmount(s.amount);
    if(amt === null) continue;
    hasAny = true;

    if((s.advance || 'fixed') === 'interval'){
      const k = Number(s.intervalDays || 30);
      const days = (Number.isFinite(k) && k > 0) ? k : 30;
      // Monthly equiv via average month length
      total += amt * (30.4375 / days);
    } else if(s.cycle === 'yearly'){
      total += (amt / 12);
    } else {
      total += amt;
    }
  }
  el.subMonthly.textContent = hasAny ? fmtMoney(total) : '$0.00';
}
function computeDueSoon(){
  let soon = 0;
  for(const s of state.subs){
    const next = nextRenewalISO(s);
    const d = daysUntil(next);
    if(d !== null && d >= 0 && d <= 3) soon++;
    if(d !== null && d <= 0) soon++; // due today/overdue also counts
  }
  el.subSoon.textContent = String(soon);
}

function renderSubs() {
  // normalize renewals
  let changed = false;
  for(const s of state.subs){
    const next = nextRenewalISO(s);
    if(next !== s.renewal){
      s.renewal = next;
      changed = true;
    }
  }
  if(changed) save(state);

  el.subCount.textContent = String(state.subs.length);
  computeMonthlyTotal();
  computeDueSoon();

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
    const adv = s.advance || 'fixed';
    const advLabel = adv === 'rolling' ? 'Rolling' : (adv === 'interval' ? `Interval${s.intervalDays?` (${s.intervalDays}d)`:''}` : 'Fixed');

    const metaParts = [];
    if (amt) metaParts.push(amt);
    metaParts.push(s.cycle === 'yearly' ? 'Yearly' : 'Monthly');
    metaParts.push(advLabel);
    metaParts.push(`Next: ${fmtDate(s.renewal)}`);
    metaParts.push(when);

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

function addSub({ name, amount, cycle, advance, intervalDays, renewal }) {
  const dt = parseISODateLocal(renewal);
  if (!dt) { toast('Pick a valid renewal date'); return; }

  const adv = (advance === 'rolling' || advance === 'interval') ? advance : 'fixed';
  const interval = adv === 'interval' ? Math.max(1, Math.min(9999, parseInt(intervalDays, 10) || 30)) : null;

  state.subs.push({
    id: now(),
    name: String(name).trim(),
    amount: String(amount || '').trim(),
    cycle: (cycle === 'yearly') ? 'yearly' : 'monthly',
    advance: adv,
    intervalDays: interval,
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

  const adv = s.advance || 'fixed';
  const base = (adv === 'rolling') ? todayISO() : s.renewal;
  s.renewal = advanceFrom(base, s);

  save(state);
  renderSubs();
  toast('Renewal advanced');
}

/* Renewal UI: interval field visibility */
function syncIntervalUI(){
  const isInterval = el.subAdvance.value === 'interval';
  el.subInterval.style.display = isInterval ? '' : 'none';
  el.subInterval.toggleAttribute('required', isInterval);
  if(!isInterval) el.subInterval.value = '';
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

/* ---------- Clipboard ---------- */
function clip(text) {
  navigator.clipboard?.writeText(String(text || '')).then(() => toast('Copied'));
}

/* ---------- Calculator ---------- */
let cExpr = '';
let cDone = false;

function calcRender(){
  el.calcExpr.textContent = cExpr;
  el.calcRes.textContent = cExpr || '0';
}
function calcClear(){
  cExpr=''; cDone=false;
  el.calcExpr.textContent = '';
  el.calcRes.textContent = '0';
}
function calcIn(v){
  const ops = ['+','−','×','÷','%'];
  if(cDone && !ops.includes(v)) cExpr='';
  cDone=false;
  cExpr += v;
  calcRender();
}
function calcPM(){
  const m = cExpr.match(/(-?\d+\.?\d*)$/);
  if(m){
    cExpr = cExpr.slice(0, cExpr.length - m[0].length) + String(-parseFloat(m[0]));
    calcRender();
  }
}
function calcEq(){
  if(!cExpr) return;
  try{
    const safe = cExpr
      .replace(/×/g,'*')
      .replace(/÷/g,'/')
      .replace(/−/g,'-')
      .replace(/[^0-9+\-*/%.() ]/g,''); // hard filter
    const res = Function('"use strict"; return ('+safe+')')();
    const out = Number.isFinite(res) ? parseFloat(res.toFixed(10)).toString() : 'Error';
    el.calcExpr.textContent = cExpr + ' =';
    el.calcRes.textContent = out;
    cExpr = (out === 'Error') ? '' : out;
    cDone = true;
  }catch{
    el.calcRes.textContent = 'Error';
    cExpr = '';
  }
}
function calcCopy(){
  clip(el.calcRes.textContent || '0');
}

/* ---------- UI Wiring ---------- */
function hydrate() {
  // surface
  setSurface(prefs.surface || 'void');

  // notes
  el.noteTitle.value = state.note.title || '';
  el.noteBody.value = state.note.body || '';
  setNoteStatus(state.note.updatedAt ? 'Ready' : 'Idle');
  updateNoteMeta();

  // lists
  renderWebsites();
  syncIntervalUI();
  renderSubs();

  // calc
  calcClear();
}

/* Surface toggle */
el.btnSurface.addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-surface') || 'void';
  setSurface(cur === 'void' ? 'charcoal' : 'void');
});

/* Notes */
el.noteTitle.addEventListener('input', scheduleAutosave);
el.noteBody.addEventListener('input', scheduleAutosave);
el.btnNoteSave.addEventListener('click', saveNote);

/* Websites */
el.webForm.addEventListener('submit', (e) => {
  e.preventDefault();
  addWebsite(el.webLabel.value, el.webUrl.value);
  el.webLabel.value = '';
  el.webUrl.value = '';
});
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

/* Subs */
el.subAdvance.addEventListener('change', syncIntervalUI);

el.subForm.addEventListener('submit', (e) => {
  e.preventDefault();
  addSub({
    name: el.subName.value,
    amount: el.subAmount.value,
    cycle: el.subCycle.value,
    advance: el.subAdvance.value,
    intervalDays: el.subInterval.value,
    renewal: el.subDate.value
  });
  el.subName.value = '';
  el.subAmount.value = '';
  el.subCycle.value = 'monthly';
  el.subAdvance.value = 'fixed';
  el.subDate.value = '';
  el.subInterval.value = '';
  syncIntervalUI();
});

el.subList.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const id = btn.getAttribute('data-id');
  const act = btn.getAttribute('data-act');
  const s = state.subs.find(x => String(x.id) === String(id));
  if (!s) return;

  if (act === 'paid') markPaid(id);
  if (act === 'copy') clip(`${s.name} · ${s.cycle} · ${s.advance||'fixed'} · ${fmtDate(s.renewal)}`);
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

/* Calculator click */
el.calcGrid.addEventListener('click', (e)=>{
  const b = e.target.closest('button[data-k]');
  if(!b) return;
  const k = b.getAttribute('data-k');
  if(k === 'C') return calcClear();
  if(k === 'PM') return calcPM();
  if(k === '=') return calcEq();
  calcIn(k);
});
el.calcCopy.addEventListener('click', calcCopy);

/* Keyboard shortcuts:
   - Cmd/Ctrl+S saves note
   - Calculator keys only when not typing in inputs */
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    saveNote();
    return;
  }

  const tag = document.activeElement?.tagName;
  if(tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

  const k = e.key;
  if('0123456789.'.includes(k)) calcIn(k);
  else if(k==='+') calcIn('+');
  else if(k==='-') calcIn('−');
  else if(k==='*') calcIn('×');
  else if(k==='/'){ e.preventDefault(); calcIn('÷'); }
  else if(k==='Enter' || k==='=') calcEq();
  else if(k==='Backspace'){ cExpr = cExpr.slice(0,-1); calcRender(); }
  else if(k==='Escape') calcClear();
});

/* Boot */
hydrate();
