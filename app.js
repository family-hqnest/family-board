'use strict';
// ════════════════════════════════════════════════════════════
//  Chore Club — family chores, allowance, points & rewards
//  Data lives in Supabase (board_state, id='family') and is
//  cached in localStorage. Same data shape as the old board.
// ════════════════════════════════════════════════════════════

// ── CONFIG ───────────────────────────────────────────────────
const SUPABASE_URL = 'https://fjvhkiynqejnbdbfwyxx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqdmhraXlucWVqbmJkYmZ3eXh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MTQ2OTUsImV4cCI6MjA4OTA5MDY5NX0.Rk2APihye1Zut-k5Wmm7Kn3NmIWIvM74srtBM-8vjA4';
const FAMILY_ID    = 'family';
const STORAGE_KEY  = 'famboard-v1';
const UI_KEY       = 'choreclub-ui';
const PULL_EVERY   = 20000;   // ms between checks for changes from other devices
const AUTO_APPROVE_H = 48;
const TEAM_PTS_PER_CHORE = 10;

// ── HELPERS ──────────────────────────────────────────────────
const SUBJECTS  = ['Math', 'English', 'Science', 'History'];
const DAYS      = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const LEVELS    = ['Rookie', 'Rising Star', 'Champion', 'Legend', 'Superstar'];
const gradeRank = { A: 4, B: 3, C: 2, D: 1, F: 0 };
const KID_CLS   = ['k0', 'k1'];

const now     = () => Date.now();
const uid     = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
const money   = n => '$' + Number(n || 0).toFixed(2);
const esc     = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const todayIdx = () => (new Date().getDay() + 6) % 7;
const dateKey = (d = new Date()) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const el      = id => document.getElementById(id);
const isKid   = k => k === 0 || k === 1;
const hrsAgo  = ts => { const h = Math.floor((now() - ts) / 3600000); return h < 1 ? 'just now' : h < 24 ? h + 'h ago' : Math.floor(h / 24) + 'd ago'; };
const mins    = m => { m = Math.max(0, Math.round(m)); const h = Math.floor(m / 60), r = m % 60; return h ? h + 'h' + (r ? ' ' + r + 'm' : '') : r + 'm'; };

function weekLabel() {
  const d = new Date(), mon = new Date(d);
  mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const f = x => x.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return f(mon) + ' - ' + f(sun);
}

// ── DEFAULT STATE ────────────────────────────────────────────
function makeKid() {
  const subjects = {};
  SUBJECTS.forEach(s => { subjects[s] = { current: 'B', baseline: 'B' }; });
  return { xp: 0, streak: 0, subjects, points: 0, weekPoints: 0, screenMinsUsed: 0, screenMinsBonus: 0, activeDays: [] };
}
function defaultActivities() {
  return [
    ['30 min outdoor activity', 15], ['Read for 30 min', 10], ['Cook a meal or snack', 20],
    ['Creative project (art, music)', 15], ['In-person hangout with friend', 20],
    ['Exercise / sport (30+ min)', 20], ['Learn something new (30 min)', 15]
  ].map(([name, points]) => ({ id: uid(), name, points }));
}
function defaultRewards() {
  return [
    ['+30 min screen time', 10], ['+1 hour screen time', 20], ['Pick family movie', 15],
    ['Choose family dinner', 25], ['Stay up 30 min later', 30], ['Skip one chore', 40], ['Special outing of choice', 100]
  ].map(([name, cost]) => ({ id: uid(), name, cost }));
}
function defaultState() {
  return {
    names: ['Sofia', 'Juliana'], emojis: ['🌸', '🌻'],
    maxPay: 30, base: 20, week: weekLabel(), pin: null,
    kids: [makeKid(), makeKid()],
    chores: [], logs: [], bank: [],
    screenTimeBase: 360,
    activities: defaultActivities(),
    rewards: [defaultRewards(), defaultRewards()],
    pendingRewards: [], pointSubmissions: [],
    teamGoal: { name: 'Family pizza night', emoji: '🍕', target: 400 },
    teamPoints: 0,
    penalties: [],
    alertHours: [17, 20]
  };
}

// Fill in anything missing so older saved data keeps working.
function normalize(s) {
  const d = defaultState();
  if (!s || typeof s !== 'object') return d;
  for (const k of Object.keys(d)) if (s[k] === undefined || s[k] === null) s[k] = d[k];
  if (!Array.isArray(s.names) || s.names.length < 2) s.names = d.names;
  if (!Array.isArray(s.emojis) || s.emojis.length < 2) s.emojis = d.emojis;
  if (!Array.isArray(s.kids)) s.kids = [];
  while (s.kids.length < 2) s.kids.push(makeKid());
  s.kids.forEach(k => {
    const m = makeKid();
    for (const key of Object.keys(m)) if (k[key] === undefined || k[key] === null) k[key] = m[key];
    SUBJECTS.forEach(sub => { if (!k.subjects[sub]) k.subjects[sub] = { current: 'B', baseline: 'B' }; });
    if (!Array.isArray(k.activeDays)) k.activeDays = [];
  });
  ['chores', 'logs', 'bank', 'activities', 'pendingRewards', 'pointSubmissions', 'penalties'].forEach(k => { if (!Array.isArray(s[k])) s[k] = d[k]; });
  if (!Array.isArray(s.rewards) || s.rewards.length < 2) s.rewards = [defaultRewards(), defaultRewards()];
  s.rewards = s.rewards.map(list => Array.isArray(list) ? list : []);
  s.rewards.forEach(list => list.forEach(r => { if (!r.id) r.id = uid(); }));
  s.activities.forEach(a => { if (!a.id) a.id = uid(); });
  s.pendingRewards.forEach(r => { if (!r.id) r.id = uid(); });
  s.chores.forEach(c => {
    if (!c.id) c.id = uid();
    if (!c.status) c.status = 'none';
    if (!c.weight) c.weight = 1;
    if (!c.baseName) c.baseName = String(c.name || '').split(' - ')[0].split(' (')[0];
    if (c.freq === 'daily' && c.day === undefined) {
      const m = / - (Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/.exec(c.name || '');
      if (m) c.day = DAYS.indexOf(m[1]);
    }
  });
  s.bank.forEach(b => {
    if (!b.pays) b.pays = b.extra ? 'extra' : 'allowance';
    if (!Array.isArray(b.auto)) b.auto = [];
    if (b.pays === 'points' && !b.points) b.points = 10;
    if (!b.weight) b.weight = 1;
    delete b.kid;
  });
  s.chores.forEach(c => { if (c.rare && !c.points) c.points = 10; });
  if (typeof s.teamGoal !== 'object') s.teamGoal = d.teamGoal;
  if (typeof s.teamPoints !== 'number') s.teamPoints = 0;
  if (typeof s.base !== 'number') s.base = 20;
  if (typeof s.maxPay !== 'number') s.maxPay = 30;
  if (!s.screenTimeBase) s.screenTimeBase = 360;
  if (!Array.isArray(s.alertHours)) s.alertHours = [17, 20];
  return s;
}

// ── SYNC (Supabase + local cache) ───────────────────────────
let S = defaultState();
let lastRemoteAt = 0, dirty = false, saving = false, saveTimer = null, syncStatus = 'saving';

const db = {
  h: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
  async load() {
    const r = await fetch(SUPABASE_URL + '/rest/v1/board_state?id=eq.' + FAMILY_ID + '&select=data,updated_at', { headers: this.h, cache: 'no-store' });
    if (!r.ok) throw new Error('Load failed: HTTP ' + r.status);
    const rows = await r.json();
    return rows[0] || null;
  },
  async save(state) {
    const at = new Date().toISOString();
    const r = await fetch(SUPABASE_URL + '/rest/v1/board_state', {
      method: 'POST',
      headers: { ...this.h, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ id: FAMILY_ID, data: state, updated_at: at })
    });
    if (!r.ok) throw new Error('Save failed: HTTP ' + r.status);
    return Date.parse(at);
  }
};

function cacheLocal() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(S)); } catch (e) {} }
function setSync(status) {
  syncStatus = status;
  const d = el('syncDot');
  if (d) { d.className = 'sync ' + status; d.title = { saved: 'Synced', saving: 'Syncing…', error: 'Offline — saved on this device' }[status] || ''; }
  const b = el('offlineBanner');
  if (b) b.hidden = status !== 'error';
}

async function loadState() {
  try {
    const row = await db.load();
    if (row && row.data) { lastRemoteAt = Date.parse(row.updated_at) || 0; setSync('saved'); return normalize(row.data); }
    setSync('saved');
  } catch (e) { console.warn(e); setSync('error'); }
  try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) return normalize(JSON.parse(raw)); } catch (e) {}
  return defaultState();
}

function save() {
  dirty = true;
  cacheLocal();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 250);
}
async function flush() {
  if (saving) { saveTimer = setTimeout(flush, 300); return; }
  saving = true; setSync('saving');
  try {
    lastRemoteAt = await db.save(JSON.parse(JSON.stringify(S)));
    dirty = false; setSync('saved');
  } catch (e) { console.warn(e); setSync('error'); }
  finally { saving = false; }
}
async function pull() {
  if (document.hidden) return;
  if (dirty && !saving) { flush(); return; }
  if (saving || el('modal').open) return;
  const a = document.activeElement;
  if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) return;
  try {
    const row = await db.load();
    setSync('saved');
    if (!row || !row.data) return;
    const at = Date.parse(row.updated_at) || 0;
    if (at > lastRemoteAt + 500) { lastRemoteAt = at; S = normalize(row.data); cacheLocal(); render(); }
  } catch (e) { setSync('error'); }
}

// ── UI STATE (per device) ────────────────────────────────────
const ui = Object.assign({ who: 0, tabs: { kid: 'today', parent: 'inbox' }, seg: 'today', filter: 'all' }, (() => { try { return JSON.parse(localStorage.getItem(UI_KEY)) || {}; } catch (e) { return {}; } })());
let parentUnlocked = sessionStorage.getItem('cc-parent') === '1';
function saveUI() { try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch (e) {} }
const inParent = () => ui.who === 'parent' && parentUnlocked;
const tabKey = () => inParent() ? 'parent' : 'kid';

// ── PAYOUT MATH ──────────────────────────────────────────────
// $20 base split across the kid's regular chores. Rejected chores
// lose their share. Extra-credit chores add up to +$5, grade
// improvement adds $1.25 per improved subject (up to +$5).
// Rare chores pay bonus points instead of money.
// Disrespect: the week's chore money and grade bonus go to $0;
// extra-credit chores can still earn some back.
const isRegular = c => !c.extra && !c.rare;
const committedChores = i => S.chores.filter(c => c.kid === i && isRegular(c));
const penaltiesFor = i => (S.penalties || []).filter(p => p.kid === i);
// Weight (Worth 1×/2×/3×): a 2× chore earns twice the share of a 1× chore.
const cw = c => Math.max(1, Math.min(3, Number(c.weight) || 1));
const totalWeight = i => committedChores(i).reduce((s, c) => s + cw(c), 0);
function choreValue(i) { const w = totalWeight(i); return w ? S.base / w : 0; }
const choreShare = c => isKid(c.kid) && isRegular(c) ? choreValue(c.kid) * cw(c) : 0;
function gradeImprovementBonus(kid) {
  let b = 0;
  SUBJECTS.forEach(s => { if ((gradeRank[kid.subjects[s].current] || 0) > (gradeRank[kid.subjects[s].baseline] || 0)) b += 1.25; });
  return Math.min(5, b);
}
function gradeGrowthPct(kid) {
  let score = 0, max = 0;
  SUBJECTS.forEach(s => {
    const b = gradeRank[kid.subjects[s].baseline] || 0, c = gradeRank[kid.subjects[s].current] || 0;
    score += Math.max(0, b * 5 + (c - b) * 10); max += 60;
  });
  return max ? Math.round(score / max * 100) : 0;
}
function payoutParts(i) {
  const total = committedChores(i).length, val = choreValue(i);
  const rejList = S.chores.filter(c => c.kid === i && isRegular(c) && c.status === 'rejected');
  const rejected = rejList.length, rejectedAmt = rejList.reduce((s, c) => s + val * cw(c), 0);
  const weighted = committedChores(i).some(c => cw(c) > 1);
  const penalties = penaltiesFor(i), wiped = penalties.length > 0;
  const choreBefore = Math.max(0, S.base - rejectedAmt);
  const gradeBefore = gradeImprovementBonus(S.kids[i]);
  const choreEarned = wiped ? 0 : choreBefore;
  const grade = wiped ? 0 : gradeBefore;
  const extra = Math.min(5, S.chores.filter(c => c.kid === i && c.extra && c.status === 'approved').reduce((s, c) => s + (c.bonusDollars || 0), 0));
  const pay = Math.max(0, Math.min(S.maxPay, choreEarned + extra + grade));
  const approved = S.chores.filter(c => c.kid === i && isRegular(c) && c.status === 'approved').length;
  return { total, val, weighted, rejected, choreEarned, extra, grade, pay, approved, wiped, penalties, lost: wiped ? choreBefore + gradeBefore : 0, choreBefore };
}
const kidPayout = i => payoutParts(i).pay;

