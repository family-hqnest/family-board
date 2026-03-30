// ── CONFIG ────────────────────────────────────────────────
const SUPABASE_URL = 'https://fjvhkiynqejnbdbfwyxx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqdmhraXlucWVqbmJkYmZ3eXh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MTQ2OTUsImV4cCI6MjA4OTA5MDY5NX0.Rk2APihye1Zut-k5Wmm7Kn3NmIWIvM74srtBM-8vjA4';
const FAMILY_ID   = 'family';
const STORAGE_KEY = 'famboard-v1';

const now       = () => Date.now();
const uid       = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
const money     = (n) => '$' + Number(n).toFixed(2);
const gradeRank = { A: 4, B: 3, C: 2, D: 1, F: 0 };
const SUBJECTS  = ['Math', 'English', 'Science', 'History'];
const LEVELS    = ['Rookie', 'Rising Star', 'Champion', 'Legend', 'Superstar'];
const DAYS      = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function defaultState() {
  return {
    names:  ['Sofia', 'Juliana'],
    emojis: ['🧒', '👩'],
    maxPay: 30,
    base:   20,
    week:   weekLabel(),
    pin:    null,
    kids:   [makeKid(), makeKid()],
    chores: [],
    logs:   []
  };
}

function makeKid() {
  const subj = {};
  SUBJECTS.forEach(s => { subj[s] = { current: 'B', baseline: 'B' }; });
  return { xp: 0, streak: 0, subjects: subj };
}

function weekLabel() {
  const d = new Date(), mon = new Date(d);
  mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  return mon.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    + ' - ' + sun.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

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

async function loadState() {
  dot('saving');
  const remote = await db.load();
  if (remote) { localStorage.setItem(STORAGE_KEY, JSON.stringify(remote)); dot('saved'); return remote; }
  try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) { dot('offline'); return JSON.parse(raw); } } catch(e) {}
  dot('offline'); return defaultState();
}

async function saveState() {
  dot('saving');
  localStorage.setItem(STORAGE_KEY, JSON.stringify(S));
  await db.save(S);
}

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
  const val   = choreValue(kidIdx);
  const total = committedChores(kidIdx).length;
  // Start at base $20 — dock for each missed or rejected chore
  const missed = S.chores.filter(c => c.kid === kidIdx && !c.extra && c.status === 'rejected').length;
  const choreEarned = Math.max(0, S.base - (missed * val));
  // Extra credit earns above base (capped at $5)
  const extraEarned = Math.min(5, S.chores.filter(c => c.kid === kidIdx && c.extra && c.status === 'approved').reduce((s, c) => s + (c.bonusDollars || 0), 0));
  // Grade improvement earns above base (capped at $5)
  const gradeBonus = gradeImprovementBonus(S.kids[kidIdx]);
  return Math.max(0, Math.min(S.maxPay, choreEarned + extraEarned + gradeBonus));
}

let S = defaultState();
let filterActive = 'all';
let pinPending = null;

async function init() {
  S = await loadState();
  if (!S || !S.kids || !Array.isArray(S.kids)) S = defaultState();
  weekGuard();
  bindEvents();
  render();
  startClock();
  registerSW();
}

function weekGuard() {
  const current = weekLabel();
  if (S.week === current) return;
  S.kids.forEach((kid, i) => {
    const rec = S.chores.filter(c => c.kid === i && c.recurring && !c.extra);
    kid.streak = (rec.length > 0 && rec.every(c => c.status === 'approved')) ? (kid.streak || 0) + 1 : 0;
    SUBJECTS.forEach(s => { kid.subjects[s].baseline = kid.subjects[s].current; });
  });
  // Reload recurring chores for new week
  const recurring = S.chores.filter(c => c.recurring);
  S.chores = [];
  recurring.forEach(c => {
    expandChore({
      name: c.baseName || c.name,
      freq: c.freq || 'weekly',
      kid: c.kid,
      extra: c.extra || false,
      bonusDollars: c.bonusDollars || 0,
      dod: c.dod || '',
      recurring: true
    });
  });
  S.week = current;
  log('New week started - recurring chores reloaded');
  saveState();
}

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

function log(msg) {
  S.logs = [new Date().toLocaleString() + ': ' + msg, ...(S.logs || [])].slice(0, 100);
}

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

function el(id) { return document.getElementById(id); }

