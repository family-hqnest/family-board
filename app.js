// ── CONFIG ────────────────────────────────────────────────
const SUPABASE_URL = 'https://fjvhkiynqejnbdbfwyxx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqdmhraXlucWVqbmJkYmZ3eXh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MTQ2OTUsImV4cCI6MjA4OTA5MDY5NX0.Rk2APihye1Zut-k5Wmm7Kn3NmIWIvM74srtBM-8vjA4';
const FAMILY_ID   = 'family';
const STORAGE_KEY = 'famboard-v1';

// ── HELPERS ───────────────────────────────────────────────
const now       = () => Date.now();
const uid       = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
const money     = (n) => '$' + Number(n).toFixed(2);
const gradeRank = { A: 4, B: 3, C: 2, D: 1, F: 0 };
const SUBJECTS  = ['Math', 'English', 'Science', 'History'];
const LEVELS    = ['Rookie', 'Rising Star', 'Champion', 'Legend', 'Superstar'];
const DAYS      = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ── DEFAULT STATE ─────────────────────────────────────────
function defaultState() {
  return {
    names:      ['Sofia', 'Juliana'],
    emojis:     ['🧒', '👩'],
    maxPay:     30,
    base:       20,
    week:       weekLabel(),
    pin:        null,
    kids:       [makeKid(), makeKid()],
    chores:     [],
    logs:       [],
    bank:       [],
    activities: defaultActivities(),
    rewards:    [defaultRewards(), defaultRewards()],
    pendingRewards: [],
    pointSubmissions: []
  };
}

function makeKid() {
  const subj = {};
  SUBJECTS.forEach(s => { subj[s] = { current: 'B', baseline: 'B' }; });
  return { xp: 0, streak: 0, subjects: subj, points: 0 };
}

function defaultActivities() {
  return [
    { id: uid(), name: '30 min outdoor activity', points: 15 },
    { id: uid(), name: 'Read for 30 min', points: 10 },
    { id: uid(), name: 'Cook a meal or snack', points: 20 },
    { id: uid(), name: 'Creative project (art, music)', points: 15 },
    { id: uid(), name: 'In-person hangout with friend', points: 20 },
    { id: uid(), name: 'Exercise / sport (30+ min)', points: 20 },
    { id: uid(), name: 'Learn something new (30 min)', points: 15 }
  ];
}

function defaultRewards() {
  return [
    { id: uid(), name: '+30 min screen time', cost: 10 },
    { id: uid(), name: '+1 hour screen time', cost: 20 },
    { id: uid(), name: 'Choose family dinner', cost: 25 },
    { id: uid(), name: 'Stay up 30 min later', cost: 30 },
    { id: uid(), name: 'Pick family movie', cost: 15 },
    { id: uid(), name: 'Skip one chore', cost: 40 },
    { id: uid(), name: 'Special outing of choice', cost: 100 }
  ];
}

function weekLabel() {
  const d = new Date(), mon = new Date(d);
  mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  return mon.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    + ' - ' + sun.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── SUPABASE ──────────────────────────────────────────────
const db = {
  h: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' },
  async load() {
    try {
      const res = await fetch(SUPABASE_URL + '/rest/v1/board_state?id=eq.' + FAMILY_ID + '&select=data', { headers: this.h });
      const rows = await res.json();
      if (Array.isArray(rows) && rows.length > 0 && rows[0].data) return rows[0].data;
      return null;
    } catch(e) { console.warn('Supabase load failed:', e); return null; }
  },
  async save(state) {
    try {
      await fetch(SUPABASE_URL + '/rest/v1/board_state', { method: 'POST', headers: this.h, body: JSON.stringify({ id: FAMILY_ID, data: state, updated_at: new Date().toISOString() }) });
      dot('saved');
    } catch(e) { console.warn('Supabase save failed:', e); dot('error'); }
  }
};

function dot(status) {
  const e = document.getElementById('syncDot');
  if (!e) return;
  e.className = 'sync-dot ' + status;
  e.title = { saved: 'Synced', saving: 'Saving...', error: 'Sync error', offline: 'Offline' }[status] || '';
}

// ── STORAGE ───────────────────────────────────────────────
async function loadState() {
  dot('saving');
  const remote = await db.load();
  if (remote) {
    // Ensure new fields exist on loaded state
    if (!remote.activities) remote.activities = defaultActivities();
    if (!remote.rewards) remote.rewards = [defaultRewards(), defaultRewards()];
    if (!remote.pendingRewards) remote.pendingRewards = [];
    if (!remote.pointSubmissions) remote.pointSubmissions = [];
    if (!remote.bank) remote.bank = [];
    remote.kids.forEach(k => { if (k.points === undefined) k.points = 0; });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(remote));
    dot('saved');
    return remote;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) { dot('offline'); return JSON.parse(raw); }
  } catch(e) {}
  dot('offline');
  return defaultState();
}

async function saveState() {
  dot('saving');
  localStorage.setItem(STORAGE_KEY, JSON.stringify(S));
  await db.save(S);
}

// ── PAYOUT MATH ───────────────────────────────────────────
function committedChores(kidIdx) {
  return S.chores.filter(c => c.kid === kidIdx && !c.extra);
}

function choreValue(kidIdx) {
  const total = committedChores(kidIdx).length;
  return total === 0 ? 0 : S.base / total;
}

function gradeImprovementBonus(kid) {
  let bonus = 0;
  SUBJECTS.forEach(s => {
    const base = gradeRank[kid.subjects[s].baseline] || 0;
    const cur  = gradeRank[kid.subjects[s].current]  || 0;
    if (cur > base) bonus += 1.25;
  });
  return Math.min(5, bonus);
}