// ── CHORE HELPERS ────────────────────────────────────────────
const kidChores = i => S.chores.filter(c => c.kid === i || c.kid === 'shared');
const isDoneish = c => c.status === 'pending' || c.status === 'approved';
function todayList(i) {
  const t = todayIdx(), today = dateKey();
  return kidChores(i).filter(c => c.freq === 'daily'
    ? c.day === t
    : (c.status !== 'approved' || (c.approvedAt && dateKey(new Date(c.approvedAt)) === today) || (c.submittedAt && dateKey(new Date(c.submittedAt)) === today)));
}
function choreIcon(name) {
  const n = String(name).toLowerCase();
  const map = [
    [/bed/, '🛏️'], [/laundry|clothes|fold/, '🧺'], [/dish|kitchen|counter/, '🍽️'], [/dog|pet|cat|feed/, '🐶'],
    [/plant|water|garden|yard|lawn/, '🪴'], [/trash|garbage|recycl/, '🗑️'], [/vacuum|sweep|mop|floor/, '🧹'],
    [/room|tidy|clean|reset|organiz/, '🧽'], [/homework|study|school|math/, '📚'], [/read/, '📖'],
    [/cook|bake|meal|dinner|lunch|breakfast/, '🍳'], [/bath|toilet|sink|shower/, '🛁'], [/car|wash/, '🚗'],
    [/bag|backpack|pack/, '🎒'], [/teeth|brush/, '🪥'], [/practice|piano|guitar|music|instrument/, '🎹'],
    [/walk|run|exercise|sport|bike|swim/, '🏃‍♀️'], [/grocer|shop|list/, '🛒'], [/help|kind|neighbor/, '💛']
  ];
  for (const [re, e] of map) if (re.test(n)) return e;
  return '✨';
}
const icoBg = ['bg-purple', 'bg-gold', 'bg-blue', 'bg-green', 'bg-red'];
function hashIdx(s, n) { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % n; }

function expandChore(def) {
  const n = def.freq === 'daily' ? 7 : def.freq === 'twice-weekly' ? 2 : 1;
  for (let i = 0; i < n; i++) {
    S.chores.push({
      id: uid(),
      name: n === 1 ? def.name : def.freq === 'daily' ? def.name + ' - ' + DAYS[i] : def.name + ' (' + (i + 1) + '/2)',
      baseName: def.name, kid: def.kid, freq: def.freq || 'weekly',
      day: def.freq === 'daily' ? i : undefined,
      extra: def.pays ? def.pays === 'extra' : !!def.extra, rare: def.pays === 'points' || !!def.rare, points: def.pays === 'points' || def.rare ? (def.points || 10) : 0,
      bonusDollars: def.bonusDollars || 0, weight: Math.max(1, Math.min(3, Number(def.weight) || 1)), dod: def.dod || '', recurring: !!def.recurring,
      status: 'none', createdAt: now(), submittedAt: null
    });
  }
  return n;
}

function log(msg) { S.logs = [new Date().toLocaleString() + ': ' + msg, ...(S.logs || [])].slice(0, 150); }
const kidName = k => isKid(k) ? S.names[k] : 'Shared';