function render() {
  autoApprove();
  const wk = el('weekKey'); if (wk) wk.textContent = S.week;
  const p0 = kidPayout(0), p1 = kidPayout(1);
  el('payoutVal').textContent     = money(p0 + p1);
  el('approvedCount').textContent = S.chores.filter(c => c.status === 'approved').length;
  el('pendingCount').textContent  = S.chores.filter(c => c.status === 'pending').length;
  el('rejectedCount').textContent = S.chores.filter(c => c.status === 'rejected').length;

  [0, 1].forEach(i => {
    const n           = i === 0 ? 'kid1' : 'kid2';
    const pay         = i === 0 ? p0 : p1;
    const val         = choreValue(i);
    const total       = committedChores(i).length;
    const approved    = S.chores.filter(c => c.kid === i && !c.extra && c.status === 'approved').length;
    const pending     = S.chores.filter(c => c.kid === i && c.status === 'pending').length;
    const extraEarned = Math.min(5, S.chores.filter(c => c.kid === i && c.extra && c.status === 'approved').reduce((s, c) => s + (c.bonusDollars || 0), 0));
    const gradeBonus  = gradeImprovementBonus(S.kids[i]);
    const growthPct   = gradeGrowthPct(S.kids[i]);
    // Bar: $20 is center (66.7%), $0 is left, $30 is right
    const pct = pay <= S.base
      ? (pay / S.base) * 66.7
      : 66.7 + ((pay - S.base) / (S.maxPay - S.base)) * 33.3;

    el(n + 'Name').textContent         = S.names[i];
    el(n + 'PayoutVal').textContent    = money(pay);
    el(n + 'PendingCount').textContent = pending + ' pending';
    el(n + 'ChoreRatio').textContent   = approved + '/' + total + ' chores done';
    el(n + 'GradeRatio').textContent   = growthPct + '% grade growth';
    const bar = el(n + 'Progress'); if (bar) bar.style.width = pct + '%';
    const lvl = el(n + 'Level'); if (lvl) lvl.textContent = 'Level: ' + LEVELS[Math.min(Math.floor((S.kids[i].xp || 0) / 100), LEVELS.length - 1)];
    const bk = el(n + 'Breakdown');
    if (bk) bk.innerHTML =
      '<div class="small muted">Each chore worth: <b>' + (total > 0 ? money(val) : '--') + '</b> (' + money(S.base) + ' / ' + total + ' chores)</div>' +
      '<div class="small">Chores earned: <b>' + money(approved * val) + '</b> (' + approved + '/' + total + ' done)</div>' +
      (extraEarned > 0 ? '<div class="small" style="color:#2ed573">Extra credit: <b>+' + money(extraEarned) + '</b></div>' : '') +
      (gradeBonus  > 0 ? '<div class="small" style="color:#a78bfa">Grade improvement: <b>+' + money(gradeBonus) + '</b></div>' : '') +
      '<div class="small" style="font-weight:700;margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.1)">This week: <b>' + money(pay) + '</b></div>';
  });

  const gs = el('gradeSummary');
  if (gs) gs.innerHTML = S.kids.map((kid, i) => {
    const rows = SUBJECTS.map(s => {
      const cur = kid.subjects[s].current, base = kid.subjects[s].baseline;
      const diff = (gradeRank[cur] || 0) - (gradeRank[base] || 0);
      const arrow = diff > 0 ? '<span style="color:#2ed573">▲</span>' : diff < 0 ? '<span style="color:#ff4757">▼</span>' : '<span style="color:#555">-</span>';
      return '<span class="small">' + s + ': <b>' + cur + '</b>' + arrow + '</span>';
    }).join('&nbsp;&nbsp;');
    return '<div style="margin:8px 0;padding:8px;background:rgba(0,0,0,0.15);border-radius:8px"><b>' + S.emojis[i] + ' ' + S.names[i] + '</b><br><span style="line-height:2">' + rows + '</span></div>';
  }).join('');

  renderChores();

  const act = el('activity');
  if (act) act.innerHTML = (S.logs || []).slice(0, 10).map(l => '<div class="small muted" style="padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05)">* ' + l + '</div>').join('') || '<span class="muted small">No activity yet.</span>';
  const ds = el('dataSize'); if (ds) ds.textContent = (JSON.stringify(S).length / 1024).toFixed(2) + ' KB';
}