function gradeGrowthPct(kid) {
  let score = 0, max = 0;
  SUBJECTS.forEach(s => {
    const base = gradeRank[kid.subjects[s].baseline] || 0;
    const cur  = gradeRank[kid.subjects[s].current]  || 0;
    score += Math.max(0, base * 5 + (cur - base) * 10);
    max += 60;
  });
  return max > 0 ? Math.round((score / max) * 100) : 0;
}

function kidPayout(kidIdx) {
  const val      = choreValue(kidIdx);
  const total    = committedChores(kidIdx).length;
  const missed   = S.chores.filter(c => c.kid === kidIdx && !c.extra && c.status === 'rejected').length;
  const choreEarned = Math.max(0, S.base - (missed * val));
  const extraEarned = Math.min(5, S.chores.filter(c => c.kid === kidIdx && c.extra && c.status === 'approved').reduce((s, c) => s + (c.bonusDollars || 0), 0));
  const gradeBonus  = gradeImprovementBonus(S.kids[kidIdx]);
  return Math.max(0, Math.min(S.maxPay, choreEarned + extraEarned + gradeBonus));
}

// ── STATE ─────────────────────────────────────────────────
let S            = defaultState();
let filterActive = 'all';
let pinPending   = null;
let weekSnapshot = null;
let undoTimer    = null;
let activeTab    = 'home';
let pendingActivityIdx = null;
let rewardModalKid = 0;

// ── INIT ──────────────────────────────────────────────────
async function init() {
  S = await loadState();
  if (!S || !S.kids) S = defaultState();
  bindEvents();
  render();
  startClock();
  registerSW();
}

// ── WEEK GUARD (disabled - manual only) ───────────────────
function weekGuard() { return; }

// ── AUTO APPROVE 48H ──────────────────────────────────────
function autoApprove() {
  const cutoff = now() - 48 * 60 * 60 * 1000;
  let changed = false;
  S.chores.forEach(c => {
    if (c.status === 'pending' && c.submittedAt && c.submittedAt <= cutoff) {
      c.status = 'approved';
      if (typeof c.kid === 'number') S.kids[c.kid].xp = (S.kids[c.kid].xp || 0) + 1;
      changed = true;
      log('Auto-approved "' + c.name + '" after 48h');
    }
  });
  if (changed) saveState();
}

// ── LOG ───────────────────────────────────────────────────
function log(msg) {
  S.logs = [new Date().toLocaleString() + ': ' + msg, ...(S.logs || [])].slice(0, 100);
}

// ── CHORE EXPANSION ───────────────────────────────────────
function expandChore(def) {
  const instances = def.freq === 'daily' ? 7 : def.freq === 'twice-weekly' ? 2 : 1;
  for (let i = 0; i < instances; i++) {
    const label = instances === 1 ? def.name
      : def.freq === 'daily' ? def.name + ' - ' + DAYS[i]
      : def.name + ' (' + (i + 1) + '/2)';
    S.chores.push({
      id: uid(), name: label, baseName: def.name,
      kid: def.kid, freq: def.freq,
      extra: def.extra || false,
      bonusDollars: def.bonusDollars || 0,
      dod: def.dod || '',
      recurring: def.recurring || false,
      status: 'none', createdAt: now(), submittedAt: null
    });
  }
}

// ── EL HELPER ─────────────────────────────────────────────
function el(id) { return document.getElementById(id); }

// ── RENDER ────────────────────────────────────────────────
function render() {
  autoApprove();
  renderHome();
  renderChores();
  renderBank();
  renderActivities();
  renderRewardMenu();
  renderGrades();
  renderLog();
  const wk2 = el('weekKey2'); if (wk2) wk2.textContent = S.week;
  const ds = el('dataSize'); if (ds) ds.textContent = (JSON.stringify(S).length / 1024).toFixed(2) + ' KB';
}

function renderHome() {
  const wk = el('weekKey'); if (wk) wk.textContent = S.week;
  const p0 = kidPayout(0), p1 = kidPayout(1);
  el('payoutVal').textContent     = money(p0 + p1);
  el('approvedCount').textContent = S.chores.filter(c => c.status === 'approved').length;
  el('pendingCount').textContent  = S.chores.filter(c => c.status === 'pending').length;
  el('rejectedCount').textContent = S.chores.filter(c => c.status === 'rejected').length;

  [0, 1].forEach(i => {
    const n          = i === 0 ? 'kid1' : 'kid2';
    const pay        = i === 0 ? p0 : p1;
    const val        = choreValue(i);
    const total      = committedChores(i).length;
    const approved   = S.chores.filter(c => c.kid === i && !c.extra && c.status === 'approved').length;
    const pending    = S.chores.filter(c => c.kid === i && c.status === 'pending').length;
    const gradeBonus = gradeImprovementBonus(S.kids[i]);
    const growthPct  = gradeGrowthPct(S.kids[i]);
    const pct        = Math.max(0, Math.min(100, (pay / S.maxPay) * 100));
    const points     = S.kids[i].points || 0;

    el('kidAvatar' + i).textContent        = S.emojis[i];
    el(n + 'Name').textContent             = S.names[i];
    el(n + 'PayoutVal').textContent        = money(pay);
    el(n + 'PendingCount').textContent     = pending + ' pending';
    el(n + 'ChoreRatio').textContent       = approved + '/' + total + ' chores';
    el(n + 'GradeRatio').textContent       = growthPct + '% growth';
    el(n + 'Points').textContent           = points;

    const bar = el(n + 'Progress'); if (bar) bar.style.width = pct + '%';

    const bk = el(n + 'Breakdown');
    if (bk) bk.innerHTML =
      '<div class="small muted">Each chore: <b>' + (total > 0 ? money(val) : '--') + '</b> (' + money(S.base) + ' / ' + total + ')</div>' +
      (gradeBonus > 0 ? '<div class="small" style="color:#a78bfa">Grade bonus: +' + money(gradeBonus) + '</div>' : '') +
      '<div class="small" style="font-weight:700">Total: ' + money(pay) + '</div>';

    // Update kid name color in card
    const nameEl = el(n + 'Name');
    if (nameEl) nameEl.style.color = i === 0 ? 'var(--k1)' : 'var(--k2)';
  });

  // Update choreKid select with current names
  const choreKid = el('choreKid');
  if (choreKid) {
    choreKid.options[0].text = '🧒 ' + S.names[0];
    choreKid.options[1].text = '👩 ' + S.names[1];
  }
}