function autoApprove() {
  const cutoff = now() - AUTO_APPROVE_H * 3600000;
  let changed = false;
  S.chores.forEach(c => {
    if (c.status === 'pending' && c.submittedAt && c.submittedAt <= cutoff) {
      approveChore(c, true); changed = true;
    }
  });
  if (changed) save();
}
function approveChore(c, auto) {
  c.status = 'approved'; c.approvedAt = now();
  const who = isKid(c.kid) ? c.kid : (isKid(c.by) ? c.by : null);
  if (who !== null) S.kids[who].xp = (S.kids[who].xp || 0) + 1;
  if (c.rare && who !== null) { const k = S.kids[who]; k.points = (k.points || 0) + c.points; k.weekPoints = (k.weekPoints || 0) + c.points; }
  S.teamPoints = (S.teamPoints || 0) + TEAM_PTS_PER_CHORE + (c.rare ? c.points : 0);
  log((auto ? 'Auto-approved' : 'Approved') + ' "' + c.name + '"');
}
function markActive(i) {
  const k = S.kids[i], d = dateKey();
  if (!k.activeDays.includes(d)) k.activeDays = [...k.activeDays, d].slice(-60);
}
function streak(i) {
  const days = new Set(S.kids[i].activeDays || []);
  const d = new Date(); let n = 0;
  if (!days.has(dateKey(d))) d.setDate(d.getDate() - 1);
  while (days.has(dateKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
function availablePoints(i) {
  const held = S.pendingRewards.filter(r => r.kidIdx === i && r.status === 'pending').reduce((s, r) => s + r.cost, 0);
  return Math.max(0, (S.kids[i].points || 0) - held);
}
function screen(i) {
  const k = S.kids[i];
  const total = (S.screenTimeBase || 360) + (k.screenMinsBonus || 0);
  const used = k.screenMinsUsed || 0;
  return { total, used, left: Math.max(0, total - used), pct: total ? Math.min(100, used / total * 100) : 0 };
}
const pendingCounts = () => ({
  chores: S.chores.filter(c => c.status === 'pending').length,
  acts: S.pointSubmissions.filter(p => p.status === 'pending').length,
  rewards: S.pendingRewards.filter(r => r.status === 'pending').length
});

// ════════════════════════════════════════════════════════════
//  RENDER
// ════════════════════════════════════════════════════════════
function render() {
  autoApprove();
  const y = window.scrollY;
  const view = inParent() ? parentView() : kidView(isKid(ui.who) ? ui.who : 0);
  el('app').innerHTML = `<div class="shell">${header()}${view}</div>${tabbar()}`;
  setSync(syncStatus);
  window.scrollTo(0, y);
}

function header() {
  const k = isKid(ui.who) ? ui.who : -1;
  const chip = i => `<button class="who-chip ${!inParent() && k === i ? 'active' : ''}" data-act="who" data-who="${i}">
      <span class="av" style="--soft:var(--k${i}-soft)">${esc(S.emojis[i])}</span>${esc(S.names[i])}</button>`;
  return `<header class="top">
    <div class="brand-row">
      <div class="logo">✿</div>
      <div class="brand">chore club<span id="syncDot" class="sync ${syncStatus}"></span></div>
      <button class="parent-btn ${inParent() ? 'on' : ''}" data-act="who" data-who="parent">${inParent() ? '🔓 Parent' : '🔒 Parent'}</button>
    </div>
    <div class="who"><span class="who-label">${inParent() ? 'View as' : "Who's here?"}</span><div class="who-chips">${chip(0)}${chip(1)}</div></div>
    <div id="offlineBanner" class="banner red" ${syncStatus === 'error' ? '' : 'hidden'}>⚠️ Can't reach the cloud — changes are saved on this device and will sync when it's back.<button class="btn sm white" data-act="retry">Retry</button></div>
  </header>`;
}

function tabbar() {
  const p = inParent(), cur = ui.tabs[tabKey()];
  const pc = pendingCounts(), inbox = pc.chores + pc.acts + pc.rewards;
  const tabs = p
    ? [['inbox', '📥', 'Approvals', inbox], ['chores', '📋', 'Chores'], ['family', '👨‍👩‍👧', 'Family'], ['settings', '⚙️', 'Settings']]
    : [['today', '🏠', 'Today'], ['chores', '✅', 'My chores'], ['rewards', '🎁', 'Rewards'], ['team', '💜', 'Team goals']];
  return `<nav class="tabbar"><div class="tabbar-inner">${tabs.map(([id, ic, lbl, n]) =>
    `<button class="tab ${cur === id ? 'active' : ''}" data-act="tab" data-tab="${id}"><span class="ti">${ic}</span>${lbl}${n ? `<span class="count">${n}</span>` : ''}</button>`).join('')}</div></nav>`;
}

// ── Shared pieces ────────────────────────────────────────────
function ring(pct, label) {
  const r = 44, c = 2 * Math.PI * r, off = c * (1 - pct / 100);
  return `<div class="ring"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="${r}" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="9"/>
    <circle cx="50" cy="50" r="${r}" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}" style="transition:stroke-dashoffset .8s"/></svg>
    <div class="ring-label"><div class="ring-pct">${pct}%</div><div class="ring-sub">${label}</div></div></div>`;
}

function choreRow(c, mode) {
  // mode: 'kid' (tap circle to submit) or 'parent' (approve/reject/edit/delete)
  const display = mode === 'kid' && c.freq === 'daily' ? c.baseName : c.name;
  const val = c.rare ? '+' + c.points + ' pts' : c.extra ? '+' + money(c.bonusDollars) : isKid(c.kid) ? money(choreShare(c)) : 'shared';
  const meta = [];
  if (mode === 'parent' || c.kid === 'shared') meta.push(`<span class="tag ${isKid(c.kid) ? 'kid' + c.kid : 'shared'}">${esc(kidName(c.kid))}</span>`);
  if (mode === 'kid' && c.freq === 'daily' && c.day !== undefined) meta.push(`<span>${DAYS[c.day]}</span>`);
  if (isRegular(c) && cw(c) > 1) meta.push(`<span class="tag worth">×${cw(c)} worth</span>`);
  if (c.extra) meta.push('<span class="tag extra">⭐ extra</span>');
  if (c.rare) meta.push('<span class="tag extra">🌟 bonus points</span>');
  if (c.recurring) meta.push('<span>🔁</span>');
  if (c.status === 'pending') meta.push(`<span class="tag waiting">⏳ waiting for OK · ${hrsAgo(c.submittedAt)}</span>`);
  else if (c.status === 'approved') meta.push('<span class="tag ok">✓ approved</span>');
  else if (c.status === 'rejected') meta.push('<span class="tag no">↺ try again</span>');
  if (c.dod) meta.push(`<span class="${meta.length ? 'dot' : ''}">${esc(c.dod)}</span>`);
  const kidCls = isKid(c.kid) ? KID_CLS[c.kid] : '';
  const icon = `<div class="ico ${icoBg[hashIdx(c.baseName, icoBg.length)]}">${choreIcon(c.baseName)}</div>`;
  const body = `<div class="ci"><div class="cn">${esc(display)}</div><div class="cm">${meta.join('')}</div></div>`;
  if (mode === 'kid') {
    const glyph = { none: '', pending: '⏳', approved: '✓', rejected: '↺' }[c.status] || '';
    return `<div class="chore status-${c.status}">${icon}${body}<span class="pill ${c.status === 'approved' ? 'green' : ''}">${val}</span>
      <button class="check ${c.status}" data-act="kid-toggle" data-id="${c.id}" aria-label="Mark ${esc(display)} done">${glyph}</button></div>`;
  }
  const acts = c.status === 'pending'
    ? `<button class="ibtn ok" data-act="approve" data-id="${c.id}" aria-label="Approve">✓</button><button class="ibtn no" data-act="reject" data-id="${c.id}" aria-label="Reject">✗</button>`
    : c.status !== 'none' ? `<button class="ibtn" data-act="reset" data-id="${c.id}" title="Reset">↺</button>` : '';
  return `<div class="chore prow ${kidCls} status-${c.status}">${icon}${body}<div class="actions">${acts}
    <button class="ibtn" data-act="edit" data-id="${c.id}" aria-label="Edit">✏️</button>
    <button class="ibtn ghost" data-act="del" data-id="${c.id}" aria-label="Delete">🗑</button></div></div>`;
}

function penaltyNotice(i, parent) {
  const ps = penaltiesFor(i);
  if (!ps.length) return '';
  const p = payoutParts(i);
  const items = ps.map(x => `<div class="pen-item"><div><b>${esc(new Date(x.at).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }))}</b>${x.note ? ` — “${esc(x.note)}”` : ''}</div>
    ${parent ? `<button class="ibtn ghost" data-act="pen-del" data-id="${x.id}" title="Remove">✕</button>` : ''}</div>`).join('');
  return `<div class="penalty"><div class="pen-head">⚠️ ${parent ? 'Disrespect this week' : 'Allowance on hold this week'}</div>
    <div class="pen-text">${parent ? `Chore money and grade bonus are $0 (−${money(p.lost)}). Extra-credit chores can still earn up to $5 back.`
      : `Being disrespectful to Mom or Dad wipes this week's allowance. You can still earn some back with ⭐ extra-credit chores.`}</div>${items}</div>`;
}

function allowanceCard(i, compact) {
  const p = payoutParts(i);
  const pct = Math.min(100, p.pay / S.maxPay * 100), tick = S.base / S.maxPay * 100;
  const cls = p.pay < S.base * 0.5 ? 'danger' : p.pay < S.base ? 'warn' : '';
  return `<div class="card">
    <div class="card-head"><div><div class="card-title">💰 ${compact ? esc(S.names[i]) + "'s allowance" : 'Your allowance'}</div><div class="card-sub">Week of ${esc(S.week)}</div></div>
    <div class="money-big">${money(p.pay)}</div></div>
    <div class="bar"><div class="bar-fill ${cls}" style="width:${pct}%"></div><div class="bar-tick" style="left:${tick}%"></div></div>
    <div class="bar-labels"><span>$0</span><span>${money(S.base)} base</span><span>${money(S.maxPay)}</span></div>
    ${penaltyNotice(i, false)}
    <div class="lines">
      <div class="line"><span>Chores (${p.approved}/${p.total} approved · ${!p.total ? '—' : p.weighted ? money(p.val) + ' per 1×' : money(p.val) + ' each'})</span><span>${p.wiped ? '<s class="muted">' + money(p.choreBefore) + '</s> ' : ''}${money(p.choreEarned)}</span></div>
      ${p.rejected ? `<div class="line"><span>Try-again chores (${p.rejected})</span><span class="minus">−${money(S.base - p.choreBefore)}</span></div>` : ''}
      <div class="line"><span>Extra credit</span><span class="plus">+${money(p.extra)}</span></div>
      <div class="line"><span>Grade improvement</span><span class="plus">+${money(p.grade)}</span></div>
      <div class="line total"><span>This week</span><span>${money(p.pay)}</span></div>
    </div></div>`;
}

function screenCard(i, compact) {
  const s = screen(i);
  const cls = s.pct >= 90 ? 'danger' : s.pct >= 70 ? 'warn' : '';
  return `<div class="card">
    <div class="card-head"><div><div class="card-title">📱 Screen time</div><div class="card-sub">${compact ? esc(S.names[i]) + ' · ' : ''}Honor system — log it as you go</div></div>
    <div style="text-align:right"><div class="money-big" style="font-size:1.7rem">${mins(s.left)}</div><div class="small muted bold">left this week</div></div></div>
    <div class="bar"><div class="bar-fill ${cls}" style="width:${s.pct}%"></div></div>
    <div class="bar-labels"><span>${mins(s.used)} used</span><span>${mins(s.total)} total${S.kids[i].screenMinsBonus ? ' (incl. +' + mins(S.kids[i].screenMinsBonus) + ' earned)' : ''}</span></div>
    <div class="btn-row mt12"><button class="btn sm white" data-act="screen" data-k="${i}" data-n="-30">−30m</button><button class="btn sm soft" data-act="screen" data-k="${i}" data-n="30">+30m used</button></div>
  </div>`;
}

function gradesBlock(i) {
  const kid = S.kids[i];
  return `<div class="grades">${SUBJECTS.map(s => {
    const c = kid.subjects[s].current, b = kid.subjects[s].baseline, d = (gradeRank[c] || 0) - (gradeRank[b] || 0);
    const t = d > 0 ? '<span class="t plus">▲ +$1.25</span>' : d < 0 ? '<span class="t minus">▼</span>' : '<span class="t muted">—</span>';
    return `<div class="grade"><div class="s">${s}</div><div class="g g${c}">${c}</div>${t}</div>`;
  }).join('')}</div>`;
}

function teamCard(compact) {
  const g = S.teamGoal, pts = S.teamPoints || 0, pct = Math.min(100, pts / (g.target || 1) * 100);
  return `<div class="card">
    <div class="team-emo">${esc(g.emoji || '💜')}</div>
    <div class="card-head mt12" style="margin-bottom:0"><div class="card-title" style="font-size:1.25rem">Better together</div><div class="bold" style="color:var(--primary);font-size:1.1rem">${pts}/${g.target}</div></div>
    <div class="card-sub">Team up for ${esc(g.name)}!</div>
    <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>
    ${pct >= 100 ? '<div class="banner" style="background:var(--green-soft);color:var(--green)">🎉 Goal reached! Tell a parent to plan it.</div>' : ''}
    ${compact ? '' : `<div class="team-note">💜 No competition. Just two sisters helping each other.</div>`}
  </div>`;
}

function nextRewardCard(i) {
  const pts = availablePoints(i);
  const list = [...(S.rewards[i] || [])].sort((a, b) => a.cost - b.cost);
  const next = list.find(r => r.cost > pts) || list[list.length - 1];
  const emo = n => /screen/i.test(n) ? '📺' : /movie/i.test(n) ? '🎬' : /dinner|food|pizza/i.test(n) ? '🍕' : /up|late/i.test(n) ? '🌙' : /skip/i.test(n) ? '🎟️' : /outing|trip/i.test(n) ? '🎢' : '🎁';
  return `<div class="card">
    <div class="card-title">🎁 Your next reward</div><div class="card-sub">Earn points, choose something fun.</div>
    ${next ? `<div class="reward-hl"><div class="emo">${emo(next.name)}</div><div class="nm">${esc(next.name)}</div>
      <div class="sub">${next.cost} pts · ${next.cost > pts ? (next.cost - pts) + ' to go' : 'ready to redeem!'}</div></div>` : '<div class="empty">No rewards set up yet.</div>'}
    <button class="btn block" data-act="tab" data-tab="rewards">See rewards →</button></div>`;
}

// ════════════════════════════════════════════════════════════
//  KID VIEWS
// ════════════════════════════════════════════════════════════
function kidView(i) {
  const t = ui.tabs.kid;
  if (t === 'chores') return kidChoresView(i);
  if (t === 'rewards') return kidRewardsView(i);
  if (t === 'team') return kidTeamView(i);
  return kidTodayView(i);
}

function kidTodayView(i) {
  const list = todayList(i), done = list.filter(isDoneish).length;
  const pct = list.length ? Math.round(done / list.length * 100) : 0;
  const msg = !list.length ? 'Nothing due today — check My chores or earn bonus points!'
    : pct === 0 ? "You've got this. A little done goes a long way — pick one to start."
    : pct < 50 ? 'Nice start! Keep that momentum going.'
    : pct < 100 ? "Almost there — you're crushing it."
    : 'All done for today! 🎉 Go enjoy yourself.';
  const seg = ui.seg;
  const week = kidChores(i);
  const shown = seg === 'todo' ? week.filter(c => !isDoneish(c)) : seg === 'done' ? week.filter(isDoneish) : list;
  const order = { rejected: 0, none: 1, pending: 2, approved: 3 };
  shown.sort((a, b) => order[a.status] - order[b.status]);
  const lvl = LEVELS[Math.min(Math.floor((S.kids[i].xp || 0) / 25), LEVELS.length - 1)];

  const left = `<div class="col">
    <div class="hero"><div class="hero-main"><span class="hero-tag">✦ Your daily glow-up</span>
      <div class="hero-title">Hey, ${esc(S.names[i])}! ✌️</div><div class="hero-text">${msg}</div></div>
      ${ring(pct, list.length ? `${done} of ${list.length} done` : 'free day')}</div>
    <div class="grid3">
      <div class="stat"><div class="stat-ico bg-gold">⭐</div><div class="stat-val">${availablePoints(i)} pts</div><div class="stat-lbl">Your points balance</div></div>
      <div class="stat"><div class="stat-ico bg-red">🔥</div><div class="stat-val">${streak(i)} day${streak(i) === 1 ? '' : 's'}</div><div class="stat-lbl">Streak · ${lvl}</div></div>
      <div class="stat"><div class="stat-ico bg-blue">🎯</div><div class="stat-val">${done} of ${list.length}</div><div class="stat-lbl">Today's chores</div></div>
    </div>
    <div class="wide-only col">${allowanceCard(i)}${screenCard(i)}</div>
  </div>`;

  const right = `<div class="col">
    <div><div class="section-title">Your to-dos ✨</div><div class="section-sub">Each checkmark is a little win.</div></div>
    <div class="seg">${[['today', 'Today'], ['todo', 'To do'], ['done', 'Done']].map(([k, l]) => `<button class="${seg === k ? 'active' : ''}" data-act="seg" data-seg="${k}">${l}</button>`).join('')}</div>
    <div class="list">${shown.length ? shown.map(c => choreRow(c, 'kid')).join('') : `<div class="card empty"><span class="big">${seg === 'done' ? '🌱' : '🎉'}</span>${seg === 'done' ? 'Nothing checked off yet.' : 'Nothing here — nice!'}</div>`}</div>
    <div class="hint">Tap the circle when you finish a chore. Tap again to undo.</div>
    <div class="narrow-only col">${allowanceCard(i)}${screenCard(i)}</div>
    <div class="grid2">${nextRewardCard(i)}${teamCard(false)}</div>
  </div>`;
  return `<div class="split">${left}${right}</div><div class="foot">Designed for real life, not perfect days. 💜</div>`;
}

function kidChoresView(i) {
  const week = kidChores(i);
  const groups = [
    ['rejected', '↺ Try again', 'A parent sent these back — give them another go.'],
    ['none', '📝 To do', ''],
    ['pending', '⏳ Waiting for a parent', ''],
    ['approved', '✅ Done & approved', '']
  ];
  const mySubs = S.pointSubmissions.filter(p => p.kidIdx === i && p.status === 'pending');
  const left = `<div class="col">
    <div><div class="section-title">My chores</div><div class="section-sub">Week of ${esc(S.week)} · ${week.length} total</div></div>
    ${week.length ? groups.map(([st, title, sub]) => {
      const items = week.filter(c => c.status === st);
      if (!items.length) return '';
      return `<div class="list"><div><div class="card-title">${title} <span class="muted small">(${items.length})</span></div>${sub ? `<div class="card-sub">${sub}</div>` : ''}</div>${items.map(c => choreRow(c, 'kid')).join('')}</div>`;
    }).join('') : '<div class="card empty"><span class="big">🗓️</span>No chores assigned yet this week.</div>'}
  </div>`;
  const right = `<div class="col">
    <div class="card">
      <div class="card-title">🌟 Earn bonus points</div><div class="card-sub">Did something great instead of scrolling? Claim it here.</div>
      <div class="list mt12">${S.activities.map(a => `<div class="chore" style="box-shadow:none;background:#faf9fe">
        <div class="ico ${icoBg[hashIdx(a.name, icoBg.length)]}">${choreIcon(a.name)}</div>
        <div class="ci"><div class="cn">${esc(a.name)}</div></div><span class="pill">+${a.points} pts</span>
        <button class="btn sm soft" data-act="act-did" data-id="${a.id}">I did it</button></div>`).join('') || '<div class="empty">No activities yet.</div>'}</div>
      ${mySubs.length ? `<div class="mt16"><div class="lbl">Waiting for a parent</div><div class="list mt8">${mySubs.map(p => `<div class="line bold"><span>⏳ ${esc(p.activityName)} · +${p.points}</span><button class="ibtn ghost" data-act="sub-cancel" data-id="${p.id}">Cancel</button></div>`).join('')}</div></div>` : ''}
    </div>
    <div class="card"><div class="card-title">📚 My grades</div><div class="card-sub">Better than last check-in = +$1.25 per subject</div><div class="mt12">${gradesBlock(i)}</div></div>
  </div>`;
  return `<div class="split">${left}${right}</div>`;
}

function kidRewardsView(i) {
  const pts = availablePoints(i);
  const list = [...(S.rewards[i] || [])].sort((a, b) => a.cost - b.cost);
  const mine = S.pendingRewards.filter(r => r.kidIdx === i && r.status === 'pending');
  const recent = S.pendingRewards.filter(r => r.kidIdx === i && r.status !== 'pending').slice(-4).reverse();
  return `<div class="split"><div class="col">
    <div class="points-hero"><div style="font-size:2.6rem">⭐</div><div><div class="money-big">${pts} pts</div><div class="bold">ready to spend${S.kids[i].points !== pts ? ` · ${S.kids[i].points - pts} on hold` : ''}</div></div></div>
    ${mine.length ? `<div class="card"><div class="card-title">⏳ Waiting for a parent</div><div class="list mt12">${mine.map(r => `<div class="line bold"><span>${esc(r.name)} · ${r.cost} pts</span><button class="ibtn ghost" data-act="req-cancel" data-id="${r.id}">Cancel</button></div>`).join('')}</div></div>` : ''}
    ${recent.length ? `<div class="card"><div class="card-title">Recent</div><div class="list mt12">${recent.map(r => `<div class="line bold"><span>${esc(r.name)}</span><span class="tag ${r.status === 'approved' ? 'ok' : 'no'}">${r.status === 'approved' ? 'granted' : 'not this time'}</span></div>`).join('')}</div></div>` : ''}
  </div><div class="col">
    <div><div class="section-title">Rewards 🎁</div><div class="section-sub">Points reset every new week — spend them!</div></div>
    <div class="list">${list.map(r => {
      const ok = pts >= r.cost;
      return `<div class="reward-row ${ok ? '' : 'locked'}"><div class="ico bg-gold">${/screen/i.test(r.name) ? '📺' : '🎁'}</div>
        <div class="ci"><div class="cn">${esc(r.name)}</div><div class="cm">${ok ? 'You can get this!' : (r.cost - pts) + ' more points'}</div></div>
        <span class="pill">${r.cost} pts</span><button class="btn sm" data-act="redeem" data-k="${i}" data-id="${r.id}" ${ok ? '' : 'disabled'}>Redeem</button></div>`;
    }).join('') || '<div class="card empty">No rewards yet — ask a parent to add some.</div>'}</div>
    ${screenCard(i)}
  </div></div>`;
}

function kidTeamView(i) {
  const both = [0, 1].map(k => ({ k, done: kidChores(k).filter(c => c.status === 'approved').length, pts: S.kids[k].weekPoints || 0 }));
  const totalDone = both[0].done + both[1].done;
  return `<div class="split even"><div class="col">
    <div><div class="section-title">Team goals 💜</div><div class="section-sub">Every approved chore adds ${TEAM_PTS_PER_CHORE} points. Bonus activities add their points too.</div></div>
    ${teamCard(false)}
  </div><div class="col">
    <div class="card"><div class="card-title">🤝 Together this week</div>
      <div class="mini-stats"><div class="mini"><b>${totalDone}</b><span>chores done</span></div><div class="mini"><b>${both[0].pts + both[1].pts}</b><span>bonus pts</span></div><div class="mini"><b>${S.teamPoints || 0}</b><span>team pts</span></div></div>
      <div class="list mt16">${both.map(b => `<div class="line bold"><span><span class="tag kid${b.k}">${esc(S.emojis[b.k])} ${esc(S.names[b.k])}</span></span><span>${b.done} chores · ${b.pts} pts</span></div>`).join('')}</div>
    </div>
    <div class="card"><div class="card-title">💡 Ways to grow it</div>
      <div class="lines"><div class="line"><span>Finish a chore & get it approved</span><span class="plus">+${TEAM_PTS_PER_CHORE}</span></div>
      ${S.activities.slice(0, 4).map(a => `<div class="line"><span>${esc(a.name)}</span><span class="plus">+${a.points}</span></div>`).join('')}</div>
      <button class="btn block soft mt16" data-act="tab" data-tab="chores">See bonus activities</button></div>
  </div></div>`;
}

// ════════════════════════════════════════════════════════════
//  PARENT VIEWS
// ════════════════════════════════════════════════════════════
function parentView() {
  const t = ui.tabs.parent;
  if (t === 'chores') return parentChoresView();
  if (t === 'family') return parentFamilyView();
  if (t === 'settings') return parentSettingsView();
  return parentInboxView();
}

function parentInboxView() {
  const chores = S.chores.filter(c => c.status === 'pending').sort((a, b) => a.submittedAt - b.submittedAt);
  const acts = S.pointSubmissions.filter(p => p.status === 'pending');
  const reqs = S.pendingRewards.filter(r => r.status === 'pending');
  const none = !chores.length && !acts.length && !reqs.length;
  return `<div class="split"><div class="col">
    <div><div class="section-title">Approvals</div><div class="section-sub">${none ? 'Nothing waiting on you.' : 'Check the work, then tap ✓ or ✗.'}</div></div>
    ${none ? '<div class="card empty"><span class="big">✨</span>All caught up!</div>' : ''}
    ${chores.length ? `<div class="list"><div class="card-head" style="margin:0"><div class="card-title">Chores <span class="muted small">(${chores.length})</span></div>
      ${chores.length > 1 ? `<button class="btn sm green" data-act="approve-all">✓ Approve all</button>` : ''}</div>${chores.map(c => choreRow(c, 'parent')).join('')}</div>` : ''}
    ${acts.length ? `<div class="list"><div class="card-title">Bonus activities <span class="muted small">(${acts.length})</span></div>${acts.map(p => `
      <div class="chore prow ${KID_CLS[p.kidIdx]}"><div class="ico bg-gold">${choreIcon(p.activityName)}</div>
      <div class="ci"><div class="cn">${esc(p.activityName)}</div><div class="cm"><span class="tag kid${p.kidIdx}">${esc(S.names[p.kidIdx])}</span><span>+${p.points} pts · ${hrsAgo(p.submittedAt)}</span></div></div>
      <div class="actions"><button class="ibtn ok" data-act="sub-ok" data-id="${p.id}">✓</button><button class="ibtn no" data-act="sub-no" data-id="${p.id}">✗</button></div></div>`).join('')}</div>` : ''}
    ${reqs.length ? `<div class="list"><div class="card-title">Reward requests <span class="muted small">(${reqs.length})</span></div>${reqs.map(r => `
      <div class="chore prow ${KID_CLS[r.kidIdx]}"><div class="ico bg-gold">🎁</div>
      <div class="ci"><div class="cn">${esc(r.name)}</div><div class="cm"><span class="tag kid${r.kidIdx}">${esc(S.names[r.kidIdx])}</span><span>${r.cost} pts · has ${S.kids[r.kidIdx].points}</span></div></div>
      <div class="actions"><button class="ibtn ok" data-act="grant" data-id="${r.id}">Grant</button><button class="ibtn no" data-act="deny" data-id="${r.id}">Deny</button></div></div>`).join('')}</div>` : ''}
  </div><div class="col">
    ${[0, 1].map(i => kidSummaryCard(i, true)).join('')}
  </div></div>`;
}

function kidSummaryCard(i, small) {
  const p = payoutParts(i), s = screen(i);
  const pct = Math.min(100, p.pay / S.maxPay * 100), tick = S.base / S.maxPay * 100;
  const pend = kidChores(i).filter(c => c.status === 'pending').length;
  return `<div class="card kid-card" style="--kc:var(--k${i})">
    <div class="kid-head"><span class="av lg" style="--soft:var(--k${i}-soft)">${esc(S.emojis[i])}</span>
      <div style="flex:1"><div class="kid-name">${esc(S.names[i])}</div><div class="card-sub">${pend} waiting · ${gradeGrowthPct(S.kids[i])}% grade growth</div></div>
      <div class="money-big" style="font-size:1.8rem">${money(p.pay)}</div></div>
    <div class="bar"><div class="bar-fill ${p.pay < S.base ? 'warn' : ''}" style="width:${pct}%;background:${p.pay < S.base ? '' : `var(--k${i})`}"></div><div class="bar-tick" style="left:${tick}%"></div></div>
    <div class="bar-labels"><span>$0</span><span>${money(S.base)}</span><span>${money(S.maxPay)}</span></div>
    <div class="mini-stats"><div class="mini"><b>${p.approved}/${p.total}</b><span>chores</span></div><div class="mini"><b>${S.kids[i].points}</b><span>points</span></div><div class="mini"><b>${mins(s.left)}</b><span>screen left</span></div></div>
    ${penaltyNotice(i, true)}
    ${small ? '' : `<div class="lines">
      <div class="line"><span>Chores (${!p.total ? '—' : p.weighted ? money(p.val) + ' per 1×' : money(p.val) + ' each'})</span><span>${p.wiped ? '<s class="muted">' + money(p.choreBefore) + '</s> ' : ''}${money(p.choreEarned)}</span></div>
      <div class="line"><span>Extra credit</span><span class="plus">+${money(p.extra)}</span></div>
      <div class="line"><span>Grade improvement</span><span class="plus">+${money(p.grade)}</span></div>
      <div class="line total"><span>Pay this week</span><span>${money(p.pay)}</span></div></div>
    <div class="adjust"><span class="lbl">⭐ Points</span><button class="ibtn" data-act="pts" data-k="${i}" data-n="-10">−10</button><button class="ibtn" data-act="pts" data-k="${i}" data-n="-5">−5</button><button class="ibtn ok" data-act="pts" data-k="${i}" data-n="5">+5</button><button class="ibtn ok" data-act="pts" data-k="${i}" data-n="10">+10</button></div>
    <div class="adjust"><span class="lbl">📱 Screen used (${mins(s.used)}/${mins(s.total)})</span><button class="ibtn" data-act="screen" data-k="${i}" data-n="-30">−30m</button><button class="ibtn ok" data-act="screen" data-k="${i}" data-n="30">+30m</button></div>
    <div class="mt16">${gradesBlock(i)}</div>`}
    <button class="btn block danger mt12" data-act="pen-open" data-k="${i}">⚠️ Disrespect — wipe this week's allowance</button>
  </div>`;
}

function parentChoresView() {
  const f = ui.filter;
  const filters = [['all', 'All'], ['pending', 'Waiting'], ['notdone', 'Not done'], ['approved', 'Approved'], ['rejected', 'Try again'], ['k0', S.names[0]], ['k1', S.names[1]], ['shared', 'Shared']];
  let list = [...S.chores];
  if (f === 'pending') list = list.filter(c => c.status === 'pending');
  if (f === 'notdone') list = list.filter(c => c.status === 'none');
  if (f === 'approved') list = list.filter(c => c.status === 'approved');
  if (f === 'rejected') list = list.filter(c => c.status === 'rejected');
  if (f === 'k0') list = list.filter(c => c.kid === 0);
  if (f === 'k1') list = list.filter(c => c.kid === 1);
  if (f === 'shared') list = list.filter(c => c.kid === 'shared');
  const kidOpts = sel => `<option value="0" ${sel === 0 ? 'selected' : ''}>${esc(S.emojis[0])} ${esc(S.names[0])}</option><option value="1" ${sel === 1 ? 'selected' : ''}>${esc(S.emojis[1])} ${esc(S.names[1])}</option><option value="shared">👭 Shared</option>`;
  return `<div class="split"><div class="col">
    <div class="card"><div class="card-title">➕ Add a chore</div><div class="form mt12">
      <div class="field"><label for="fName">Chore</label><input id="fName" type="text" placeholder="e.g. Make your bed" maxlength="60"></div>
      <div class="form-row">
        <div class="field"><label for="fKid">For</label><select id="fKid">${kidOpts(0)}</select></div>
        <div class="field"><label for="fFreq">How often</label><select id="fFreq"><option value="weekly">Once this week</option><option value="twice-weekly">2× this week</option><option value="daily">Every day (7)</option></select></div>
      </div>
      <div class="field"><label for="fDod">Done when…</label><input id="fDod" type="text" placeholder="e.g. Sheets pulled up, pillow on" maxlength="90"></div>
      <div class="form-row">
        <div class="field"><label for="fPays">Pays</label><select id="fPays"><option value="allowance">Share of the $${S.base}</option><option value="extra">⭐ Extra money</option><option value="points">🌟 Bonus points (rare)</option></select></div>
        <div class="field" id="fAmtRow" hidden><label for="fAmt" id="fAmtLbl">Amount</label><input id="fAmt" type="number" min="0.5" step="0.5" value="1"></div>
        <div class="field" id="fWRow"><label for="fWeight">Worth</label><select id="fWeight">${worthOpts(1)}</select></div>
      </div>
      <div class="toggles">
        <label class="toggle"><input type="checkbox" id="fBank" checked> 🏦 Save to bank</label>
        <label class="toggle"><input type="checkbox" id="fBake"> 📌 Every week</label>
      </div>
      <button class="btn block" data-act="add-chore">Add chore</button>
    </div></div>
    ${bankCard(kidOpts)}
  </div><div class="col">
    <div><div class="section-title">This week's chores</div><div class="section-sub">Week of ${esc(S.week)} · ${S.chores.length} total</div></div>
    <div class="chips">${filters.map(([k, l]) => `<button class="chip ${f === k ? 'active' : ''}" data-act="filter" data-f="${k}">${esc(l)}</button>`).join('')}</div>
    <div class="list">${list.length ? list.map(c => choreRow(c, 'parent')).join('') : '<div class="card empty"><span class="big">🧺</span>No chores here.</div>'}</div>
  </div></div>`;
}

function paysLabel(b) {
  return b.pays === 'points' ? '🌟 +' + (b.points || 10) + ' pts' : b.pays === 'extra' ? '⭐ +' + money(b.bonusDollars) : 'allowance' + (cw(b) > 1 ? ' · ×' + cw(b) + ' worth' : '');
}
const worthOpts = cur => [[1, '1× normal'], [2, '2× double'], [3, '3× triple']].map(([v, l]) => `<option value="${v}" ${Number(cur) === v ? 'selected' : ''}>${l}</option>`).join('');
function bankCard(kidOpts) {
  const baked = S.bank.filter(b => b.auto.length);
  const row = (b, idx) => `<div class="bank-row">
      <div class="ico ${icoBg[hashIdx(b.name, icoBg.length)]}" style="width:42px;height:42px;font-size:1.3rem">${choreIcon(b.name)}</div>
      <div class="ci"><div class="cn" style="font-size:.98rem">${esc(b.name)}</div>
        <div class="cm"><span>${b.freq === 'daily' ? 'Daily' : b.freq === 'twice-weekly' ? '2×/wk' : 'Weekly'}</span><span class="dot">${paysLabel(b)}</span></div>
        <div class="bake"><span class="bake-lbl">📌 Every week:</span>${[0, 1].map(k => `<button class="bake-chip k${k} ${b.auto.includes(k) ? 'on' : ''}" data-act="bake" data-i="${idx}" data-k="${k}">${b.auto.includes(k) ? '✓ ' : ''}${esc(S.names[k])}</button>`).join('')}</div></div>
      <div class="actions"><select id="bankKid_${idx}" style="width:auto;padding:8px" aria-label="Add for">${kidOpts(0)}</select>
        <button class="ibtn ok" data-act="bank-add" data-i="${idx}">+ Add</button>
        <button class="ibtn" data-act="bank-edit" data-i="${idx}" aria-label="Edit">✏️</button>
        <button class="ibtn ghost" data-act="bank-del" data-i="${idx}" aria-label="Delete">🗑</button></div></div>`;
  const regular = S.bank.map((b, i) => [b, i]).filter(([b]) => b.pays !== 'points');
  const rare = S.bank.map((b, i) => [b, i]).filter(([b]) => b.pays === 'points');
  return `<div class="card"><div class="card-title">🏦 Chore bank</div>
    <div class="card-sub">📌 = loads automatically every new week for that girl. Anything else, add when you need it.</div>
    <div class="list mt12">${regular.length ? regular.map(([b, i]) => row(b, i)).join('') : '<div class="empty">Chores you add with “Save to bank” show up here.</div>'}</div>
    ${rare.length ? `<div class="card-title mt16">🌟 Rare chores <span class="muted small">(bonus points)</span></div><div class="list mt8">${rare.map(([b, i]) => row(b, i)).join('')}</div>` : ''}
    ${baked.length ? `<button class="btn block soft mt12" data-act="bake-load">📌 Load every-week chores now</button>` : ''}
  </div>`;
}

function parentFamilyView() {
  return `<div class="stack">
    <div class="card-head" style="margin:0"><div><div class="section-title">Family</div><div class="section-sub">Week of ${esc(S.week)} · total payout ${money(kidPayout(0) + kidPayout(1))}</div></div>
      <div class="btn-row"><button class="btn sm soft" data-act="grades-open">📚 Update grades</button><button class="btn sm danger" data-act="new-week">🔄 New week</button></div></div>
    <div class="split even">${kidSummaryCard(0, false)}${kidSummaryCard(1, false)}</div>
    <div class="split even">${teamCard(true)}
      <div class="card"><div class="card-title">📋 Recent activity</div><div class="log mt12">${(S.logs || []).slice(0, 25).map(l => `<div>${esc(l)}</div>`).join('') || '<div>No activity yet.</div>'}</div></div></div>
  </div>`;
}

// ── PARENT ALERTS (web push) ─────────────────────────────────
const VAPID_PUBLIC = 'BDyrRFo9JshWVXC7ttLnvxf-Psxu6n6ycrFfDqAzcJL7aX52CE3DloWwq60M2hFicRI6pekKAdBUffSJ9olJKPc';
const ALERTS_FN = SUPABASE_URL + '/functions/v1/parent-alerts';
const ALERT_HOUR_CHOICES = [7, 12, 15, 17, 18, 19, 20, 21];
let pushState = 'checking'; // checking | on | off | unsupported | install | denied
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function hourLabel(h) { return (h % 12 || 12) + (h < 12 ? ' am' : ' pm'); }
function b64uToBytes(s) { const p = '='.repeat((4 - s.length % 4) % 4); const b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, c => c.charCodeAt(0)); }
async function refreshPushState() {
  const before = pushState;
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) pushState = isIOS() && !isStandalone() ? 'install' : 'unsupported';
  else if (Notification.permission === 'denied') pushState = 'denied';
  else {
    try { const reg = await navigator.serviceWorker.ready; pushState = (await reg.pushManager.getSubscription()) ? 'on' : 'off'; }
    catch (e) { pushState = 'off'; }
  }
  if (before !== pushState && inParent() && ui.tabs.parent === 'settings') render();
}
function deviceLabel() {
  const u = navigator.userAgent;
  return /iPad/.test(u) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? 'iPad' : /iPhone/.test(u) ? 'iPhone' : /Android/.test(u) ? 'Android' : /Windows/.test(u) ? 'Windows PC' : /Mac/.test(u) ? 'Mac' : 'device';
}
function alertsCard() {
  const hours = S.alertHours || [];
  const status = {
    checking: '<div class="card-sub">Checking this device…</div>',
    on: '<div class="alert-on">✓ Alerts are on for this device</div>',
    off: '<div class="card-sub">Get one notification at the times below listing what is waiting for your OK. Nothing waiting = no notification.</div>',
    unsupported: '<div class="card-sub">This browser can\'t receive notifications. Try Safari on iPhone/iPad (from the Home Screen icon) or Chrome/Edge on a computer.</div>',
    install: `<div class="install-tip"><b>One-time setup on iPhone/iPad:</b><ol><li>Tap the Share button <span class="kbd">⬆︎</span> in Safari</li><li>Choose <b>Add to Home Screen</b></li><li>Open Chore Club from the new icon, go to Parent → Settings, and turn alerts on here.</li></ol></div>`,
    denied: '<div class="card-sub">Notifications are blocked for Chore Club. Turn them on in your device Settings → Notifications → Chore Club, then come back.</div>'
  }[pushState];
  const btns = pushState === 'on'
    ? `<div class="btn-row mt12"><button class="btn sm" data-act="push-test">Send test alert</button><button class="btn sm white" data-act="push-off">Turn off on this device</button></div>`
    : pushState === 'off' ? `<button class="btn block mt12" data-act="push-on">🔔 Turn on alerts on this ${esc(deviceLabel())}</button>` : '';
  return `<div class="card"><div class="card-title">🔔 Approval alerts</div>${status}${btns}
    <div class="field mt16"><label>Send a summary at (Eastern)</label><div class="chips wrap">${ALERT_HOUR_CHOICES.map(h => `<button class="chip ${hours.includes(h) ? 'active' : ''}" data-act="alert-hour" data-h="${h}">${hourLabel(h)}</button>`).join('')}</div></div>
    <div class="small muted">Times apply to every parent device. Turn alerts on separately on each phone or iPad you want them on.</div></div>`;
}

function parentSettingsView() {
  const g = S.teamGoal;
  if (pushState === 'checking') refreshPushState();
  return `<div class="split even"><div class="col">
    ${alertsCard()}
    <div class="card"><div class="card-title">👭 Family & allowance</div><div class="form mt12">
      <div class="form-row"><div class="field"><label>Kid 1 name</label><input id="sName0" type="text" value="${esc(S.names[0])}"></div><div class="field"><label>Emoji</label><input id="sEmo0" type="text" value="${esc(S.emojis[0])}"></div></div>
      <div class="form-row"><div class="field"><label>Kid 2 name</label><input id="sName1" type="text" value="${esc(S.names[1])}"></div><div class="field"><label>Emoji</label><input id="sEmo1" type="text" value="${esc(S.emojis[1])}"></div></div>
      <div class="form-row"><div class="field"><label>Base pay ($)</label><input id="sBase" type="number" value="${S.base}"></div><div class="field"><label>Max pay ($)</label><input id="sMax" type="number" value="${S.maxPay}"></div></div>
      <div class="field"><label>Weekly screen time (hours)</label><input id="sScreen" type="number" step="0.5" value="${(S.screenTimeBase || 360) / 60}"></div>
      <button class="btn block" data-act="save-family">Save</button></div></div>

    <div class="card"><div class="card-title">💜 Team goal</div><div class="form mt12">
      <div class="form-row"><div class="field"><label>Goal</label><input id="gName" type="text" value="${esc(g.name)}"></div><div class="field"><label>Emoji</label><input id="gEmo" type="text" value="${esc(g.emoji)}"></div></div>
      <div class="field"><label>Points needed</label><input id="gTarget" type="number" value="${g.target}"></div>
      <button class="btn block soft" data-act="goal-save">Save team goal</button></div></div>

    <div class="card"><div class="card-title">🔐 Parent PIN</div><div class="card-sub">${S.pin ? 'A PIN is set — needed to open parent mode, start a new week, or clear data.' : 'No PIN yet — anyone can open parent mode. Set one!'}</div><div class="form mt12">
      ${S.pin ? '<div class="field"><label>Current PIN</label><input id="pCur" type="password" inputmode="numeric" maxlength="4"></div>' : ''}
      <div class="field"><label>New PIN (4 digits, blank to remove)</label><input id="pNew" type="password" inputmode="numeric" maxlength="4"></div>
      <button class="btn block soft" data-act="pin-save">Update PIN</button></div></div>
  </div><div class="col">
    <div class="card"><div class="card-title">🌟 Bonus activities</div><div class="card-sub">Things the girls can claim for points.</div>
      <div class="list mt12">${S.activities.map(a => `<div class="line bold"><span>${esc(a.name)} · +${a.points}</span><button class="ibtn ghost" data-act="activity-del" data-id="${a.id}">🗑</button></div>`).join('')}</div>
      <div class="form-row mt12"><input id="aName" type="text" placeholder="New activity"><input id="aPts" type="number" value="10" placeholder="Points"></div>
      <button class="btn block soft mt8" data-act="activity-add">+ Add activity</button></div>

    <div class="card"><div class="card-title">🎁 Reward menu</div><div class="card-sub">Screen-time rewards add minutes automatically.</div>
      <div class="list mt12">${(S.rewards[0] || []).map(r => `<div class="line bold"><span>${esc(r.name)} · ${r.cost} pts</span><button class="ibtn ghost" data-act="reward-del" data-name="${esc(r.name)}">🗑</button></div>`).join('')}</div>
      <div class="form-row mt12"><input id="rName" type="text" placeholder="New reward"><input id="rCost" type="number" value="20" placeholder="Cost"></div>
      <button class="btn block soft mt8" data-act="reward-add">+ Add reward</button></div>

    <div class="card"><div class="card-title">💾 Backup</div><div class="card-sub">Encrypted copy of everything. Keep the passphrase somewhere safe.</div><div class="form mt12">
      <input id="bPass" type="password" placeholder="Passphrase">
      <div class="btn-row"><button class="btn sm" data-act="export">Export</button><button class="btn sm white" data-act="import">Import</button></div>
      <textarea id="bBlob" placeholder="Paste a backup here to import"></textarea></div></div>

    <div class="card"><div class="card-title">🧹 Clean up</div><div class="btn-row mt12">
      <button class="btn sm white" data-act="clear-test">Clear test data</button>
      <button class="btn sm white" data-act="log-export">Export log</button>
      <button class="btn sm danger" data-act="clear-all">Clear ALL data</button>
      <button class="btn sm" data-act="lock">🔒 Lock parent mode</button></div>
      <div class="small muted mt12">Data: ${(JSON.stringify(S).length / 1024).toFixed(1)} KB · ${syncStatus === 'saved' ? 'synced' : syncStatus}</div></div>
  </div></div>`;
}

// ════════════════════════════════════════════════════════════
//  MODALS / TOAST / CONFETTI
// ════════════════════════════════════════════════════════════
function openModal(html) { el('modalBody').innerHTML = `<div class="modal-in">${html}</div>`; const m = el('modal'); if (!m.open) m.showModal(); }
function closeModal() { const m = el('modal'); if (m.open) m.close(); }

let toastTimer = null, toastAction = null;
function toast(msg, actionLabel, action, ms = 3200) {
  const t = el('toast');
  toastAction = action || null;
  t.innerHTML = `<span>${esc(msg)}</span>${actionLabel ? `<button data-act="toast-action">${esc(actionLabel)}</button>` : ''}`;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.classList.remove('show'); toastAction = null; }, actionLabel ? Math.max(ms, 15000) : ms);
}

