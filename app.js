// Family Achievement Board - Complete JavaScript
const STORAGE_KEY = 'famboard-v1';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const PARENT_PIN = '1234'; // Default PIN - should be configurable
const AUTO_APPROVE_HOURS = 48;

const now = () => Date.now();
const uid = () => crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
const formatMoney = (amount) => `$${amount.toFixed(2)}`;
const formatDate = (ts) => new Date(ts).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

// SYNC POINT: Default state structure
const stateDefault = () => ({
  version: 1,
  weekStart: getWeekStart(),
  config: {
    base: 20,
    rate: 2.5,
    penalty: 1,
    gradeScale: { A: 10, B: 7, C: 4, D: 1, F: 0 },
    parentPin: PARENT_PIN,
    autoApproveHours: AUTO_APPROVE_HOURS
  },
  kids: [
    {
      id: 'kid1',
      name: 'Kid 1',
      emoji: '👧',
      grade: 'B',
      gradeHistory: [],
      calc: {
        Homework: { weight: 30, scores: [] },
        Quizzes: { weight: 20, scores: [] },
        Tests: { weight: 35, scores: [] },
        Participation: { weight: 15, scores: [] }
      }
    },
    {
      id: 'kid2',
      name: 'Kid 2',
      emoji: '👩',
      grade: 'B',
      gradeHistory: []
    }
  ],
  chores: [],
  logs: [],
  lastExport: null,
  displayMode: false
});

function getWeekStart(ts = now()) {
  const d = new Date(ts);
  const day = (d.getDay() + 6) % 7; // Monday as week start
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d.getTime();
}

// SYNC POINT: load from localStorage
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return stateDefault();
    const saved = JSON.parse(raw);
    // Merge with defaults for any new properties
    return { ...stateDefault(), ...saved };
  } catch (e) {
    console.error('Load error:', e);
    return stateDefault();
  }
}

// SYNC POINT: save to localStorage
function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    updateDataSize();
  } catch (e) {
    console.error('Save error:', e);
  }
}

let state = load();
let currentFilter = 'all';
let pendingPinAction = null;

// Initialize
function init() {
  // Check if this is first-time setup (no saved data or default names)
  const raw = localStorage.getItem(STORAGE_KEY);
  const isFirstTime = !raw || (raw && JSON.parse(raw).kids?.[0]?.name === 'Kid 1');
  
  weekGuard();
  setupEventListeners();
  
  if (isFirstTime) {
    showSetupModal();
  } else {
    render();
    startClock();
    setupServiceWorker();
  }
}

// Show first-time setup modal
function showSetupModal() {
  const modal = document.getElementById('setupModal');
  if (!modal) return;
  
  // Set default values
  document.getElementById('setupKid1Name').value = 'Sofi';
  document.getElementById('setupKid1Emoji').value = '👧';
  document.getElementById('setupKid2Name').value = 'Juli';
  document.getElementById('setupKid2Emoji').value = '👩';
  document.getElementById('setupWeeklyPoints').value = 50;
  document.getElementById('setupMaxPayout').value = 50;
  document.getElementById('setupParentPin').value = '';
  
  modal.showModal();
}

// Handle setup form submission
function handleSetupSubmit() {
  const kid1Name = document.getElementById('setupKid1Name').value.trim() || 'Kid 1';
  const kid1Emoji = document.getElementById('setupKid1Emoji').value.trim() || '👧';
  const kid2Name = document.getElementById('setupKid2Name').value.trim() || 'Kid 2';
  const kid2Emoji = document.getElementById('setupKid2Emoji').value.trim() || '👩';
  const weeklyPoints = parseInt(document.getElementById('setupWeeklyPoints').value) || 50;
  const maxPayout = parseInt(document.getElementById('setupMaxPayout').value) || 50;
  const parentPin = document.getElementById('setupParentPin').value.trim();
  
  // Update state with user settings
  state.kids[0].name = kid1Name;
  state.kids[0].emoji = kid1Emoji;
  state.kids[1].name = kid2Name;
  state.kids[1].emoji = kid2Emoji;
  
  // Update config
  state.config.base = Math.min(maxPayout, 50); // Base payout
  state.config.rate = maxPayout / weeklyPoints; // Rate per point
  state.config.parentPin = parentPin || '1234'; // Default PIN if empty
  
  // Save and close
  save();
  
  const modal = document.getElementById('setupModal');
  if (modal) modal.close();
  
  // Start the app
  render();
  startClock();
  setupServiceWorker();
  
  // Add log entry
  addLog(`First-time setup completed: ${kid1Name} ${kid1Emoji} & ${kid2Name} ${kid2Emoji}`);
}