function renderChores() {
  const list = el('choreList'); if (!list) return;
  let chores = [...S.chores];
  if (filterActive === 'pending')  chores = chores.filter(c => c.status === 'pending');
  if (filterActive === 'approved') chores = chores.filter(c => c.status === 'approved');
  if (filterActive === 'notdone')  chores = chores.filter(c => c.status === 'none');
  if (filterActive === 'rejected') chores = chores.filter(c => c.status === 'rejected');
  if (filterActive === 'kid1')     chores = chores.filter(c => c.kid === 0);
  if (filterActive === 'kid2')     chores = chores.filter(c => c.kid === 1);

  if (chores.length === 0) {
    list.innerHTML = '<div class="muted small" style="text-align:center;padding:20px">No chores here!</div>';
    return;
  }

  list.innerHTML = chores.map(c => {
    const kidName  = c.kid === 0 ? S.names[0] : c.kid === 1 ? S.names[1] : 'Shared';
    const kidColor = c.kid === 0 ? 'var(--k1)' : c.kid === 1 ? 'var(--k2)' : '#888';
    const val      = (typeof c.kid === 'number' && !c.extra) ? choreValue(c.kid) : 0;
    const valLabel = c.extra ? '+' + money(c.bonusDollars || 0) : money(val);
    const recIcon  = c.recurring ? ' 🔁' : '';
    const extraIcon = c.extra ? ' ⭐' : '';
    const dodNote  = c.dod ? '<div class="small muted" style="font-style:italic;margin-top:2px">' + c.dod + '</div>' : '';
    const hrs      = c.submittedAt ? Math.floor((now() - c.submittedAt) / 3600000) : 0;
    const border   = c.status === 'approved' ? '#2ed573' : c.status === 'pending' ? '#ffa502' : c.status === 'rejected' ? '#ff4757' : '#333';
    const statusLabel = c.status === 'none' ? '<span style="color:#555">Not done yet</span>'
      : c.status === 'pending'  ? '<span style="color:#ffa502">⏳ Awaiting approval (' + hrs + 'h)</span>'
      : c.status === 'approved' ? '<span style="color:#2ed573">✅ Approved - ' + valLabel + '</span>'
      : '<span style="color:#ff4757">❌ Rejected - redo it</span>';
    const actionBtns = c.status === 'none'
      ? '<button data-action="submit" data-id="' + c.id + '" class="small-btn">Mark Done</button>'
      : c.status === 'pending'
      ? '<button data-action="approve" data-id="' + c.id + '" class="small-btn" style="color:#2ed573;border-color:rgba(46,213,115,0.3)">✓</button><button data-action="reject" data-id="' + c.id + '" class="small-btn" style="color:#ff4757;border-color:rgba(255,71,87,0.3)">✗</button>'
      : '<button data-action="reset" data-id="' + c.id + '" class="small-btn">↩</button>';
    return '<div class="todo" style="border-left-color:' + border + '" data-id="' + c.id + '">' +
      '<div class="todo-info"><div><b>' + c.name + '</b>' + recIcon + extraIcon + ' <span class="small muted">(' + valLabel + ' · </span><span style="color:' + kidColor + ';font-size:.78rem;font-weight:700">' + kidName + '</span><span class="small muted">)</span></div>' + dodNote + '<div style="margin-top:3px">' + statusLabel + '</div></div>' +
      '<div class="todo-actions">' + actionBtns + '<button data-action="edit" data-id="' + c.id + '" class="small-btn">✏️</button><button data-action="delete" data-id="' + c.id + '" class="small-btn" style="opacity:.4">✕</button></div></div>';
  }).join('');
}

function renderBank() {
  const list = el('bankList'); if (!list) return;
  if (!S.bank || S.bank.length === 0) {
    list.innerHTML = '<div class="muted small" style="padding:12px;text-align:center">No saved chores yet. Add chores with "Save to Bank" checked.</div>';
    return;
  }
  list.innerHTML = S.bank.map((b, i) => {
    const freqLabel = b.freq === 'daily' ? '📅 Daily' : b.freq === 'twice-weekly' ? '📅 2x/wk' : '📆 Weekly';
    const dodNote = b.dod ? '<div class="small muted" style="font-style:italic">' + b.dod + '</div>' : '';
    return '<div class="activity-item">' +
      '<div class="activity-info"><div><b>' + b.name + '</b> <span class="small muted">(' + freqLabel + ')</span></div>' + dodNote + '</div>' +
      '<select id="bankKid_' + i + '" style="width:100px;font-size:.78rem;padding:4px 6px"><option value="0">🧒 ' + S.names[0] + '</option><option value="1">👩 ' + S.names[1] + '</option><option value="shared">Shared</option></select>' +
      '<button data-bank-add="' + i + '" class="small-btn" style="color:#2ed573;border-color:rgba(46,213,115,0.3)">+ Add</button>' +
      '<button data-bank-del="' + i + '" class="small-btn" style="opacity:.4">✕</button>' +
      '</div>';
  }).join('');
}