function renderChores() {
  const list = el('choreList'); if (!list) return;
  let chores = [...S.chores];
  if (filterActive === 'pending')  chores = chores.filter(c => c.status === 'pending');
  if (filterActive === 'approved') chores = chores.filter(c => c.status === 'approved');
  if (filterActive === 'kid1')     chores = chores.filter(c => c.kid === 0);
  if (filterActive === 'kid2')     chores = chores.filter(c => c.kid === 1);
  if (chores.length === 0) { list.innerHTML = '<div class="muted" style="text-align:center;padding:20px">No chores here yet!</div>'; return; }

  list.innerHTML = chores.map(c => {
    const kidName  = c.kid === 0 ? S.names[0] : c.kid === 1 ? S.names[1] : 'Shared';
    const kidEmoji = c.kid === 0 ? S.emojis[0] : c.kid === 1 ? S.emojis[1] : '👨‍👩‍👧';
    const val      = (typeof c.kid === 'number' && !c.extra) ? choreValue(c.kid) : 0;
    const valLabel = c.extra ? '+' + money(c.bonusDollars || 0) + ' bonus' : money(val);
    const recIcon  = c.recurring ? ' 🔁' : '';
    const extraIcon = c.extra ? ' ⭐' : '';
    const dodNote  = c.dod ? '<div class="small muted" style="margin-top:2px;font-style:italic">Done when: ' + c.dod + '</div>' : '';
    const kidTagColor = c.kid === 0 ? '#ff69b4' : c.kid === 1 ? '#9b59b6' : '#888';
    const hrs      = c.submittedAt ? Math.floor((now() - c.submittedAt) / 3600000) : 0;
    const border   = c.status === 'approved' ? '#2ed573' : c.status === 'pending' ? '#ffa502' : c.status === 'rejected' ? '#ff4757' : '#333';
    const kidClass = c.kid === 0 ? 'chore-sofia' : c.kid === 1 ? 'chore-juliana' : '';
    const statusLabel = c.status === 'none' ? '<span style="color:#555">Not done yet</span>'
      : c.status === 'pending'  ? '<span style="color:#ffa502">Waiting for approval (' + hrs + 'h ago)</span>'
      : c.status === 'approved' ? '<span style="color:#2ed573">Approved - earned ' + valLabel + '</span>'
      : '<span style="color:#ff4757">Not approved - redo it</span>';
    const actionBtns = c.status === 'none' ? '<button data-action="submit" data-id="' + c.id + '">Mark Done</button>'
      : c.status === 'pending' ? '<button data-action="approve" data-id="' + c.id + '" class="approve-btn">Approve</button><button data-action="reject" data-id="' + c.id + '" class="reject-btn">Reject</button>'
      : '<button data-action="reset" data-id="' + c.id + '">Reset</button>';
    return '<div class="todo ' + kidClass + '" style="border-left:3px solid ' + border + '" data-id="' + c.id + '"><div style="flex:1"><div><b>' + c.name + '</b>' + recIcon + extraIcon + ' <span class="small muted">(' + valLabel + ' - </span><span class="kid-tag" style="color:' + kidTagColor + ';font-size:.8rem">' + kidEmoji + ' ' + kidName + '</span><span class="small muted">)</span></div>' + dodNote + '<div style="margin-top:3px">' + statusLabel + '</div></div><div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">' + actionBtns + '<button data-action="delete" data-id="' + c.id + '" style="opacity:.4;font-size:.8rem;padding:4px 8px">X</button></div></div>';
  }).join('');
}

function confetti() {
  const colors = ['#ff4757','#00d2d3','#ffa502','#2ed573','#a78bfa'];
  for (let i = 0; i < 35; i++) {
    const s = document.createElement('div');
    s.className = 'confetti-piece';
    s.style.cssText = 'left:' + (Math.random()*100) + 'vw;background:' + colors[i%colors.length] + ';width:' + (6+Math.random()*8) + 'px;height:' + (6+Math.random()*8) + 'px;border-radius:' + (Math.random()>.5?'50%':'2px') + ';animation-duration:' + (1.2+Math.random()) + 's;animation-delay:' + (Math.random()*.3) + 's';
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 2000);
  }
}

function requirePin(onSuccess) {
  if (!S.pin) { onSuccess(); return; }
  pinPending = onSuccess;
  el('parentPin').value = '';
  el('pinModal').showModal();
}