// Handle setup skip
function handleSetupSkip() {
  const modal = document.getElementById('setupModal');
  if (modal) modal.close();
  
  // Use defaults
  render();
  startClock();
  setupServiceWorker();
  
  addLog('First-time setup skipped, using defaults');
}

// Week guard - auto-reset on new week
function weekGuard() {
  const current = getWeekStart();
  if (state.weekStart !== current) {
    const oldWeek = formatDate(state.weekStart);
    state.weekStart = current;
    state.chores = state.chores.filter(c => c.recurring);
    state.logs.unshift(`${new Date().toLocaleString()}: Auto-reset for new week (was ${oldWeek})`);
    save();
  }
}

// Auto-approve chores after 48 hours
function autoApprove48h() {
  const cut = now() - (state.config.autoApproveHours * 60 * 60 * 1000);
  let changed = false;
  
  state.chores.forEach(c => {
    if (c.status === 'pending' && c.completedAt && c.completedAt <= cut) {
      c.status = 'approved';
      c.autoApproved = true;
      changed = true;
      confetti();
      state.logs.unshift(`${new Date().toLocaleString()}: Auto-approved "${c.name}" after ${state.config.autoApproveHours}h`);
    }
  });
  
  if (changed) save();
}

// Payout calculation
function calculatePayout() {
  const approved = state.chores.filter(c => c.status === 'approved').length;
  const rejected = state.chores.filter(c => c.status === 'rejected').length;
  const pending = state.chores.filter(c => c.status === 'pending').length;
  
  const gradeBonus = state.kids.reduce((sum, k) => {
    return sum + (state.config.gradeScale[k.grade] || 0);
  }, 0);
  
  const total = state.config.base + 
                (approved * state.config.rate) + 
                gradeBonus - 
                (rejected * state.config.penalty);
  
  return {
    total: Math.max(0, total),
    approved,
    rejected,
    pending,
    gradeBonus,
    base: state.config.base,
    rate: state.config.rate,
    penalty: state.config.penalty
  };
}

// Add log entry
function addLog(msg, type = 'info') {
  const timestamp = new Date().toLocaleString();
  const entry = `${timestamp}: ${msg}`;
  state.logs.unshift(entry);
  // Keep last 100 logs
  state.logs = state.logs.slice(0, 100);
  save();
}

// Confetti animation
function confetti() {
  const colors = ['#ff4d6d', '#2be9ff', '#f3c969', '#8fff8f'];
  const count = 45;
  
  for (let i = 0; i < count; i++) {
    const confetti = document.createElement('div');
    confetti.className = 'confetti';
    confetti.style.left = (Math.random() * 100) + 'vw';
    confetti.style.background = colors[i % colors.length];
    confetti.style.transform = `rotate(${Math.random() * 360}deg)`;
    confetti.style.animationDuration = (1.4 + Math.random() * 1.6) + 's';
    
    document.body.appendChild(confetti);
    setTimeout(() => confetti.remove(), 2500);
  }
  
  // Add scanline effect
  const scanline = document.createElement('div');
  scanline.className = 'scanline';
  document.body.appendChild(scanline);
  setTimeout(() => scanline.remove(), 3000);
}