function renderActivities() {
  const list = el('activityList'); if (!list) return;
  if (!S.activities || S.activities.length === 0) {
    list.innerHTML = '<div class="muted small" style="padding:12px;text-align:center">No activities yet.</div>';
    return;
  }

  // Show pending submissions too
  const pending = (S.pointSubmissions || []).filter(p => p.status === 'pending');

  list.innerHTML = S.activities.map((a, i) => {
    const pendingForActivity = pending.filter(p => p.activityId === a.id);
    const pendingBadge = pendingForActivity.length > 0
      ? '<span style="color:#ffa502;font-size:.72rem;font-weight:700"> · ' + pendingForActivity.length + ' pending</span>'
      : '';
    return '<div class="activity-item">' +
      '<div class="activity-info"><div><b>' + a.name + '</b><span style="color:#ffa502;font-size:.78rem;font-weight:700;margin-left:6px">+' + a.points + ' pts</span>' + pendingBadge + '</div></div>' +
      '<button data-activity-submit="' + i + '" class="small-btn" style="color:#ffa502;border-color:rgba(255,165,2,0.3)">Submit</button>' +
      '<button data-activity-del="' + i + '" class="small-btn" style="opacity:.4">✕</button>' +
      '</div>';
  }).join('');

  // Show pending approval items
  if (pending.length > 0) {
    list.innerHTML += '<div style="margin-top:12px"><div class="small muted" style="margin-bottom:6px;text-transform:uppercase;letter-spacing:1px">Awaiting Approval</div>' +
      pending.map((p, i) => {
        const act = S.activities.find(a => a.id === p.activityId);
        const kidName = S.names[p.kidIdx] || 'Unknown';
        const kidColor = p.kidIdx === 0 ? 'var(--k1)' : 'var(--k2)';
        return '<div class="activity-item" style="border-color:rgba(255,165,2,0.3)">' +
          '<div class="activity-info"><div><b>' + (act ? act.name : 'Activity') + '</b></div>' +
          '<div class="small" style="color:' + kidColor + '">' + kidName + ' · +' + p.points + ' pts</div></div>' +
          '<button data-pts-approve="' + p.id + '" class="small-btn" style="color:#2ed573;border-color:rgba(46,213,115,0.3)">✓ OK</button>' +
          '<button data-pts-reject="' + p.id + '" class="small-btn" style="opacity:.4">✕</button>' +
          '</div>';
      }).join('') + '</div>';
  }
}

function renderRewardMenu() {
  const list = el('rewardMenuList'); if (!list) return;
  if (!S.rewards || (!S.rewards[0].length && !S.rewards[1].length)) {
    list.innerHTML = '<div class="muted small" style="padding:12px;text-align:center">No rewards yet.</div>';
    return;
  }
  // Show combined unique rewards (both kids share same menu but costs can differ)
  const allRewards = S.rewards[0];
  list.innerHTML = allRewards.map((r, i) => {
    return '<div class="reward-item">' +
      '<div class="reward-info"><div><b>' + r.name + '</b></div></div>' +
      '<span class="reward-cost-badge">⭐ ' + r.cost + ' pts</span>' +
      '<button data-reward-del="' + i + '" class="small-btn" style="opacity:.4">✕</button>' +
      '</div>';
  }).join('');

  // Show pending reward requests
  const pendingR = (S.pendingRewards || []).filter(r => r.status === 'pending');
  if (pendingR.length > 0) {
    list.innerHTML += '<div style="margin-top:12px"><div class="small muted" style="margin-bottom:6px;text-transform:uppercase;letter-spacing:1px">Pending Requests</div>' +
      pendingR.map(r => {
        const kidColor = r.kidIdx === 0 ? 'var(--k1)' : 'var(--k2)';
        return '<div class="reward-item" style="border-color:rgba(255,165,2,0.3)">' +
          '<div class="reward-info"><div><b>' + r.name + '</b></div><div class="small" style="color:' + kidColor + '">' + S.names[r.kidIdx] + ' · ' + r.cost + ' pts</div></div>' +
          '<button data-reward-approve="' + r.id + '" class="small-btn" style="color:#2ed573;border-color:rgba(46,213,115,0.3)">✓ Grant</button>' +
          '<button data-reward-deny="' + r.id + '" class="small-btn" style="opacity:.4">✕ Deny</button>' +
          '</div>';
      }).join('') + '</div>';
  }
}

function renderGrades() {
  const gs = el('gradeSummary'); if (!gs) return;
  gs.innerHTML = S.kids.map((kid, i) => {
    const rows = SUBJECTS.map(s => {
      const cur = kid.subjects[s].current, base = kid.subjects[s].baseline;
      const diff = (gradeRank[cur] || 0) - (gradeRank[base] || 0);
      const arrow = diff > 0 ? '<span style="color:#2ed573">▲</span>' : diff < 0 ? '<span style="color:#ff4757">▼</span>' : '<span style="color:#555">-</span>';
      return '<span class="small">' + s + ': <b>' + cur + '</b>' + arrow + '</span>';
    }).join('&nbsp;&nbsp;');
    const color = i === 0 ? 'var(--k1)' : 'var(--k2)';
    return '<div style="margin:8px 0;padding:8px;background:var(--card2);border-radius:10px"><b style="color:' + color + '">' + S.emojis[i] + ' ' + S.names[i] + '</b><br><span style="line-height:2">' + rows + '</span></div>';
  }).join('');
}

function renderLog() {
  const act = el('activity'); if (!act) return;
  act.innerHTML = (S.logs || []).slice(0, 10).map(l => '<div class="small muted" style="padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05)">• ' + l + '</div>').join('') || '<span class="muted small">No activity yet.</span>';
}

// ── CONFETTI ──────────────────────────────────────────────
function confetti() {
  const colors = ['#ff69b4','#9b59b6','#ffa502','#2ed573','#00d2d3'];
  for (let i = 0; i < 35; i++) {
    const s = document.createElement('div');
    s.className = 'confetti-piece';
    s.style.cssText = 'left:' + (Math.random()*100) + 'vw;background:' + colors[i%colors.length] + ';width:' + (6+Math.random()*8) + 'px;height:' + (6+Math.random()*8) + 'px;border-radius:' + (Math.random()>.5?'50%':'2px') + ';animation-duration:' + (1.2+Math.random()) + 's;animation-delay:' + (Math.random()*.3) + 's';
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 2000);
  }
}