function bindEvents() {
  el('addChore').addEventListener('click', () => {
    const name    = el('choreName').value.trim();
    const freq    = el('choreFrequency').value;
    const kid     = el('choreKid').value;
    const rec     = el('choreRecurring').checked;
    const isExtra = el('choreExtra').checked;
    const dod     = el('choreDod').value.trim();
    const bonus   = isExtra ? (parseFloat(el('choreBonusDollars').value) || 1) : 0;
    if (!name) { alert('Enter a chore name'); return; }
    const kidIdx = kid === 'kid1' ? 0 : kid === 'kid2' ? 1 : 'shared';
    expandChore({ name, freq, kid: kidIdx, extra: isExtra, bonusDollars: bonus, dod, recurring: rec });
    el('choreName').value = ''; el('choreDod').value = '';
    const instances = freq === 'daily' ? 7 : freq === 'twice-weekly' ? 2 : 1;
    log('Added "' + name + '" (' + freq + ', ' + instances + ' instance' + (instances > 1 ? 's' : '') + ') for ' + (kidIdx === 'shared' ? 'shared' : S.names[kidIdx]));
    saveState(); render();
  });

  el('choreExtra').addEventListener('change', () => {
    const row = el('bonusDollarsRow');
    if (row) row.style.display = el('choreExtra').checked ? 'flex' : 'none';
  });

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
      requirePin(() => {
        chore.status = 'approved';
        if (typeof chore.kid === 'number') S.kids[chore.kid].xp = (S.kids[chore.kid].xp || 0) + 1;
        log('Approved "' + chore.name + '"'); confetti(); saveState(); render();
      });
    }
    if (action === 'reject') {
      requirePin(() => { chore.status = 'rejected'; log('Rejected "' + chore.name + '"'); saveState(); render(); });
    }
    if (action === 'reset') { chore.status = 'none'; chore.submittedAt = null; saveState(); render(); }
    if (action === 'delete') { S.chores = S.chores.filter(c => c.id !== id); saveState(); render(); }
  });

  document.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active'); filterActive = btn.dataset.filter; renderChores();
    });
  });

  el('newWeekBtn').addEventListener('click', () => {
    if (!confirm('Start a new week? All chores clear. Baselines update.')) return;
    S.kids.forEach((kid, i) => {
      SUBJECTS.forEach(s => { kid.subjects[s].baseline = kid.subjects[s].current; });
    });
    // Save recurring chores before clearing
    const recurringTemplates = S.chores.filter(c => c.recurring);
    S.chores = [];
    // Reload recurring chores for new week
    recurringTemplates.forEach(c => {
      expandChore({
        name: c.baseName || c.name.split(' - ')[0].split(' (')[0],
        freq: c.freq || 'weekly',
        kid: c.kid,
        extra: c.extra || false,
        bonusDollars: c.bonusDollars || 0,
        dod: c.dod || '',
        recurring: true
      });
    });
    S.week = weekLabel();
    log('New week started - ' + recurringTemplates.length + ' recurring chores reloaded');
    saveState(); render();
  });

  el('openGradeBtn').addEventListener('click', () => {
    el('gradeRows').innerHTML = S.kids.map((kid, i) =>
      '<div style="margin:12px 0;padding:10px;background:rgba(0,0,0,0.15);border-radius:8px"><b>' + S.emojis[i] + ' ' + S.names[i] + '</b>' +
      SUBJECTS.map(s => '<div style="display:flex;align-items:center;gap:8px;margin:6px 0"><label style="flex:1;font-size:.8rem">' + s + '</label><select data-kid="' + i + '" data-subject="' + s + '" style="width:70px">' + ['A','B','C','D','F'].map(g => '<option value="' + g + '"' + (kid.subjects[s].current === g ? ' selected' : '') + '>' + g + '</option>').join('') + '</select><span style="font-size:.7rem;color:#555">was: ' + kid.subjects[s].baseline + '</span></div>').join('') + '</div>'
    ).join('');
    el('gradeModal').showModal();
  });
  el('gradeCancel').addEventListener('click', () => el('gradeModal').close());
  el('gradeSave').addEventListener('click', () => {
    document.querySelectorAll('[data-kid][data-subject]').forEach(sel => { S.kids[parseInt(sel.dataset.kid)].subjects[sel.dataset.subject].current = sel.value; });
    log('Grades updated'); el('gradeModal').close(); saveState(); render();
  });

  el('settingsBtn').addEventListener('click', () => {
    el('cfgName0').value = S.names[0]; el('cfgName1').value = S.names[1];
    el('cfgEmoji0').value = S.emojis[0]; el('cfgEmoji1').value = S.emojis[1];
    el('cfgBase').value = S.base; el('cfgMax').value = S.maxPay;
    el('currentPin').value = ''; el('newPin').value = ''; el('pinStatus').textContent = '';
    el('settingsModal').showModal();
  });
  el('settingsClose').addEventListener('click', () => el('settingsModal').close());
  el('saveSettingsConfig').addEventListener('click', () => {
    S.names[0]  = el('cfgName0').value.trim()  || S.names[0];
    S.names[1]  = el('cfgName1').value.trim()  || S.names[1];
    S.emojis[0] = el('cfgEmoji0').value.trim() || S.emojis[0];
    S.emojis[1] = el('cfgEmoji1').value.trim() || S.emojis[1];
    S.base      = parseFloat(el('cfgBase').value) || S.base;
    S.maxPay    = parseFloat(el('cfgMax').value)  || S.maxPay;
    log('Settings updated'); saveState(); render(); el('settingsModal').close();
  });

  el('updatePinBtn').addEventListener('click', () => {
    const cur = el('currentPin').value, nw = el('newPin').value;
    if (S.pin && cur !== S.pin) { el('pinStatus').textContent = 'Current PIN incorrect'; return; }
    if (nw && (nw.length !== 4 || !/^\d+$/.test(nw))) { el('pinStatus').textContent = 'PIN must be 4 digits'; return; }
    S.pin = nw || null; el('pinStatus').textContent = nw ? 'PIN updated' : 'PIN removed'; saveState();
  });

  el('pinSubmit').addEventListener('click', () => {
    if (el('parentPin').value === S.pin) { el('pinModal').close(); if (pinPending) { pinPending(); pinPending = null; } }
    else { el('parentPin').value = ''; alert('Incorrect PIN'); }
  });
  el('pinCancel').addEventListener('click', () => { el('pinModal').close(); pinPending = null; });

  el('displayToggle').addEventListener('click', async () => {
    try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen(); else await document.exitFullscreen(); } catch(e) {}
  });

  el('exportBtn').addEventListener('click', async () => {
    const pass = el('passphrase').value; if (!pass) { alert('Enter a passphrase'); return; }
    try {
      const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
      const km  = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
      const key = await crypto.subtle.deriveKey({ name:'PBKDF2', salt, iterations:100000, hash:'SHA-256' }, km, { name:'AES-GCM', length:256 }, false, ['encrypt']);
      const ct  = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(S)));
      const b64 = b => btoa(String.fromCharCode(...new Uint8Array(b)));
      el('blobArea').value = JSON.stringify({ v:1, s:b64(salt), i:b64(iv), d:b64(ct), t:new Date().toISOString() }, null, 2);
      log('Data exported');
    } catch(e) { alert('Export failed: ' + e.message); }
  });

  el('importBtn').addEventListener('click', async () => {
    const pass = el('passphrase').value; if (!pass) { alert('Enter a passphrase'); return; }
    try {
      const pkg = JSON.parse(el('blobArea').value);
      const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
      const salt = b64d(pkg.s), iv = b64d(pkg.i), ct = b64d(pkg.d);
      const km  = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
      const key = await crypto.subtle.deriveKey({ name:'PBKDF2', salt, iterations:100000, hash:'SHA-256' }, km, { name:'AES-GCM', length:256 }, false, ['decrypt']);
      const pt  = await crypto.subtle.decrypt({ name:'AES-GCM', iv }, key, ct);
      const imp = JSON.parse(new TextDecoder().decode(pt));
      if (!imp.kids || !Array.isArray(imp.kids)) throw new Error('Invalid data');
      S = imp; saveState(); render(); el('settingsModal').close(); alert('Import successful!');
    } catch(e) { alert('Import failed - wrong passphrase or corrupt file'); }
  });

  el('clearBtn').addEventListener('click', () => {
    if (!confirm('Clear ALL data? Cannot be undone.')) return;
    S = defaultState(); localStorage.removeItem(STORAGE_KEY); saveState(); render();
  });

  el('clearLogBtn').addEventListener('click', () => { S.logs = []; saveState(); render(); });
  el('exportLogBtn').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([S.logs.join('\n')], { type:'text/plain' }));
    a.download = 'famboard-log.txt'; a.click();
  });
}

function startClock() {
  function tick() {
    const n = new Date(), e = el('clock');
    if (e) e.textContent = n.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' }) + ' ' + n.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  }
  tick(); setInterval(tick, 1000);
}

function registerSW() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(e => console.warn('SW:', e));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