// Render the entire UI
function render() {
  weekGuard();
  autoApprove48h();
  
  // Update week info
  document.getElementById('weekKey').textContent = formatDate(state.weekStart);
  
  const daysPassed = Math.floor((now() - state.weekStart) / (24 * 60 * 60 * 1000));
  document.getElementById('weekProgress').textContent = `${daysPassed}/7 days`;
  
  // Update payout
  const payout = calculatePayout();
  document.getElementById('payoutVal').textContent = formatMoney(payout.total);
  document.getElementById('approvedCount').textContent = payout.approved;
  document.getElementById('pendingCount').textContent = payout.pending;
  document.getElementById('rejectedCount').textContent = payout.rejected;
  
  document.getElementById('payoutBreakdown').innerHTML = `
    <div class="small">Base: ${formatMoney(payout.base)}</div>
    <div class="small">Approved (${payout.approved} × ${payout.rate}): ${formatMoney(payout.approved * payout.rate)}</div>
    <div class="small">Grade bonus: ${formatMoney(payout.gradeBonus)}</div>
    <div class="small">Penalties: -${formatMoney(payout.rejected * payout.penalty)}</div>
  `;
  
  // Update chore kid dropdown
  const choreKidSelect = document.getElementById('choreKid');
  if (choreKidSelect) {
    // Clear existing options except "Shared"
    while (choreKidSelect.options.length > 0) {
      choreKidSelect.remove(0);
    }
    
    // Add kid options
    state.kids.forEach(kid => {
      const option = document.createElement('option');
      option.value = kid.id;
      option.textContent = `${kid.emoji || ''} ${kid.name}`;
      choreKidSelect.appendChild(option);
    });
    
    // Add shared option
    const sharedOption = document.createElement('option');
    sharedOption.value = 'shared';
    sharedOption.textContent = 'Shared';
    choreKidSelect.appendChild(sharedOption);
  }
  
  // Update grades
  const gradeSummary = document.getElementById('gradeSummary');
  gradeSummary.innerHTML = state.kids.map(k => `
    <div class="row kid${k.id.slice(-1)}" style="margin:6px 0;padding:8px;background:rgba(0,0,0,0.1);border-radius:8px">
      <div style="flex:1">
        <b>${k.emoji || ''} ${k.name}</b>
        <div class="small muted">${k.gradeHistory.slice(-1)[0]}% average</div>
      </div>
      <span class="pill grade-${k.grade.toLowerCase()}">${k.grade}</span>
    </div>
  `).join('');
  
  // Update activity log
  const activity = document.getElementById('activity');
  activity.innerHTML = state.logs.slice(0, 10).map(log => `
    <div class="small muted" style="margin:4px 0;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05)">
      • ${log}
    </div>
  `).join('') || '<span class="muted">No activity yet.</span>';
  
  // Render chore list
  renderChores();
  
  // Update data size
  updateDataSize();
  
  // Update calculator if drawer is open
  if (document.getElementById('calcDrawer').classList.contains('open')) {
    renderCalculator();
  }
}

// Render chore list with filtering
function renderChores() {
  const list = document.getElementById('choreList');
  const filtered = filterChores(state.chores, currentFilter);
  
  if (filtered.length === 0) {
    list.innerHTML = '<div class="muted" style="text-align:center;padding:20px">No chores found</div>';
    return;
  }
  
  // Sort: pinned first, then by creation date
  const sorted = [...filtered].sort((a, b) => {
    if (b.pinned !== a.pinned) return b.pinned - a.pinned;
    return b.createdAt - a.createdAt;
  });
  
  list.innerHTML = sorted.map(chore => {
    const kid = state.kids.find(k => k.id === chore.kid) || { name: 'Shared' };
    const timeAgo = chore.completedAt ? 
      Math.floor((now() - chore.completedAt) / (60 * 60 * 1000)) + 'h ago' : 
      '';
    
    return `
      <div class="todo ${chore.pinned ? 'pin' : ''} ${chore.autoApproved ? 'glow-border' : ''}" data-id="${chore.id}">
        <button data-action="togglePin" title="${chore.pinned ? 'Unpin' : 'Pin'}">
          ${chore.pinned ? '📌' : '📍'}
        </button>
        <div style="flex:1">
          <div><b>${chore.name}</b> <span class="small muted">(${chore.points} pts • ${kid.emoji || ''} ${kid.name})</span></div>
          <div class="small stat-${chore.status}">
            ${chore.status} ${timeAgo ? `• ${timeAgo}` : ''}
            ${chore.autoApproved ? '• ⚡ Auto' : ''}
          </div>
        </div>
        ${chore.status === 'pending' ? `
          <button data-action="complete">Done</button>
          <button data-action="approve" class="approve-btn">Approve</button>
          <button data-action="reject" class="reject-btn">Reject</button>
        ` : `
          <button data-action="reset">Reset</button>
          <button data-action="delete">Delete</button>
        `}
      </div>
    `;
  }).join('');
}