// ── PIN ───────────────────────────────────────────────────
function requirePin(onSuccess) {
  if (!S.pin) { onSuccess(); return; }
  pinPending = onSuccess;
  el('parentPin').value = '';
  el('pinModal').showModal();
}

// ── UNDO BANNERS ──────────────────────────────────────────
function showUndoBanner() {
  const existing = document.getElementById('undoBanner');
  if (existing) existing.remove();
  clearTimeout(undoTimer);
  const banner = document.createElement('div');
  banner.id = 'undoBanner';
  banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#ff4757;color:#fff;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;font-weight:700;font-size:.88rem;box-shadow:0 4px 20px rgba(0,0,0,0.4);gap:8px;flex-wrap:wrap';
  const msg = document.createElement('span');
  msg.id = 'undoCountdown';
  msg.textContent = 'New week started. Undo available for 30s...';
  const btn = document.createElement('button');
  btn.textContent = '↩ Undo';
  btn.style.cssText = 'background:#fff;color:#ff4757;border:none;padding:7px 14px;border-radius:8px;font-weight:700;cursor:pointer;font-size:.85rem;font-family:inherit';
  btn.onclick = () => {
    if (weekSnapshot) { S = JSON.parse(weekSnapshot); saveState(); render(); log('New week undone'); }
    clearTimeout(undoTimer); banner.remove(); weekSnapshot = null;
  };
  banner.appendChild(msg); banner.appendChild(btn);
  document.body.appendChild(banner);
  let secs = 30;
  const interval = setInterval(() => {
    secs--;
    const e = document.getElementById('undoCountdown');
    if (e) e.textContent = 'New week started. Undo available for ' + secs + 's...';
    if (secs <= 0) clearInterval(interval);
  }, 1000);
  undoTimer = setTimeout(() => { banner.remove(); weekSnapshot = null; }, 30000);
}

// ── REWARD MODAL ──────────────────────────────────────────
function openRewardModal(kidIdx) {
  rewardModalKid = kidIdx;
  const kid = S.kids[kidIdx];
  const points = kid.points || 0;
  const rewards = S.rewards[kidIdx] || [];
  el('rewardModalTitle').textContent = '🎁 ' + S.names[kidIdx] + "'s Rewards";
  el('rewardModalPoints').textContent = 'You have ⭐ ' + points + ' points to spend';
  el('rewardModalList').innerHTML = rewards.map((r, i) => {
    const canAfford = points >= r.cost;
    return '<div class="reward-item" style="opacity:' + (canAfford ? '1' : '0.5') + '">' +
      '<div class="reward-info"><div><b>' + r.name + '</b></div></div>' +
      '<span class="reward-cost-badge">⭐ ' + r.cost + '</span>' +
      '<button data-redeem="' + i + '" class="small-btn" style="color:#ffa502;border-color:rgba(255,165,2,0.3)"' + (canAfford ? '' : ' disabled') + '>Redeem</button>' +
      '</div>';
  }).join('') || '<div class="muted small" style="padding:12px;text-align:center">No rewards available.</div>';

  el('rewardModalList').addEventListener('click', e => {
    const btn = e.target.closest('[data-redeem]');
    if (!btn || btn.disabled) return;
    const idx = parseInt(btn.dataset.redeem);
    const reward = rewards[idx];
    const req = { id: uid(), kidIdx, rewardIdx: idx, name: reward.name, cost: reward.cost, status: 'pending', requestedAt: now() };
    if (!S.pendingRewards) S.pendingRewards = [];
    S.pendingRewards.push(req);
    log(S.names[kidIdx] + ' requested reward: ' + reward.name + ' (' + reward.cost + ' pts)');
    saveState();
    el('rewardModal').close();
    showToast(S.names[kidIdx] + ' requested "' + reward.name + '" — awaiting approval');
  }, { once: true });

  el('rewardModal').showModal();
}

// ── TOAST ─────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  let t = document.getElementById('toastEl');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toastEl';
    t.style.cssText = 'position:fixed;bottom:max(80px,calc(env(safe-area-inset-bottom,0px) + 80px));left:16px;right:16px;z-index:9999;background:#1a1a28;color:#f1f2f6;padding:12px 16px;border-radius:14px;font-weight:600;font-size:.88rem;box-shadow:0 4px 20px rgba(0,0,0,0.5);text-align:center;transition:opacity .3s';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.style.opacity = '0'; }, 2800);
}