function confetti() {
  const colors = ['#6c4ee0', '#e8479a', '#ffcf4d', '#22c55e', '#8b5cf6', '#38bdf8'];
  for (let i = 0; i < 40; i++) {
    const s = document.createElement('div');
    s.className = 'confetti';
    const w = 6 + Math.random() * 8;
    s.style.cssText = `left:${Math.random() * 100}vw;width:${w}px;height:${w * (Math.random() > .5 ? 1 : .5)}px;background:${colors[i % colors.length]};border-radius:${Math.random() > .5 ? '50%' : '2px'};animation-duration:${1.3 + Math.random()}s;animation-delay:${Math.random() * .25}s`;
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 2800);
  }
}

// PIN pad
let pinCb = null, pinEntry = '';
function requirePin(cb, title) {
  if (!S.pin) { cb(); return; }
  pinCb = cb; pinEntry = '';
  openModal(`<div class="modal-title" style="text-align:center">🔐 ${esc(title || 'Parent PIN')}</div>
    <div class="pin-dots" id="pinDots">${'<span></span>'.repeat(4)}</div>
    <div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-act="pin-key" data-k="${n}">${n}</button>`).join('')}
      <button data-act="modal-close" style="font-size:1rem">Cancel</button><button data-act="pin-key" data-k="0">0</button><button data-act="pin-key" data-k="back">⌫</button></div>`);
}
function pinKey(k) {
  if (k === 'back') pinEntry = pinEntry.slice(0, -1);
  else if (pinEntry.length < 4) pinEntry += k;
  const dots = el('pinDots');
  if (dots) dots.querySelectorAll('span').forEach((d, i) => d.classList.toggle('on', i < pinEntry.length));
  if (pinEntry.length === 4) {
    if (pinEntry === S.pin) { const cb = pinCb; pinCb = null; closeModal(); if (cb) cb(); }
    else { dots.classList.remove('shake'); void dots.offsetWidth; dots.classList.add('shake'); pinEntry = ''; setTimeout(() => dots.querySelectorAll('span').forEach(d => d.classList.remove('on')), 250); }
  }
}

function confirmModal(title, text, okLabel, onOk, danger) {
  openModal(`<div class="modal-title">${esc(title)}</div><div class="muted bold">${esc(text)}</div>
    <div class="modal-btns"><button class="btn white" data-act="modal-close">Cancel</button><button class="btn ${danger ? 'danger' : ''}" data-act="confirm-ok">${esc(okLabel)}</button></div>`);
  confirmCb = onOk;
}
let confirmCb = null;

// ════════════════════════════════════════════════════════════
//  ACTIONS
// ════════════════════════════════════════════════════════════
const findChore = id => S.chores.find(c => c.id === id);
function commit(msg) { save(); render(); if (msg) toast(msg); }

function undoable(label, mutate) {
  const snap = JSON.stringify(S);
  mutate();
  save(); render();
  toast(label, 'Undo', () => { S = normalize(JSON.parse(snap)); save(); render(); toast('Undone'); });
}

const A = {
  who({ who }) {
    if (who === 'parent') {
      if (inParent()) { ui.who = parentReturn ?? 0; saveUI(); render(); return; }
      requirePin(() => { parentUnlocked = true; sessionStorage.setItem('cc-parent', '1'); ui.who = 'parent'; saveUI(); render(); if (!S.pin) toast('Tip: set a parent PIN in Settings'); });
      return;
    }
    ui.who = Number(who); parentReturn = ui.who; saveUI(); render();
  },
  tab({ tab }) { ui.tabs[tabKey()] = tab; saveUI(); render(); window.scrollTo(0, 0); },
  seg({ seg }) { ui.seg = seg; saveUI(); render(); },
  filter({ f }) { ui.filter = f; saveUI(); render(); },
  retry() { flush(); },

  'kid-toggle'({ id }) {
    const c = findChore(id); if (!c) return;
    const me = isKid(ui.who) ? ui.who : 0;
    if (c.status === 'approved') { toast('Already approved ✓'); return; }
    if (c.status === 'pending') { c.status = 'none'; c.submittedAt = null; log(S.names[me] + ' un-checked "' + c.name + '"'); commit('Undone — no worries'); return; }
    c.status = 'pending'; c.submittedAt = now(); c.by = me; markActive(me);
    log(S.names[me] + ' finished "' + c.name + '"');
    save(); render();
    const left = todayList(me).filter(x => !isDoneish(x)).length;
    if (left === 0 && todayList(me).length) { confetti(); toast("That's everything for today! 🎉"); }
    else toast('Nice! Sent to a parent for a ✓');
  },
  approve({ id }) { const c = findChore(id); if (!c) return; approveChore(c); confetti(); commit('Approved ✓'); },
  reject({ id }) { const c = findChore(id); if (!c) return; c.status = 'rejected'; c.rejectedAt = now(); log('Sent back "' + c.name + '"'); commit('Sent back to try again'); },
  'approve-all'() {
    const list = S.chores.filter(c => c.status === 'pending');
    list.forEach(c => approveChore(c)); confetti(); commit('Approved ' + list.length + ' chores ✓');
  },
  reset({ id }) {
    const c = findChore(id); if (!c) return;
    if (c.status === 'approved') {
      S.teamPoints = Math.max(0, (S.teamPoints || 0) - TEAM_PTS_PER_CHORE - (c.rare ? c.points : 0));
      const who = isKid(c.kid) ? c.kid : (isKid(c.by) ? c.by : null);
      if (c.rare && who !== null) { const k = S.kids[who]; k.points = Math.max(0, (k.points || 0) - c.points); k.weekPoints = Math.max(0, (k.weekPoints || 0) - c.points); }
    }
    c.status = 'none'; c.submittedAt = null; c.approvedAt = null; commit('Reset to not done');
  },
  del({ id }) {
    const c = findChore(id); if (!c) return;
    undoable('Deleted "' + c.name + '"', () => { S.chores = S.chores.filter(x => x.id !== id); log('Deleted "' + c.name + '"'); });
  },
  edit({ id }) {
    const c = findChore(id); if (!c) return;
    editingId = id;
    openModal(`<div class="modal-title">✏️ Edit chore</div>
      <div class="field"><label>Name</label><input id="eName" type="text" value="${esc(c.baseName)}"></div>
      <div class="field"><label>Done when…</label><input id="eDod" type="text" value="${esc(c.dod)}"></div>
      ${isRegular(c) ? `<div class="field"><label>Worth</label><select id="eWeight">${worthOpts(cw(c))}</select><div class="small muted mt8">2× earns twice a normal chore's share of the $${S.base}.</div></div>` : ''}
      ${c.extra ? `<div class="field"><label>Bonus ($)</label><input id="eBonus" type="number" step="0.5" value="${c.bonusDollars || 1}"></div>` : ''}
      ${c.rare ? `<div class="field"><label>Bonus points</label><input id="ePts" type="number" step="5" value="${c.points || 10}"></div>` : ''}
      <div class="small muted bold">${c.freq !== 'weekly' ? 'Updates every day of this chore for ' + esc(kidName(c.kid)) + '.' : ''}</div>
      <div class="modal-btns"><button class="btn white" data-act="modal-close">Cancel</button><button class="btn" data-act="edit-save">Save</button></div>`);
  },
  'edit-save'() {
    const c = findChore(editingId); if (!c) return closeModal();
    const name = el('eName').value.trim(), dod = el('eDod').value.trim(), bonus = el('eBonus') ? parseFloat(el('eBonus').value) || 0 : null;
    if (!name) return;
    const old = c.baseName;
    S.chores.forEach(x => {
      if (x.baseName === old && x.kid === c.kid && x.freq === c.freq) {
        x.name = name + x.name.slice(old.length); x.baseName = name; x.dod = dod;
        if (bonus !== null) x.bonusDollars = bonus;
        if (el('eWeight')) x.weight = Number(el('eWeight').value) || 1;
        if (el('ePts') && x.status !== 'approved') x.points = Math.max(1, parseInt(el('ePts').value) || 10);
      }
    });
    const bk = el('eWeight') && S.bank.find(b => b.name.toLowerCase() === old.toLowerCase());
    if (bk) bk.weight = Number(el('eWeight').value) || 1;
    log('Edited "' + old + '"'); closeModal(); commit('Saved');
  },
  'add-chore'() {
    const name = el('fName').value.trim();
    if (!name) { el('fName').focus(); toast('Give the chore a name'); return; }
    const kv = el('fKid').value, kid = kv === 'shared' ? 'shared' : Number(kv);
    const pays = el('fPays').value, amt = parseFloat(el('fAmt').value) || 0;
    const weight = pays === 'allowance' ? Number(el('fWeight').value) || 1 : 1;
    const def = { name, kid, freq: el('fFreq').value, dod: el('fDod').value.trim(), pays, weight,
      bonusDollars: pays === 'extra' ? (amt || 1) : 0, points: pays === 'points' ? Math.round(amt || 10) : 0 };
    const n = expandChore(def);
    const bake = el('fBake').checked && isKid(kid);
    if (el('fBank').checked || bake) {
      const existing = S.bank.find(b => b.name.toLowerCase() === name.toLowerCase());
      if (existing) { if (bake && !existing.auto.includes(kid)) existing.auto.push(kid); }
      else S.bank.push({ name, freq: def.freq, pays, extra: pays === 'extra', bonusDollars: def.bonusDollars, points: def.points, weight, dod: def.dod, recurring: bake, auto: bake ? [kid] : [] });
    }
    log('Added "' + name + '" for ' + kidName(kid) + (n > 1 ? ' (' + n + '×)' : ''));
    commit('Added "' + name + '"' + (n > 1 ? ' × ' + n : ''));
  },
  'bank-add'({ i }) {
    const b = S.bank[Number(i)]; if (!b) return;
    const kv = el('bankKid_' + i).value, kid = kv === 'shared' ? 'shared' : Number(kv);
    const n = expandChore({ ...b, kid });
    log('Added "' + b.name + '" from bank for ' + kidName(kid)); commit('Added "' + b.name + '" for ' + kidName(kid) + (n > 1 ? ' × ' + n : ''));
  },
  bake({ i, k }) {
    const b = S.bank[Number(i)]; if (!b) return; k = Number(k);
    b.auto = b.auto.includes(k) ? b.auto.filter(x => x !== k) : [...b.auto, k].sort();
    b.recurring = b.auto.length > 0;
    commit(b.auto.includes(k) ? '📌 ' + b.name + ' every week for ' + S.names[k] : 'Unpinned for ' + S.names[k]);
  },
  'bake-load'() {
    const missing = bakedMissing();
    if (!missing.length) { toast('Every-week chores are already on this week'); return; }
    confirmModal('Load every-week chores?', 'Adds ' + missing.length + ' pinned chore' + (missing.length > 1 ? 's' : '') + ' that aren\'t on this week yet: ' + missing.map(m => m.b.name + ' (' + S.names[m.k] + ')').join(', ') + '.', 'Load', () => {
      let n = 0; missing.forEach(m => { n += expandChore({ ...m.b, kid: m.k, recurring: true }); });
      log('Loaded every-week chores'); commit('Added ' + n + ' chores');
    });
  },
  'bank-edit'({ i }) {
    const b = S.bank[Number(i)]; if (!b) return; editingBank = Number(i);
    const opt = (v, l, cur) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${l}</option>`;
    openModal(`<div class="modal-title">✏️ Edit saved chore</div>
      <div class="field"><label>Name</label><input id="bName" type="text" value="${esc(b.name)}"></div>
      <div class="field"><label>Done when…</label><input id="bDod" type="text" value="${esc(b.dod)}"></div>
      <div class="form-row"><div class="field"><label>How often</label><select id="bFreq">${opt('weekly', 'Once a week', b.freq)}${opt('twice-weekly', '2× a week', b.freq)}${opt('daily', 'Every day', b.freq)}</select></div>
        <div class="field"><label>Pays</label><select id="bPays">${opt('allowance', 'Share of $' + S.base, b.pays)}${opt('extra', '⭐ Extra money', b.pays)}${opt('points', '🌟 Bonus points', b.pays)}</select></div></div>
      <div class="form-row"><div class="field"><label>Extra $ / bonus points</label><input id="bAmt" type="number" step="0.5" value="${b.pays === 'points' ? b.points : b.bonusDollars || 1}"></div>
        <div class="field"><label>Worth (allowance chores)</label><select id="bWeight">${worthOpts(cw(b))}</select></div></div>
      <div class="small muted bold">Changes apply next time it's added. Chores already on this week stay as they are.</div>
      <div class="modal-btns"><button class="btn white" data-act="modal-close">Cancel</button><button class="btn" data-act="bank-save">Save</button></div>`);
  },
  'bank-save'() {
    const b = S.bank[editingBank]; if (!b) return closeModal();
    const name = el('bName').value.trim(); if (!name) return;
    const pays = el('bPays').value, amt = parseFloat(el('bAmt').value) || 0;
    Object.assign(b, { name, dod: el('bDod').value.trim(), freq: el('bFreq').value, pays, extra: pays === 'extra',
      bonusDollars: pays === 'extra' ? (amt || 1) : 0, points: pays === 'points' ? Math.round(amt || 10) : 0,
      weight: pays === 'allowance' ? Number(el('bWeight').value) || 1 : 1 });
    closeModal(); commit('Saved');
  },

  'pen-open'({ k }) {
    const i = Number(k); penKid = i;
    const p = payoutParts(i);
    openModal(`<div class="modal-title">⚠️ Disrespect — ${esc(S.names[i])}</div>
      <div class="muted bold">This wipes ${esc(S.names[i])}'s chore money and grade bonus for the week (${money(p.choreBefore + gradeImprovementBonus(S.kids[i]))} right now). Extra-credit chores can still earn up to $5 back. Points and screen time aren't touched.</div>
      <div class="field"><label for="penNote">Note she'll see (optional)</label><input id="penNote" type="text" maxlength="120" placeholder="e.g. Talked back at dinner"></div>
      <div class="modal-btns"><button class="btn white" data-act="modal-close">Cancel</button><button class="btn danger" data-act="pen-save">Wipe this week</button></div>`);
  },
  'pen-save'() {
    const i = penKid; if (!isKid(i)) return closeModal();
    const note = el('penNote').value.trim();
    closeModal();
    undoable(S.names[i] + "'s allowance wiped this week", () => {
      S.penalties.push({ id: uid(), kid: i, at: now(), note });
      log('Disrespect: ' + S.names[i] + "'s allowance wiped" + (note ? ' — ' + note : ''));
    });
  },
  'pen-del'({ id }) {
    const x = S.penalties.find(p => p.id === id); if (!x) return;
    confirmModal('Remove this penalty?', S.names[x.kid] + "'s chore money and grade bonus come back.", 'Remove', () => {
      S.penalties = S.penalties.filter(p => p.id !== id); log('Removed penalty for ' + S.names[x.kid]); commit('Penalty removed');
    });
  },
  'bank-del'({ i }) { const b = S.bank[Number(i)]; if (!b) return; undoable('Removed "' + b.name + '" from bank', () => { S.bank.splice(Number(i), 1); }); },

  'act-did'({ id }) {
    const a = S.activities.find(x => x.id === id); if (!a) return;
    const me = isKid(ui.who) ? ui.who : 0;
    S.pointSubmissions.push({ id: uid(), activityId: a.id, activityName: a.name, kidIdx: me, points: a.points, status: 'pending', submittedAt: now() });
    markActive(me); log(S.names[me] + ' claimed "' + a.name + '"'); commit('Sent for approval 🌟');
  },
  'sub-cancel'({ id }) { S.pointSubmissions = S.pointSubmissions.filter(p => p.id !== id); commit('Cancelled'); },
  'sub-ok'({ id }) {
    const p = S.pointSubmissions.find(x => x.id === id); if (!p) return;
    const k = S.kids[p.kidIdx];
    k.points = (k.points || 0) + p.points; k.weekPoints = (k.weekPoints || 0) + p.points;
    S.teamPoints = (S.teamPoints || 0) + p.points;
    S.pointSubmissions = S.pointSubmissions.filter(x => x.id !== id);
    log('Approved "' + p.activityName + '" for ' + S.names[p.kidIdx] + ' (+' + p.points + ')');
    confetti(); commit('+' + p.points + ' pts for ' + S.names[p.kidIdx]);
  },
  'sub-no'({ id }) { const p = S.pointSubmissions.find(x => x.id === id); if (!p) return; undoable('Removed "' + p.activityName + '"', () => { S.pointSubmissions = S.pointSubmissions.filter(x => x.id !== id); }); },

  redeem({ k, id }) {
    const i = Number(k), r = (S.rewards[i] || []).find(x => x.id === id); if (!r) return;
    if (availablePoints(i) < r.cost) { toast('Not enough points yet'); return; }
    confirmModal('Redeem ' + r.name + '?', 'Uses ' + r.cost + ' points once a parent says yes.', 'Ask a parent', () => {
      S.pendingRewards.push({ id: uid(), kidIdx: i, name: r.name, cost: r.cost, status: 'pending', requestedAt: now() });
      log(S.names[i] + ' asked for "' + r.name + '"'); commit('Request sent 🎁');
    });
  },
  'req-cancel'({ id }) { S.pendingRewards = S.pendingRewards.filter(r => r.id !== id); commit('Cancelled'); },
  grant({ id }) {
    const r = S.pendingRewards.find(x => x.id === id); if (!r) return;
    const k = S.kids[r.kidIdx];
    k.points = Math.max(0, (k.points || 0) - r.cost);
    const n = r.name.toLowerCase();
    if (/screen/.test(n)) {
      const m = /(\d+)\s*(min|hour|hr)/.exec(n);
      const add = m ? Number(m[1]) * (/hour|hr/.test(m[2]) ? 60 : 1) : 30;
      k.screenMinsBonus = (k.screenMinsBonus || 0) + add;
    }
    r.status = 'approved'; r.decidedAt = now();
    log('Granted "' + r.name + '" to ' + S.names[r.kidIdx]); confetti(); commit('Granted 🎁');
  },
  deny({ id }) { const r = S.pendingRewards.find(x => x.id === id); if (!r) return; r.status = 'denied'; r.decidedAt = now(); log('Denied "' + r.name + '"'); commit('Denied'); },

  pts({ k, n }) { const i = Number(k), kid = S.kids[i]; kid.points = Math.max(0, (kid.points || 0) + Number(n)); log(S.names[i] + ' points ' + (n > 0 ? '+' : '') + n); commit(S.names[i] + ': ' + kid.points + ' pts'); },
  screen({ k, n }) { const i = Number(k), kid = S.kids[i]; kid.screenMinsUsed = Math.max(0, (kid.screenMinsUsed || 0) + Number(n)); log(S.names[i] + ' screen time ' + (n > 0 ? '+' : '') + n + 'm'); commit(mins(screen(i).left) + ' screen time left'); },

  'grades-open'() {
    openModal(`<div class="modal-title">📚 Update grades</div><div class="small muted bold">Compared to last week's grades. Baselines reset when you start a new week.</div>
      ${[0, 1].map(i => `<div class="card tight" style="box-shadow:none;background:#faf9fe"><div class="kid-name" style="--kc:var(--k${i})">${esc(S.emojis[i])} ${esc(S.names[i])}</div>
        <div class="grades mt8">${SUBJECTS.map(s => `<div class="field"><label class="small">${s}</label><select data-gk="${i}" data-gs="${s}">${['A', 'B', 'C', 'D', 'F'].map(g => `<option ${S.kids[i].subjects[s].current === g ? 'selected' : ''}>${g}</option>`).join('')}</select><span class="small muted">was ${S.kids[i].subjects[s].baseline}</span></div>`).join('')}</div></div>`).join('')}
      <div class="modal-btns"><button class="btn white" data-act="modal-close">Cancel</button><button class="btn" data-act="grades-save">Save grades</button></div>`);
  },
  'grades-save'() {
    document.querySelectorAll('[data-gk]').forEach(sel => { S.kids[Number(sel.dataset.gk)].subjects[sel.dataset.gs].current = sel.value; });
    log('Grades updated'); closeModal(); commit('Grades saved');
  },

  'new-week'() {
    requirePin(() => confirmModal('Start a new week?', 'Clears this week\'s chores and any disrespect penalty, resets points, screen time and the team goal, makes current grades the new baseline, and loads the 📌 every-week chores. You\'ll have 30 seconds to undo.', 'Start new week', () => {
      const snap = JSON.stringify(S);
      S.kids.forEach(k => {
        SUBJECTS.forEach(s => { k.subjects[s].baseline = k.subjects[s].current; });
        k.points = 0; k.weekPoints = 0; k.screenMinsUsed = 0; k.screenMinsBonus = 0;
      });
      S.chores = [];
      S.penalties = [];
      S.pointSubmissions = S.pointSubmissions.filter(p => p.status === 'pending');
      S.pendingRewards = S.pendingRewards.filter(r => r.status === 'pending');
      S.teamPoints = 0;
      S.week = weekLabel();
      let n = 0; S.bank.forEach(b => b.auto.forEach(k => { n += expandChore({ ...b, kid: k, recurring: true }); }));
      log('New week started' + (n ? ' — ' + n + ' every-week chores loaded' : ''));
      save(); render();
      toast(n ? 'New week — ' + n + ' every-week chores loaded' : 'New week started — add chores from the bank', 'Undo', () => { S = normalize(JSON.parse(snap)); save(); render(); toast('New week undone'); }, 30000);
    }, true), 'PIN to start a new week');
  },

  'save-family'() {
    S.names[0] = el('sName0').value.trim() || S.names[0]; S.names[1] = el('sName1').value.trim() || S.names[1];
    S.emojis[0] = el('sEmo0').value.trim() || S.emojis[0]; S.emojis[1] = el('sEmo1').value.trim() || S.emojis[1];
    const base = parseFloat(el('sBase').value), max = parseFloat(el('sMax').value), scr = parseFloat(el('sScreen').value);
    if (base > 0) S.base = base; if (max >= S.base) S.maxPay = max; if (scr > 0) S.screenTimeBase = Math.round(scr * 60);
    log('Settings updated'); commit('Saved');
  },
  'goal-save'() {
    S.teamGoal = { name: el('gName').value.trim() || S.teamGoal.name, emoji: el('gEmo').value.trim() || '💜', target: Math.max(10, parseInt(el('gTarget').value) || 400) };
    commit('Team goal saved');
  },
  'pin-save'() {
    const cur = el('pCur') ? el('pCur').value : null, nw = el('pNew').value.trim();
    if (S.pin && cur !== S.pin) { toast('Current PIN is wrong'); return; }
    if (nw && !/^\d{4}$/.test(nw)) { toast('PIN must be 4 digits'); return; }
    S.pin = nw || null; log('Parent PIN ' + (nw ? 'updated' : 'removed')); commit(nw ? 'PIN saved 🔐' : 'PIN removed');
  },
  'activity-add'() {
    const name = el('aName').value.trim(), pts = parseInt(el('aPts').value) || 10; if (!name) return;
    S.activities.push({ id: uid(), name, points: pts }); commit('Activity added');
  },
  'activity-del'({ id }) { const a = S.activities.find(x => x.id === id); if (!a) return; undoable('Removed "' + a.name + '"', () => { S.activities = S.activities.filter(x => x.id !== id); }); },
  'reward-add'() {
    const name = el('rName').value.trim(), cost = parseInt(el('rCost').value) || 10; if (!name) return;
    S.rewards.forEach(list => list.push({ id: uid(), name, cost })); commit('Reward added');
  },
  'reward-del'({ name }) { undoable('Removed "' + name + '"', () => { S.rewards = S.rewards.map(list => list.filter(r => r.name !== name)); }); },

  async export() {
    const pass = el('bPass').value; if (!pass) { toast('Enter a passphrase first'); return; }
    try {
      const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
      const key = await deriveKey(pass, salt, ['encrypt']);
      const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(S)));
      const b64 = b => btoa(String.fromCharCode(...new Uint8Array(b)));
      const blob = JSON.stringify({ v: 1, s: b64(salt), i: b64(iv), d: b64(ct), t: new Date().toISOString() });
      el('bBlob').value = blob;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([blob], { type: 'application/json' }));
      a.download = 'chore-club-backup-' + dateKey() + '.json'; a.click();
      toast('Backup downloaded 💾');
    } catch (e) { toast('Export failed'); }
  },
  async import() {
    const pass = el('bPass').value; if (!pass) { toast('Enter the passphrase'); return; }
    try {
      const pkg = JSON.parse(el('bBlob').value);
      const d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
      const key = await deriveKey(pass, d(pkg.s), ['decrypt']);
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: d(pkg.i) }, key, d(pkg.d));
      const imp = JSON.parse(new TextDecoder().decode(pt));
      if (!imp.kids) throw new Error('bad');
      confirmModal('Replace everything with this backup?', 'From ' + (pkg.t ? new Date(pkg.t).toLocaleString() : 'unknown date') + '. This overwrites what\'s here now on every device.', 'Restore', () => { S = normalize(imp); log('Restored from backup'); commit('Backup restored'); }, true);
    } catch (e) { toast('Wrong passphrase or broken backup'); }
  },
  'clear-test'() {
    confirmModal('Clear test data?', 'Removes this week\'s chores, claims and reward requests, and resets screen time. Names, grades, bank and menus stay.', 'Clear', () => {
      undoable('Test data cleared', () => { S.chores = []; S.penalties = []; S.pointSubmissions = []; S.pendingRewards = []; S.teamPoints = 0; S.kids.forEach(k => { k.screenMinsUsed = 0; k.screenMinsBonus = 0; }); log('Test data cleared'); });
    }, true);
  },
  'clear-all'() {
    requirePin(() => confirmModal('Erase EVERYTHING?', 'Every chore, bank item, grade, point and setting — on all devices. Export a backup first if you might want it.', 'Erase all', () => {
      undoable('Everything erased', () => { const pin = S.pin; S = defaultState(); S.pin = pin; log('All data cleared'); });
    }, true), 'PIN to erase data');
  },
  'log-export'() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([(S.logs || []).join('\n')], { type: 'text/plain' }));
    a.download = 'chore-club-log-' + dateKey() + '.txt'; a.click();
  },
  async 'push-on'() {
    try {
      if (isIOS() && !isStandalone()) { pushState = 'install'; render(); return; }
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { pushState = perm === 'denied' ? 'denied' : 'off'; render(); toast('Notifications weren\'t allowed'); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(VAPID_PUBLIC) });
      const j = sub.toJSON();
      const r = await fetch(SUPABASE_URL + '/rest/v1/push_subs', { method: 'POST',
        headers: { ...db.h, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ endpoint: j.endpoint, sub: j, label: deviceLabel() }) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      pushState = 'on'; log('Turned on alerts on ' + deviceLabel()); render(); toast('🔔 Alerts on — sending a test…');
      A['push-test'](true);
    } catch (e) { console.error(e); toast('Couldn\'t turn on alerts — check your connection'); refreshPushState(); }
  },
  async 'push-off'() {
    try {
      const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch(SUPABASE_URL + '/rest/v1/push_subs?endpoint=eq.' + encodeURIComponent(sub.endpoint), { method: 'DELETE', headers: db.h });
        await sub.unsubscribe();
      }
      pushState = 'off'; render(); toast('Alerts off on this device');
    } catch (e) { console.error(e); toast('Couldn\'t turn off alerts'); }
  },
  async 'push-test'(quiet) {
    try {
      await flush();
      const r = await fetch(ALERTS_FN, { method: 'POST', headers: { ...db.h }, body: JSON.stringify({ mode: 'test' }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || r.status);
      if (quiet !== true) toast(j.sent ? '🔔 Test sent to ' + j.sent + ' device' + (j.sent > 1 ? 's' : '') : 'No devices have alerts on yet');
    } catch (e) { console.error(e); toast('Test alert failed'); }
  },
  'alert-hour'({ h }) {
    h = Number(h);
    const cur = S.alertHours || [];
    S.alertHours = cur.includes(h) ? cur.filter(x => x !== h) : [...cur, h].sort((a, b) => a - b);
    commit(S.alertHours.length ? 'Alerts at ' + S.alertHours.map(hourLabel).join(', ') : 'No alert times — notifications paused');
  },
  lock() { parentUnlocked = false; sessionStorage.removeItem('cc-parent'); ui.who = parentReturn ?? 0; saveUI(); render(); toast('Parent mode locked'); },

  'modal-close'() { pinCb = null; confirmCb = null; closeModal(); },
  'confirm-ok'() { const cb = confirmCb; confirmCb = null; closeModal(); if (cb) cb(); },
  'pin-key'({ k }) { pinKey(k); },
  'toast-action'() { const f = toastAction; toastAction = null; el('toast').classList.remove('show'); if (f) f(); }
};
let editingBank = null, penKid = null;
function bakedMissing() {
  const out = [];
  S.bank.forEach(b => b.auto.forEach(k => { if (!S.chores.some(c => c.kid === k && c.baseName.toLowerCase() === b.name.toLowerCase())) out.push({ b, k }); }));
  return out;
}
let editingId = null, parentReturn = isKid(ui.who) ? ui.who : 0;

async function deriveKey(pass, salt, usage) {
  const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, usage);
}