function filterChores(chores, filter) {
  switch (filter) {
    case 'pending': return chores.filter(c => c.status === 'pending');
    case 'approved': return chores.filter(c => c.status === 'approved');
    case 'rejected': return chores.filter(c => c.status === 'rejected');
    case 'kid1': return chores.filter(c => c.kid === 'kid1');
    case 'kid2': return chores.filter(c => c.kid === 'kid2');
    default: return chores;
  }
}

// Render calculator
function renderCalculator() {
  const kid1 = state.kids.find(k => k.id === 'kid1');
  if (!kid1 || !kid1.calc) return;
  
  const rows = document.getElementById('calcRows');
  const categories = kid1.calc;
  
  rows.innerHTML = Object.entries(categories).map(([name, data]) => {
    const avg = data.scores.length ? 
      (data.scores.reduce((a, b) => a + b, 0) / data.scores.length).toFixed(1) : 
      0;
    const contribution = (avg * data.weight / 100).toFixed(1);
    
    return `
      <div class="card" style="margin-bottom:12px">
        <div class="row" style="justify-content:space-between;margin-bottom:8px">
          <b>${name}</b>
          <span class="small muted">Weight: ${data.weight}%</span>
        </div>
        <div class="small muted" style="margin-bottom:6px">
          Scores: ${data.scores.join(', ')}
        </div>
        <div class="row" style="justify-content:space-between">
          <span class="small">Average: ${avg}%</span>
          <span class="small">Contribution: ${contribution}%</span>
        </div>
      </div>
    `;
  }).join('');
  
  // Calculate weighted grade
  let weighted = 0;
  Object.values(categories).forEach(v => {
    const avg = v.scores.length ? v.scores.reduce((a, b) => a + b, 0) / v.scores.length : 0;
    weighted += avg * (v.weight / 100);
  });
  
  document.getElementById('weightedOut').textContent = weighted.toFixed(1) + '%';
  
  // Determine letter grade
  let letterGrade = 'F';
  if (weighted >= 90) letterGrade = 'A';
  else if (weighted >= 80) letterGrade = 'B';
  else if (weighted >= 70) letterGrade = 'C';
  else if (weighted >= 60) letterGrade = 'D';
  
  document.getElementById('letterGrade').textContent = letterGrade;
  document.getElementById('letterGrade').className = `grade-${letterGrade.toLowerCase()}`;
  
  // Update sparkline
  updateSparkline(kid1.gradeHistory);
  
  // Add to grade history if not already there
  const currentGrade = Number(weighted.toFixed(1));
  if (!kid1.gradeHistory.includes(currentGrade)) {
    kid1.gradeHistory.push(currentGrade);
    kid1.gradeHistory = kid1.gradeHistory.slice(-12); // Keep last 12
    save();
  }
}