// ── BIND EVENTS ───────────────────────────────────────────
function bindEvents() {

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      activeTab = btn.dataset.tab;
      const panel = el('tab-' + activeTab);
      if (panel) panel.classList.add('active');
    });
  });

  // Add chore
  el('addChore').addEventListener('click', () => {
    const name    = el('choreName').value.trim();
    const freq    = el('choreFrequency').value;
    const kid     = el('choreKid').value;
    const rec     = el('choreRecurring').checked;
    const isExtra = el('choreExtra').checked;
    const dod     = el('choreDod').value.trim();
    const bonus   = isExtra ? (parseFloat(el('choreBonusDollars').value) || 1) : 0;
    if (!name) { alert('Enter a chore name'); return; }
    const kidIdx = kid === 'shared' ? 'shared' : parseInt(kid);
    expandChore({ name, freq, kid: kidIdx, extra: isExtra, bonusDollars: bonus, dod, recurring: rec });
    el('choreName').value = ''; el('choreDod').value = '';
    if (el('saveToBankCheck') && el('saveToBankCheck').checked) {
      if (!S.bank) S.bank = [];
      const exists = S.bank.some(b => b.name === name);
      if (!exists) { S.bank.push({ name, freq, extra: isExtra, bonusDollars: bonus, dod, recurring: rec }); }
      el('saveToBankCheck').checked = false;
    }
    log('Added "' + name + '" for ' + (kidIdx === 'shared' ? 'Shared' : S.names[kidIdx]));
    saveState(); render();
    showToast('Added "' + name + '"');
  });

  el('choreExtra').addEventListener('change', () => {
    const row = el('bonusDollarsRow');
    if (row) row.style.display = el('choreExtra').checked ? 'flex' : 'none';
  });

  // Chore list actions
  el('choreList').addEventListener('click', e => {
    const btn = e.target.closest('button[data-action]'); if (!btn) return;
    const id = btn.dataset.id, action = btn.dataset.action;
    const chore = S.chores.find(c => c.id === id); if (!chore) return;

    if (action === 'submit') {
      chore.status = 'pending'; chore.submittedAt = now();
      log((typeof chore.kid === 'number' ? S.names[chore.kid] : 'Shared') + ' submitted "' + chore.name + '"');
      saveState(); render();
    }
    if (action === 'approve') {
      chore.status = 'approved';
      if (typeof chore.kid === 'number') S.kids[chore.kid].xp = (S.kids[chore.kid].xp || 0) + 1;
      log('Approved "' + chore.name + '"'); confetti(); saveState(); render();
    }
    if (action === 'reject') {
      chore.status = 'rejected'; log('Rejected "' + chore.name + '"'); saveState(); render();
    }
    if (action === 'reset') {
      chore.status = 'none'; chore.submittedAt = null; saveState(); render();
    }
    if (action === 'edit') { openEditModal(chore); }
    if (action === 'delete') {
      const snapshot = JSON.stringify(S);
      const choreName = chore.name;
      S.chores = S.chores.filter(c => c.id !== id);
      saveState(); render();
      const banner = document.createElement('div');
      banner.style.cssText = 'position:fixed;bottom:max(80px,calc(env(safe-area-inset-bottom,0px) + 80px));left:16px;right:16px;z-index:9999;background:#1a1a28;color:#f1f2f6;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;border-radius:14px;font-weight:600;font-size:.85rem;box-shadow:0 4px 20px rgba(0,0,0,0.5);gap:8px';
      banner.innerHTML = '<span>Deleted "' + choreName + '"</span>';
      const undoBtn = document.createElement('button');
      undoBtn.textContent = '↩ Undo';
      undoBtn.style.cssText = 'background:#ffa502;color:#111;border:none;padding:6px 14px;border-radius:8px;font-weight:700;cursor:pointer;font-size:.82rem;font-family:inherit;flex-shrink:0';
      undoBtn.onclick = () => { S = JSON.parse(snapshot); saveState(); render(); banner.remove(); };
      banner.appendChild(undoBtn);
      document.body.appendChild(banner);
      setTimeout(() => { if (banner.parentNode) banner.remove(); }, 15000);
    }
  });

  // Filters
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filterActive = btn.dataset.filter;
      renderChores();
    });
  });

  // Bank actions
  document.addEventListener('click', e => {
    const addBtn = e.target.closest('[data-bank-add]');
    const delBtn = e.target.closest('[data-bank-del]');
    const actSubmit = e.target.closest('[data-activity-submit]');
    const actDel = e.target.closest('[data-activity-del]');
    const ptsApprove = e.target.closest('[data-pts-approve]');
    const ptsReject = e.target.closest('[data-pts-reject]');
    const rewardDel = e.target.closest('[data-reward-del]');
    const rewardApprove = e.target.closest('[data-reward-approve]');
    const rewardDeny = e.target.closest('[data-reward-deny]');

    if (addBtn) {
      const idx = parseInt(addBtn.dataset.bankAdd);
      const b = S.bank[idx];
      const kidSel = el('bankKid_' + idx);
      const kidVal = kidSel ? kidSel.value : 'shared';
      const kidIdx = kidVal === 'shared' ? 'shared' : parseInt(kidVal);
      expandChore({ name: b.name, freq: b.freq, kid: kidIdx, extra: b.extra || false, bonusDollars: b.bonusDollars || 0, dod: b.dod || '', recurring: b.recurring || false });
      log('Added "' + b.name + '" from bank for ' + (kidIdx === 'shared' ? 'Shared' : S.names[kidIdx]));
      saveState(); render();
      showToast('Added "' + b.name + '" to week');
    }

    if (delBtn) {
      const idx = parseInt(delBtn.dataset.bankDel);
      const name = S.bank[idx].name;
      S.bank.splice(idx, 1);
      saveState(); renderBank();
      showToast('Removed "' + name + '" from bank');
    }

    if (actSubmit) {
      const idx = parseInt(actSubmit.dataset.activitySubmit);
      pendingActivityIdx = idx;
      const act = S.activities[idx];
      el('submitActivityTitle').textContent = '🌟 ' + act.name;
      el('submitActivityDesc').textContent = 'Earns +' + act.points + ' points when approved.';
      el('submitActivityModal').showModal();
    }

    if (actDel) {
      const idx = parseInt(actDel.dataset.activityDel);
      S.activities.splice(idx, 1);
      saveState(); renderActivities();
    }

    if (ptsApprove) {
      const subId = ptsApprove.dataset.ptsApprove;
      const sub = S.pointSubmissions.find(p => p.id === subId);
      if (sub) {
        sub.status = 'approved';
        S.kids[sub.kidIdx].points = (S.kids[sub.kidIdx].points || 0) + sub.points;
        log('Approved activity "' + sub.activityName + '" for ' + S.names[sub.kidIdx] + ' (+' + sub.points + ' pts)');
        confetti(); saveState(); render();
        showToast('+' + sub.points + ' pts for ' + S.names[sub.kidIdx] + '!');
      }
    }

    if (ptsReject) {
      const subId = ptsReject.dataset.ptsReject;
      const sub = S.pointSubmissions.find(p => p.id === subId);
      if (sub) { sub.status = 'rejected'; saveState(); renderActivities(); }
    }

    if (rewardDel) {
      const idx = parseInt(rewardDel.dataset.rewardDel);
      S.rewards[0].splice(idx, 1);
      S.rewards[1].splice(idx, 1);
      saveState(); renderRewardMenu();
    }

    if (rewardApprove) {
      const rId = rewardApprove.dataset.rewardApprove;
      const req = S.pendingRewards.find(r => r.id === rId);
      if (req) {
        req.status = 'approved';
        S.kids[req.kidIdx].points = Math.max(0, (S.kids[req.kidIdx].points || 0) - req.cost);
        log('Granted reward "' + req.name + '" to ' + S.names[req.kidIdx]);
        saveState(); render();
        showToast('Reward granted to ' + S.names[req.kidIdx] + '!');
      }
    }

    if (rewardDeny) {
      const rId = rewardDeny.dataset.rewardDeny;
      const req = S.pendingRewards.find(r => r.id === rId);
      if (req) { req.status = 'denied'; saveState(); renderRewardMenu(); }
    }
  });

  // Submit activity confirm
  el('submitActivityConfirm').addEventListener('click', () => {
    if (pendingActivityIdx === null) return;
    const act = S.activities[pendingActivityIdx];
    const kidIdx = parseInt(el('submitActivityKid').value);
    const sub = { id: uid(), activityId: act.id, activityName: act.name, kidIdx, points: act.points, status: 'pending', submittedAt: now() };
    if (!S.pointSubmissions) S.pointSubmissions = [];
    S.pointSubmissions.push(sub);
    log(S.names[kidIdx] + ' submitted activity: ' + act.name + ' (+' + act.points + ' pts pending)');
    saveState(); render();
    el('submitActivityModal').close();
    showToast(S.names[kidIdx] + ' submitted "' + act.name + '" for approval');
    pendingActivityIdx = null;
  });
  el('submitActivityCancel').addEventListener('click', () => { el('submitActivityModal').close(); pendingActivityIdx = null; });

  // Add activity
  el('addActivitySave').addEventListener('click', () => {
    const name = el('activityName').value.trim();
    const pts  = parseInt(el('activityPoints').value) || 10;
    if (!name) { alert('Enter activity name'); return; }
    if (!S.activities) S.activities = [];
    S.activities.push({ id: uid(), name, points: pts });
    saveState(); renderActivities();
    el('addActivityModal').close();
    el('activityName').value = '';
  });
  el('addActivityCancel').addEventListener('click', () => el('addActivityModal').close());

  // Add reward
  el('addRewardSave').addEventListener('click', () => {
    const name = el('rewardName').value.trim();
    const cost = parseInt(el('rewardCost').value) || 10;
    if (!name) { alert('Enter reward name'); return; }
    const reward = { id: uid(), name, cost };
    S.rewards[0].push({ ...reward });
    S.rewards[1].push({ ...reward });
    saveState(); renderRewardMenu();
    el('addRewardModal').close();
    el('rewardName').value = '';
  });
  el('addRewardCancel').addEventListener('click', () => el('addRewardModal').close());

  // New week
  el('newWeekBtn').addEventListener('click', () => {
    requirePin(() => {
      if (!confirm('Start a new week? Chores clear, points reset, baselines update. 30s undo available.')) return;
      weekSnapshot = JSON.stringify(S);
      S.kids.forEach(kid => {
        SUBJECTS.forEach(s => { kid.subjects[s].baseline = kid.subjects[s].current; });
        kid.points = 0;
      });
      S.chores = [];
      S.pointSubmissions = (S.pointSubmissions || []).filter(p => p.status === 'pending');
      S.week = weekLabel();
      log('New week started - points reset');
      saveState(); render();
      showUndoBanner();
    });
  });

  // Grades
  el('openGradeBtn').addEventListener('click', () => {
    el('gradeRows').innerHTML = S.kids.map((kid, i) =>
      '<div style="margin:10px 0;padding:10px;background:var(--card2);border-radius:10px"><b style="color:' + (i===0?'var(--k1)':'var(--k2)') + '">' + S.emojis[i] + ' ' + S.names[i] + '</b>' +
      SUBJECTS.map(s => '<div style="display:flex;align-items:center;gap:8px;margin:6px 0"><label style="flex:1;font-size:.8rem">' + s + '</label><select data-kid="' + i + '" data-subject="' + s + '" style="width:70px">' + ['A','B','C','D','F'].map(g => '<option value="' + g + '"' + (kid.subjects[s].current===g?' selected':'') + '>' + g + '</option>').join('') + '</select><span style="font-size:.7rem;color:#555">was: ' + kid.subjects[s].baseline + '</span></div>').join('') + '</div>'
    ).join('');
    el('gradeModal').showModal();
  });
  el('gradeCancel').addEventListener('click', () => el('gradeModal').close());
  el('gradeSave').addEventListener('click', () => {
    document.querySelectorAll('[data-kid][data-subject]').forEach(sel => { S.kids[parseInt(sel.dataset.kid)].subjects[sel.dataset.subject].current = sel.value; });
    log('Grades updated'); el('gradeModal').close(); saveState(); render();
  });

  // Settings
  el('settingsBtn').addEventListener('click', () => {
    el('cfgName0').value = S.names[0]; el('cfgName1').value = S.names[1];
    el('cfgEmoji0').value = S.emojis[0]; el('cfgEmoji1').value = S.emojis[1];
    el('cfgBase').value = S.base; el('cfgMax').value = S.maxPay;
    el('currentPin').value = ''; el('newPin').value = ''; el('pinStatus').textContent = '';
    el('settingsModal').showModal();
  });
  el('settingsClose').addEventListener('click', () => el('settingsModal').close());
  el('saveSettingsConfig').addEventListener('click', () => {
    S.names[0]  = el('cfgName0').value.trim() || S.names[0];
    S.names[1]  = el('cfgName1').value.trim() || S.names[1];
    S.emojis[0] = el('cfgEmoji0').value.trim() || S.emojis[0];
    S.emojis[1] = el('cfgEmoji1').value.trim() || S.emojis[1];
    S.base      = parseFloat(el('cfgBase').value) || S.base;
    S.maxPay    = parseFloat(el('cfgMax').value) || S.maxPay;
    log('Settings updated'); saveState(); render(); el('settingsModal').close();
    showToast('Settings saved');
  });
  el('updatePinBtn').addEventListener('click', () => {
    const cur = el('currentPin').value, nw = el('newPin').value;
    if (S.pin && cur !== S.pin) { el('pinStatus').textContent = 'Current PIN incorrect'; return; }
    if (nw && (nw.length !== 4 || !/^\d+$/.test(nw))) { el('pinStatus').textContent = 'PIN must be 4 digits'; return; }
    S.pin = nw || null; el('pinStatus').textContent = nw ? 'PIN updated ✓' : 'PIN removed'; saveState();
  });

  // PIN modal
  el('pinSubmit').addEventListener('click', () => {
    if (el('parentPin').value === S.pin) { el('pinModal').close(); if (pinPending) { pinPending(); pinPending = null; } }
    else { el('parentPin').value = ''; alert('Incorrect PIN'); }
  });
  el('pinCancel').addEventListener('click', () => { el('pinModal').close(); pinPending = null; });

  // Edit chore modal
  el('editChoreSave').addEventListener('click', () => {
    const name = el('editChoreName').value.trim();
    const dod  = el('editChoreDod').value.trim();
    if (!name) return;
    if (editingChore) {
      const baseName = editingChore.baseName || editingChore.name.split(' - ')[0].split(' (')[0];
      S.chores.forEach(c => {
        const cBase = c.baseName || c.name.split(' - ')[0].split(' (')[0];
        if (cBase === baseName && c.kid === editingChore.kid) {
          const suffix = c.name.slice(baseName.length);
          c.baseName = name; c.name = name + suffix; c.dod = dod;
        }
      });
      log('Edited chore "' + baseName + '"'); saveState(); render();
    }
    el('editChoreModal').close(); editingChore = null;
  });
  el('editChoreCancel').addEventListener('click', () => { el('editChoreModal').close(); editingChore = null; });

  // Reward modal close
  el('rewardModalClose').addEventListener('click', () => el('rewardModal').close());

  // Display mode
  document.getElementById('settingsBtn') && document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  });

  // Export/Import/Clear
  el('exportBtn').addEventListener('click', async () => {
    const pass = el('passphrase').value; if (!pass) { alert('Enter a passphrase'); return; }
    try {
      const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
      const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
      const key = await crypto.subtle.deriveKey({ name:'PBKDF2', salt, iterations:100000, hash:'SHA-256' }, km, { name:'AES-GCM', length:256 }, false, ['encrypt']);
      const ct = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(S)));
      const b64 = b => btoa(String.fromCharCode(...new Uint8Array(b)));
      el('blobArea').value = JSON.stringify({ v:1, s:b64(salt), i:b64(iv), d:b64(ct), t:new Date().toISOString() }, null, 2);
      log('Data exported');
    } catch(e) { alert('Export failed: ' + e.message); }
  });
  el('importBtn').addEventListener('click', async () => {
    const pass = el('passphrase').value; if (!pass) { alert('Enter passphrase'); return; }
    try {
      const pkg = JSON.parse(el('blobArea').value);
      const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
      const salt = b64d(pkg.s), iv = b64d(pkg.i), ct = b64d(pkg.d);
      const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
      const key = await crypto.subtle.deriveKey({ name:'PBKDF2', salt, iterations:100000, hash:'SHA-256' }, km, { name:'AES-GCM', length:256 }, false, ['decrypt']);
      const pt = await crypto.subtle.decrypt({ name:'AES-GCM', iv }, key, ct);
      const imp = JSON.parse(new TextDecoder().decode(pt));
      if (!imp.kids) throw new Error('Invalid data');
      S = imp; saveState(); render(); el('settingsModal').close(); alert('Import successful!');
    } catch(e) { alert('Import failed — wrong passphrase or corrupt file'); }
  });
  el('clearBtn').addEventListener('click', () => {
    requirePin(() => {
      if (!confirm('Clear ALL data? Cannot be undone.')) return;
      S = defaultState(); localStorage.removeItem(STORAGE_KEY); saveState(); render();
    });
  });
  el('clearLogBtn').addEventListener('click', () => { S.logs = []; saveState(); render(); });
  el('exportLogBtn').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([S.logs.join('\n')], { type:'text/plain' }));
    a.download = 'famboard-log.txt'; a.click();
  });
}

let editingChore = null;
function openEditModal(chore) {
  editingChore = chore;
  const baseName = chore.baseName || chore.name.split(' - ')[0].split(' (')[0];
  el('editChoreName').value = baseName;
  el('editChoreDod').value  = chore.dod || '';
  el('editChoreModal').showModal();
}

function openAddActivityModal() { el('addActivityModal').showModal(); }
function openAddRewardModal()   { el('addRewardModal').showModal(); }

// ── CLOCK ─────────────────────────────────────────────────
function startClock() {
  function tick() {
    const n = new Date(), e = el('clock');
    if (e) e.textContent = n.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' }) + ' ' + n.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' });
  }
  tick(); setInterval(tick, 1000);
}

function registerSW() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(e => console.warn('SW:', e));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