// ── EVENTS ───────────────────────────────────────────────────
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]');
  if (!t || t.disabled) return;
  const fn = A[t.dataset.act];
  if (!fn) return;
  e.preventDefault();
  try { fn({ ...t.dataset }); } catch (err) { console.error(err); toast('Something went wrong'); }
});
document.addEventListener('change', e => {
  if (e.target.id === 'fPays') {
    const v = e.target.value;
    el('fAmtRow').hidden = v === 'allowance';
    el('fWRow').hidden = v !== 'allowance';
    el('fAmtLbl').textContent = v === 'points' ? 'Bonus points' : 'Extra $';
    el('fAmt').value = v === 'points' ? 15 : 1;
    el('fAmt').step = v === 'points' ? 5 : 0.5;
  }
});
document.addEventListener('keydown', e => {
  if (el('modal').open && /^[0-9]$/.test(e.key) && el('pinDots')) pinKey(e.key);
  if (el('modal').open && e.key === 'Backspace' && el('pinDots')) pinKey('back');
  if (e.key === 'Enter' && e.target.id === 'fName') A['add-chore']();
});
el('modal').addEventListener('close', () => { pinCb = null; });
el('modal').addEventListener('click', e => { if (e.target === el('modal')) A['modal-close'](); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) pull(); });
window.addEventListener('online', () => flush());

// ── START ────────────────────────────────────────────────────
async function init() {
  S = await loadState();
  cacheLocal();
  if (ui.who === 'parent' && !parentUnlocked) ui.who = parentReturn;
  render();
  if (new URLSearchParams(location.search).get('parent') === 'inbox') {
    history.replaceState(null, '', location.pathname);
    ui.tabs.parent = 'inbox';
    if (inParent()) render(); else A.who({ who: 'parent' });
  }
  setInterval(pull, PULL_EVERY);
  setInterval(() => { if (!document.hidden) render(); }, 5 * 60000); // keep "Xh ago" & today's list fresh
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', e => {
    if (e.data && e.data.type === 'open-inbox') { ui.tabs.parent = 'inbox'; if (inParent()) { pull(); render(); } else A.who({ who: 'parent' }); }
  });
}
init();