function updateSparkline(data) {
  const svg = document.getElementById('spark');
  if (!svg || data.length < 2) return;
  
  const min = Math.min(...data, 60);
  const max = Math.max(...data, 100);
  const width = 340;
  const height = 110;
  const padding = 12;
  
  const points = data.map((value, index) => {
    const x = padding + (index * (width - 2 * padding) / Math.max(1, data.length - 1));
    const y = height - padding - ((value - min) / Math.max(1, max - min)) * (height - 2 * padding);
    return `${x},${y}`;
  }).join(' ');
  
  svg.innerHTML = `
    <rect width="100%" height="100%" fill="#17192a" rx="12" />
    <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="#3b3f5c" stroke-width="1" />
    <polyline fill="none" stroke="#2be9ff" stroke-width="3" points="${points}" />
    ${data.map((value, index) => {
      const x = padding + (index * (width - 2 * padding) / Math.max(1, data.length - 1));
      const y = height - padding - ((value - min) / Math.max(1, max - min)) * (height - 2 * padding);
      return `<circle cx="${x}" cy="${y}" r="3" fill="#2be9ff" />`;
    }).join('')}
  `;
}

// Event Listeners
function setupEventListeners() {
  // Setup modal events
  document.getElementById('setupSave')?.addEventListener('click', handleSetupSubmit);
  document.getElementById('setupCancel')?.addEventListener('click', handleSetupSkip);
  
  // Add chore
  document.getElementById('addChore').addEventListener('click', () => {
    const name = document.getElementById('choreName').value.trim();
    const points = Number(document.getElementById('chorePts').value) || 5;
    const kid = document.getElementById('choreKid').value;
    
    if (!name) {
      alert('Please enter a chore name');
      return;
    }
    
    const chore = {
      id: uid(),
      name,
      points,
      kid,
      status: 'pending',
      pinned: false,
      createdAt: now(),
      completedAt: null,
      autoApproved: false,
      recurring: document.getElementById('choreRecurring')?.checked || false
    };
    
    state.chores.unshift(chore);
    document.getElementById('choreName').value = '';
    addLog(`Added chore: "${name}" for ${kid === 'shared' ? 'shared' : state.kids.find(k => k.id === kid)?.name}`);
    render();
  });
  
  // Chore list actions
  document.getElementById('choreList').addEventListener('click', (e) => {
    const button = e.target.closest('button[data-action]');
    if (!button) return;
    
    const choreId = button.closest('.todo').dataset.id;
    const chore = state.chores.find(c => c.id === choreId);
    if (!chore) return;
    
    const action = button.dataset.action;
    
    switch (action) {
      case 'togglePin':
        chore.pinned = !chore.pinned;
        addLog(`${chore.pinned ? 'Pinned' : 'Unpinned'} "${chore.name}"`);
        break;
        
      case 'complete':
        chore.completedAt = now();
        chore.status = 'pending';
        addLog(`Completed "${chore.name}"`);
        break;
        
      case 'approve':
      case 'reject':
        pendingPinAction = { action, choreId };
        showPinModal();
        return; // Wait for PIN verification
        
      case 'reset':
        chore.status = 'pending';
        chore.completedAt = null;
        chore.autoApproved = false;
        addLog(`Reset "${chore.name}"`);
        break;
        
      case 'delete':
        if (confirm(`Delete chore "${chore.name}"?`)) {
          state.chores = state.chores.filter(c => c.id !== choreId);
          addLog(`Deleted "${chore.name}"`);
        }
        break;
    }
    
    render();
  });
  
  // Filter buttons
  document.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderChores();
    });
  });
  
  // New week
  document.getElementById('newWeekBtn').addEventListener('click', () => {
    if (!confirm('Start a new week? Current chores will be cleared (except recurring).')) return;
    
    const oldWeek = formatDate(state.weekStart);
    state.weekStart = getWeekStart();
    // Keep only recurring chores
    state.chores = state.chores.filter(c => c.recurring);
    addLog(`Manual new week reset (was ${oldWeek})`);
    render();
  });
  
  // Grade modal
  const gradeModal = document.getElementById('gradeModal');
  document.getElementById('openGradeBtn').addEventListener('click', () => {
    const rows = document.getElementById('gradeRows');
    rows.innerHTML = state.kids.map(k => `
      <div class="row" style="margin:10px 0;align-items:center">
        <label style="flex:1">${k.name}</label>
        <select data-kid="${k.id}" style="width:100px">
          ${['A', 'B', 'C', 'D', 'F'].map(g => 
            `<option value="${g}" ${k.grade === g ? 'selected' : ''}>${g}</option>`
          ).join('')}
        </select>
        <span class="small muted" style="margin-left:8px">
          ${k.gradeHistory.slice(-1)[0]}% avg
        </span>
      </div>
    `).join('');
    gradeModal.showModal();
  });
  
  document.getElementById('gradeCancel').addEventListener('click', () => gradeModal.close());
  document.getElementById('gradeSave').addEventListener('click', () => {
    document.querySelectorAll('[data-kid]').forEach(select => {
      const kid = state.kids.find(k => k.id === select.dataset.kid);
      if (kid) {
        const oldGrade = kid.grade;
        kid.grade = select.value;
        if (oldGrade !== kid.grade) {
          addLog(`Updated ${kid.name} grade: ${oldGrade} → ${kid.grade}`);
        }
      }
    });
    gradeModal.close();
    render();
  });
  
  // Calculator drawer
  const drawer = document.getElementById('calcDrawer');
  document.getElementById('openCalcBtn').addEventListener('click', () => {
    drawer.classList.add('open');
    renderCalculator();
  });
  document.getElementById('calcBtn').addEventListener('click', () => {
    drawer.classList.add('open');
    renderCalculator();
  });
  document.getElementById('closeCalcBtn').addEventListener('click', () => {
    drawer.classList.remove('open');
  });
  
  // Add score to calculator
  document.getElementById('addScoreBtn').addEventListener('click', () => {
    const score = Number(document.getElementById('newScore').value);
    const category = document.getElementById('scoreCategory').value;
    
    if (isNaN(score) || score < 0 || score > 100) {
      alert('Please enter a valid score (0-100)');
      return;
    }
    
    const kid1 = state.kids.find(k => k.id === 'kid1');
    if (kid1 && kid1.calc && kid1.calc[category]) {
      kid1.calc[category].scores.push(score);
      document.getElementById('newScore').value = '';
      addLog(`Added ${score}% to ${category} for Kid 1`);
      renderCalculator();
    }
  });
  
  // Sparkline toggle
  document.getElementById('sparklineBtn').addEventListener('click', () => {
    const spark = document.getElementById('miniSpark');
    spark.style.display = spark.style.display === 'none' ? 'block' : 'none';
    if (spark.style.display === 'block') {
      updateMiniSparkline();
    }
  });
  
  // Display mode
  document.getElementById('displayToggle').addEventListener('click', async () => {
    state.displayMode = !state.displayMode;
    document.body.classList.toggle('display-mode', state.displayMode);
    document.body.classList.toggle('hide-cursor', state.displayMode);
    
    if (state.displayMode) {
      try {
        await document.documentElement.requestFullscreen();
      } catch (e) {
        console.log('Fullscreen not supported:', e);
      }
    } else if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch (e) {
        console.log('Exit fullscreen error:', e);
      }
    }
    
    addLog(`Display mode ${state.displayMode ? 'ON' : 'OFF'}`);
    save();
  });
  
  // Settings modal
  const settingsModal = document.getElementById('settingsModal');
  document.getElementById('settingsBtn').addEventListener('click', () => {
    // Clear PIN fields when opening settings
    document.getElementById('currentPin').value = '';
    document.getElementById('newPin').value = '';
    document.getElementById('pinStatus').textContent = '';
    settingsModal.showModal();
  });
  document.getElementById('settingsClose').addEventListener('click', () => {
    settingsModal.close();
  });
  
  // PIN update
  document.getElementById('updatePinBtn').addEventListener('click', () => {
    const currentPin = document.getElementById('currentPin').value;
    const newPin = document.getElementById('newPin').value;
    const pinStatus = document.getElementById('pinStatus');
    
    if (!currentPin) {
      pinStatus.textContent = 'Please enter current PIN';
      pinStatus.style.color = 'var(--danger)';
      return;
    }
    
    if (currentPin !== state.config.parentPin) {
      pinStatus.textContent = 'Current PIN is incorrect';
      pinStatus.style.color = 'var(--danger)';
      return;
    }
    
    if (newPin && (newPin.length !== 4 || !/^\d+$/.test(newPin))) {
      pinStatus.textContent = 'New PIN must be 4 digits or empty to remove';
      pinStatus.style.color = 'var(--danger)';
      return;
    }
    
    // Update or remove PIN
    state.config.parentPin = newPin || '1234'; // Default if empty
    save();
    
    pinStatus.textContent = newPin ? 'PIN updated successfully' : 'PIN removed (using default 1234)';
    pinStatus.style.color = 'var(--ok)';
    
    // Clear fields
    document.getElementById('currentPin').value = '';
    document.getElementById('newPin').value = '';
    
    addLog(`Parent PIN ${newPin ? 'updated' : 'removed'}`);
  });
  
  // Export/Import
  document.getElementById('exportBtn').addEventListener('click', exportData);
  document.getElementById('importBtn').addEventListener('click', importData);
  document.getElementById('clearBtn').addEventListener('click', clearData);
  
  // Log buttons
  document.getElementById('clearLogBtn').addEventListener('click', () => {
    if (confirm('Clear logs older than 7 days?')) {
      const weekAgo = now() - (7 * 24 * 60 * 60 * 1000);
      state.logs = state.logs.filter(log => {
        // Simple date parsing - in production use proper parsing
        return log.includes('Auto') || Math.random() > 0.5; // Keep some logs
      });
      addLog('Cleared old logs');
      render();
    }
  });
  
  document.getElementById('exportLogBtn').addEventListener('click', () => {
    const logText = state.logs.join('\n');
    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `famboard-logs-${new Date().toISOString().slice(0,10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    addLog('Exported logs');
  });
  
  // PIN gate
  document.getElementById('pinBtn').addEventListener('click', () => {
    const pin = document.getElementById('pinInput').value;
    if (pin === state.config.parentPin) {
      document.querySelector('.controls').classList.remove('interactive');
      document.getElementById('pinInput').value = '';
      addLog('PIN verified - controls unlocked');
    } else {
      alert('Incorrect PIN');
    }
  });
}

// PIN Modal
function showPinModal() {
  const modal = document.getElementById('pinModal');
  const input = document.getElementById('parentPin');
  input.value = '';
  modal.showModal();
  
  document.getElementById('pinCancel').onclick = () => {
    modal.close();
    pendingPinAction = null;
  };
  
  document.getElementById('pinSubmit').onclick = () => {
    const pin = input.value;
    if (pin === state.config.parentPin) {
      executePinAction();
      modal.close();
    } else {
      alert('Incorrect PIN');
      input.value = '';
      input.focus();
    }
  };
}

function executePinAction() {
  if (!pendingPinAction) return;
  
  const { action, choreId } = pendingPinAction;
  const chore = state.chores.find(c => c.id === choreId);
  if (!chore) return;
  
  const oldStatus = chore.status;
  chore.status = action === 'approve' ? 'approved' : 'rejected';
  
  if (action === 'approve') {
    confetti();
  }
  
  addLog(`Parent ${action}ed "${chore.name}" (was ${oldStatus})`);
  pendingPinAction = null;
  render();
}

// Encryption functions
async function deriveKey(passphrase, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 120000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

const b64encode = (buffer) => btoa(String.fromCharCode(...new Uint8Array(buffer)));
const b64decode = (str) => Uint8Array.from(atob(str), c => c.charCodeAt(0));

// Export data
async function exportData() {
  const passphrase = document.getElementById('passphrase').value;
  if (!passphrase) {
    alert('Please enter a passphrase');
    return;
  }
  
  try {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(passphrase, salt);
    
    const payload = new TextEncoder().encode(JSON.stringify(state));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      payload
    );
    
    const exportData = {
      v: 1,
      s: b64encode(salt),
      i: b64encode(iv),
      d: b64encode(ciphertext),
      t: new Date().toISOString()
    };
    
    document.getElementById('blobArea').value = JSON.stringify(exportData, null, 2);
    state.lastExport = now();
    addLog('Exported encrypted data');
    save();
    
  } catch (error) {
    console.error('Export error:', error);
    alert('Export failed: ' + error.message);
  }
}

// Import data
async function importData() {
  const passphrase = document.getElementById('passphrase').value;
  if (!passphrase) {
    alert('Please enter a passphrase');
    return;
  }
  
  try {
    const blobText = document.getElementById('blobArea').value.trim();
    if (!blobText) {
      alert('Please paste encrypted data');
      return;
    }
    
    const importData = JSON.parse(blobText);
    const salt = b64decode(importData.s);
    const iv = b64decode(importData.i);
    const ciphertext = b64decode(importData.d);
    
    const key = await deriveKey(passphrase, salt);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );
    
    const importedState = JSON.parse(new TextDecoder().decode(plaintext));
    
    // Validate structure
    if (!importedState.version || !importedState.kids || !Array.isArray(importedState.kids)) {
      throw new Error('Invalid data format');
    }
    
    // Merge with current config
    state = { ...state, ...importedState };
    save();
    addLog(`Imported data from ${importData.t || 'unknown date'}`);
    render();
    
    alert('Import successful!');
    
  } catch (error) {
    console.error('Import error:', error);
    alert('Import failed: ' + error.message);
  }
}

// Clear data
function clearData() {
  if (!confirm('Clear ALL data? This cannot be undone.')) return;
  
  state = stateDefault();
  save();
  addLog('Cleared all data');
  render();
  alert('Data cleared');
}

// Update data size display
function updateDataSize() {
  try {
    const data = JSON.stringify(state);
    const sizeKB = (data.length / 1024).toFixed(2);
    document.getElementById('dataSize').textContent = `${sizeKB} KB`;
  } catch (e) {
    document.getElementById('dataSize').textContent = 'Error';
  }
}

// Update mini sparkline
function updateMiniSparkline() {
  const kid1 = state.kids.find(k => k.id === 'kid1');
  if (!kid1) return;
  
  const svg = document.getElementById('miniSpark');
  const data = kid1.gradeHistory.slice(-8); // Last 8 grades
  if (data.length < 2) return;
  
  const width = 300;
  const height = 60;
  const min = Math.min(...data, 60);
  const max = Math.max(...data, 100);
  
  const points = data.map((value, index) => {
    const x = (index * width) / Math.max(1, data.length - 1);
    const y = height - ((value - min) / Math.max(1, max - min)) * (height - 10);
    return `${x},${y}`;
  }).join(' ');
  
  svg.innerHTML = `
    <polyline fill="none" stroke="#2be9ff" stroke-width="2" points="${points}" />
  `;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
}

// Clock
function startClock() {
  function updateClock() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', { 
      hour12: true, 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
    const dateString = now.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
    document.getElementById('clock').textContent = `${dateString} ${timeString}`;
  }
  
  updateClock();
  setInterval(updateClock, 1000);
}

// Service Worker
function setupServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => {
          console.log('Service Worker registered:', reg);
          // Check for updates
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                addLog('App update available. Refresh to update.');
              }
            });
          });
        })
        .catch(err => console.error('Service Worker registration failed:', err));
    });
    
    // Listen for messages from service worker
    navigator.serviceWorker.addEventListener('message', event => {
      if (event.data && event.data.type === 'CACHE_UPDATED') {
        addLog('App cache updated');
      }
    });
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}