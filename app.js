// Family Achievement Board - Complete JavaScript
const STORAGE_KEY = 'famboard-v5';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const PARENT_PIN = null; // Default PIN - should be configurable, null means not set
const AUTO_APPROVE_HOURS = 48;

const now = () => Date.now();
const uid = () => crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
const formatMoney = (amount) => `$${amount.toFixed(2)}`;
const formatDate = (ts) => new Date(ts).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

// SYNC POINT: Default state structure
const stateDefault = () => ({
  version: 5, // New version for updated scoring system with frequency chores
  weekStart: getWeekStart(),
  config: {
    base: 20, // Starting payout per kid per week
    pointValue: 0.20, // $0.20 per point ($20 ÷ 100 points)
    maxPay: 30, // Maximum payout amount
    weekGoal: 100, // Weekly goal for approved points (increased from 50)
    parentPin: PARENT_PIN,
    autoApproveHours: AUTO_APPROVE_HOURS,
    gradeBonusPerSubject: 2.50 // $2.50 per improved subject
  },
  kids: [
    {
      id: 'kid1',
      name: 'Kid 1',
      emoji: '👧',
      grade: 'B',
      baselineGrade: 'B', // Store baseline for growth comparison
      subjects: {
        Math: { current: 'B', baseline: 'B' },
        English: { current: 'B', baseline: 'B' },
        Science: { current: 'B', baseline: 'B' },
        History: { current: 'B', baseline: 'B' }
      },
      gradeCalc: {
        Math: { tests: [], quizzes: [], homework: [] },
        English: { tests: [], quizzes: [], homework: [] },
        Science: { tests: [], quizzes: [], homework: [] },
        History: { tests: [], quizzes: [], homework: [] }
      },
      gradeHistory: []
    },
    {
      id: 'kid2',
      name: 'Kid 2',
      emoji: '👩',
      grade: 'B',
      baselineGrade: 'B', // Store baseline for growth comparison
      subjects: {
        Math: { current: 'B', baseline: 'B' },
        English: { current: 'B', baseline: 'B' },
        Science: { current: 'B', baseline: 'B' },
        History: { current: 'B', baseline: 'B' }
      },
      gradeCalc: {
        Math: { tests: [], quizzes: [], homework: [] },
        English: { tests: [], quizzes: [], homework: [] },
        Science: { tests: [], quizzes: [], homework: [] },
        History: { tests: [], quizzes: [], homework: [] }
      },
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

// SYNC POINT: load from localStorage with migration
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return stateDefault();
    
    const saved = JSON.parse(raw);
    
    // Migration from v1 to v2
    if (saved.version === 1) {
      console.log('Migrating from v1 to v2');
      
      // Migrate config
      if (saved.config && saved.config.gradeScale) {
        // Remove old gradeScale, add new fields
        delete saved.config.gradeScale;
        saved.config.maxPay = 100;
        saved.config.weekGoal = 10;
      }
      
      // Migrate kids
      if (saved.kids && Array.isArray(saved.kids)) {
        saved.kids.forEach(kid => {
          // Add baseline grade (same as current grade)
          kid.baselineGrade = kid.grade || 'B';
          
          // Add subjects structure
          if (!kid.subjects) {
            kid.subjects = {
              Math: { current: kid.grade || 'B', baseline: kid.grade || 'B' },
              English: { current: kid.grade || 'B', baseline: kid.grade || 'B' },
              Science: { current: kid.grade || 'B', baseline: kid.grade || 'B' },
              History: { current: kid.grade || 'B', baseline: kid.grade || 'B' }
            };
          }
          
          // Remove old calc structure if it exists
          if (kid.calc) {
            delete kid.calc;
          }
          
          // Add gradeCalc structure if it doesn't exist
          if (!kid.gradeCalc) {
            kid.gradeCalc = {
              Math: { tests: [], quizzes: [], homework: [] },
              English: { tests: [], quizzes: [], homework: [] },
              Science: { tests: [], quizzes: [], homework: [] },
              History: { tests: [], quizzes: [], homework: [] }
            };
          }
        });
      }
      
      // Update version
      saved.version = 2;
    }
    
    // Migration from v2 to v3
    if (saved.version === 2) {
      console.log('Migrating from v2 to v3');
      
      // Update config defaults
      if (saved.config) {
        saved.config.maxPay = 20; // Changed from 100 to 20
        saved.config.weekGoal = 50; // Changed from 10 to 50
        
        // Update PIN fallback from '1234' to null
        if (saved.config.parentPin === '1234') {
          saved.config.parentPin = null;
        }
      }
      
      // Update subject names from lowercase to proper case
      if (saved.kids && Array.isArray(saved.kids)) {
        saved.kids.forEach(kid => {
          if (kid.subjects) {
            // Rename subjects
            const newSubjects = {};
            if (kid.subjects.math) {
              newSubjects.Math = kid.subjects.math;
            }
            if (kid.subjects.reading) {
              newSubjects.English = kid.subjects.reading;
            }
            if (kid.subjects.science) {
              newSubjects.Science = kid.subjects.science;
            }
            if (kid.subjects.social) {
              newSubjects.History = kid.subjects.social;
            }
            kid.subjects = newSubjects;
          }
          
          // Add gradeCalc structure
          if (!kid.gradeCalc) {
            kid.gradeCalc = {
              Math: { tests: [], quizzes: [], homework: [] },
              English: { tests: [], quizzes: [], homework: [] },
              Science: { tests: [], quizzes: [], homework: [] },
              History: { tests: [], quizzes: [], homework: [] }
            };
          }
        });
      }
      
      saved.version = 3;
    }
    
    // Migration from v3 to v4
    if (saved.version === 3) {
      console.log('Migrating from v3 to v4');
      
      // Update config: base should be 0, maxPay should be 30
      if (saved.config) {
        saved.config.base = 0;
        saved.config.maxPay = 30;
      }
      
      saved.version = 4;
    }
    
    // Migration from v4 to v5
    if (saved.version === 4) {
      console.log('Migrating from v4 to v5');
      
      // Update config for new scoring system
      if (saved.config) {
        saved.config.base = 20; // Starting at $20
        saved.config.pointValue = 0.20; // $0.20 per point
        saved.config.weekGoal = 100; // Increased from 50
        saved.config.gradeBonusPerSubject = 2.50; // $2.50 per improved subject
        
        // Remove old fields if they exist
        delete saved.config.rate;
        delete saved.config.penalty;
      }
      
      // Update all chores to add frequency and extra credit fields
      if (saved.chores && Array.isArray(saved.chores)) {
        saved.chores.forEach(chore => {
          // Add frequency field (default to 'weekly' for existing chores)
          if (!chore.frequency) {
            chore.frequency = 'weekly';
          }
          
          // Add instances tracking (default to 1/1 for existing chores)
          if (!chore.instances) {
            chore.instances = {
              total: 1,
              completed: chore.status === 'approved' || chore.status === 'pending' ? 1 : 0
            };
          }
          
          // Add extra credit field
          if (!chore.extra) {
            chore.extra = {
              enabled: false,
              points: 0
            };
          }
        });
      }
      
      saved.version = 5;
    }
    
    // Merge with defaults for any new properties
    const merged = { ...stateDefault(), ...saved };
    
    // Safety check: Ensure base is always $20 (fix for any incorrect setups)
    if (merged.config) {
      if (merged.config.base !== 20) {
        console.log(`Fixing incorrect base: ${merged.config.base} → 20`);
      }
      merged.config.base = 20;
      merged.config.pointValue = 0.20;
      merged.config.weekGoal = 100;
      merged.config.maxPay = Math.max(merged.config.maxPay || 30, 30); // At least $30
    }
    
    // Ensure all kids have the new structure
    merged.kids.forEach(kid => {
      if (!kid.subjects) {
        kid.subjects = {
          Math: { current: kid.grade || 'B', baseline: kid.baselineGrade || kid.grade || 'B' },
          English: { current: kid.grade || 'B', baseline: kid.baselineGrade || kid.grade || 'B' },
          Science: { current: kid.grade || 'B', baseline: kid.baselineGrade || kid.grade || 'B' },
          History: { current: kid.grade || 'B', baseline: kid.baselineGrade || kid.grade || 'B' }
        };
      }
      
      // Ensure baselineGrade exists
      if (!kid.baselineGrade) {
        kid.baselineGrade = kid.grade || 'B';
      }
      
      // Ensure gradeCalc exists
      if (!kid.gradeCalc) {
        kid.gradeCalc = {
          Math: { tests: [], quizzes: [], homework: [] },
          English: { tests: [], quizzes: [], homework: [] },
          Science: { tests: [], quizzes: [], homework: [] },
          History: { tests: [], quizzes: [], homework: [] }
        };
      }
    });
    
    return merged;
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
  // Check if this is first-time setup (no saved data)
  const raw = localStorage.getItem(STORAGE_KEY);
  const isFirstTime = !raw;
  
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
  document.getElementById('setupKid1Name').value = 'Kid 1';
  document.getElementById('setupKid1Emoji').value = '👧';
  document.getElementById('setupKid2Name').value = 'Kid 2';
  document.getElementById('setupKid2Emoji').value = '👩';
  document.getElementById('setupWeeklyPoints').value = 100;
  document.getElementById('setupMaxPayout').value = 30;
  document.getElementById('setupParentPin').value = '';
  
  modal.showModal();
}

// Handle setup form submission
function handleSetupSubmit() {
  const kid1Name = document.getElementById('setupKid1Name').value.trim() || 'Kid 1';
  const kid1Emoji = document.getElementById('setupKid1Emoji').value.trim() || '👧';
  const kid2Name = document.getElementById('setupKid2Name').value.trim() || 'Kid 2';
  const kid2Emoji = document.getElementById('setupKid2Emoji').value.trim() || '👩';
  const weeklyPoints = parseInt(document.getElementById('setupWeeklyPoints').value) || 100;
  const maxPayout = parseInt(document.getElementById('setupMaxPayout').value) || 30;
  const parentPin = document.getElementById('setupParentPin').value.trim();
  
  // Update state with user settings
  state.kids[0].name = kid1Name;
  state.kids[0].emoji = kid1Emoji;
  state.kids[1].name = kid2Name;
  state.kids[1].emoji = kid2Emoji;
  
  // Update config
  state.config.base = 20; // Fixed base payout of $20
  state.config.maxPay = maxPayout; // Maximum payout (e.g., $30)
  state.config.weekGoal = weeklyPoints; // Weekly goal (e.g., 100 points)
  state.config.pointValue = state.config.base / weeklyPoints; // $0.20 per point ($20 ÷ 100)
  state.config.parentPin = parentPin || null; // Default PIN if empty (changed from '1234' to null)
  
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
    
    // Auto-update baselines: set baseline = current for all subjects
    state.kids.forEach(kid => {
      Object.keys(kid.subjects).forEach(subject => {
        kid.subjects[subject].baseline = kid.subjects[subject].current;
      });
      // Also update baseline grade
      kid.baselineGrade = kid.grade;
    });
    
    state.logs.unshift(`${new Date().toLocaleString()}: Auto-reset for new week (was ${oldWeek}) - baselines updated`);
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
      
      // No extra credit for auto-approve
      c.extra = { enabled: false, points: 0 };
      
      changed = true;
      confetti();
      state.logs.unshift(`${new Date().toLocaleString()}: Auto-approved "${c.name}" after ${state.config.autoApproveHours}h`);
    }
  });
  
  if (changed) save();
}

// Grade rank mapping
const gradeRank = {
  'A': 4, 'B': 3, 'C': 2, 'D': 1, 'F': 0
};

// Calculate grade improvement bonus for a kid
function calculateGradeBonus(kid) {
  let totalBonus = 0;
  
  // Calculate for each subject
  for (const [subject, data] of Object.entries(kid.subjects)) {
    const baseRank = gradeRank[data.baseline] || 0;
    const currentRank = gradeRank[data.current] || 0;
    const improvement = currentRank - baseRank;
    
    // Only positive changes count: $2.50 per improved subject
    if (improvement > 0) {
      totalBonus += state.config.gradeBonusPerSubject; // $2.50 per improved subject
    }
    // No penalty for same or lower grades
  }
  
  return totalBonus;
}

// Helper function to calculate points for a chore (handles frequency)
function calculateChorePoints(chore) {
  if (!chore.instances || chore.instances.total === 0) {
    return chore.points || 0;
  }
  
  // For frequency chores: points are divided among instances
  const pointsPerInstance = chore.points / chore.instances.total;
  
  if (chore.status === 'approved') {
    // For approved: count completed instances
    return pointsPerInstance * chore.instances.completed;
  } else if (chore.status === 'rejected') {
    // For rejected: count rejected instances (total - completed)
    const rejectedInstances = chore.instances.total - chore.instances.completed;
    return pointsPerInstance * rejectedInstances;
  }
  
  return 0;
}

// Payout calculation with new system
function calculatePayout() {
  // Calculate per-kid payouts
  const kidPayouts = state.kids.map(kid => {
    // Start with base $20
    let payout = state.config.base;
    
    // Calculate approved points for this kid (from chores)
    let kidApprovedPoints = 0;
    let kidRejectedPoints = 0;
    let kidExtraBonus = 0;
    
    state.chores.forEach(chore => {
      if (chore.kid === kid.id || chore.kid === 'shared') {
        if (chore.status === 'approved') {
          kidApprovedPoints += calculateChorePoints(chore);
          
          // Add extra credit bonus if enabled
          if (chore.extra && chore.extra.enabled) {
            kidExtraBonus += chore.extra.points * state.config.pointValue;
          }
        } else if (chore.status === 'rejected') {
          kidRejectedPoints += calculateChorePoints(chore);
        }
      }
    });
    
    // Calculate approved ratio (capped at 1)
    const approvedRatio = Math.min(kidApprovedPoints / state.config.weekGoal, 1);
    
    // Calculate grade bonus
    const gradeBonus = calculateGradeBonus(kid);
    
    // Calculate potential bonus from chores and grades
    // Max bonus potential = $10 ($30 ceiling - $20 base)
    const maxBonus = state.config.maxPay - state.config.base;
    
    // Chore bonus based on approved ratio
    const choreBonus = approvedRatio * maxBonus;
    
    // Add bonuses
    payout += choreBonus + gradeBonus + kidExtraBonus;
    
    // Apply penalty for rejected points
    const penalty = kidRejectedPoints * state.config.pointValue;
    payout -= penalty;
    
    // Apply floor of $0
    payout = Math.max(0, payout);
    
    // Apply ceiling of $30
    payout = Math.min(state.config.maxPay, payout);
    
    return {
      id: kid.id,
      name: kid.name,
      emoji: kid.emoji,
      approvedPoints: kidApprovedPoints,
      rejectedPoints: kidRejectedPoints,
      approvedRatio: approvedRatio,
      gradeBonus: gradeBonus,
      extraBonus: kidExtraBonus,
      penalty: penalty,
      payout: payout
    };
  });
  
  // Calculate totals for display
  const totalApproved = kidPayouts.reduce((sum, kid) => sum + kid.approvedPoints, 0);
  const totalRejected = kidPayouts.reduce((sum, kid) => sum + kid.rejectedPoints, 0);
  const totalPayout = kidPayouts.reduce((sum, kid) => sum + kid.payout, 0);
  const approvedRatio = Math.min(totalApproved / state.config.weekGoal, 1);
  
  return {
    total: totalPayout,
    approved: totalApproved,
    rejected: totalRejected,
    pending: state.chores.filter(c => c.status === 'pending').length,
    approvedRatio: approvedRatio,
    base: state.config.base,
    pointValue: state.config.pointValue,
    maxPay: state.config.maxPay,
    weekGoal: state.config.weekGoal,
    gradeBonusPerSubject: state.config.gradeBonusPerSubject,
    kidPayouts
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
    <div class="small">Base: ${formatMoney(state.config.base)}</div>
    <div class="small">Max payout: ${formatMoney(payout.maxPay)}</div>
    <div class="small">Point value: ${formatMoney(state.config.pointValue)} per point</div>
    <div class="small">Weekly goal: ${payout.weekGoal} points</div>
    <div class="small">Approved points: ${payout.approved}/${payout.weekGoal} (${(payout.approvedRatio * 100).toFixed(1)}%)</div>
    <div class="small">Grade bonus: ${formatMoney(state.config.gradeBonusPerSubject)} per improved subject</div>
  `;
  
  // Update individual kid payout cards
  // Always update kid cards, even if kidPayouts is empty (use default/calculated values)
  state.kids.forEach(kid => {
    const kidId = kid.id;
    
    // Find this kid's payout from the payout object
    const kidPayout = payout.kidPayouts?.find(p => p.id === kidId);
    
    // Calculate values if kidPayout doesn't exist
    const approvedPoints = kidPayout?.approvedPoints || 0;
    const approvedRatio = kidPayout?.approvedRatio || Math.min(approvedPoints / state.config.weekGoal, 1);
    const gradeBonus = kidPayout?.gradeBonus || calculateGradeBonus(kid);
    const extraBonus = kidPayout?.extraBonus || 0;
    const penalty = kidPayout?.penalty || 0;
    const payoutValue = kidPayout?.payout || state.config.base;
    
    // Update kid name
    document.getElementById(`${kidId}Name`).textContent = kid.name;
    
    // Update payout value
    document.getElementById(`${kidId}PayoutVal`).textContent = formatMoney(payoutValue);
    
    // Update progress bar (from $0 to $30)
    const progressPercentage = (payoutValue / 30) * 100;
    const progressElement = document.getElementById(`${kidId}Progress`);
    if (progressElement) {
      progressElement.style.width = `${Math.max(0, Math.min(100, progressPercentage))}%`;
    }
    
    // Update points and pending count
    const pendingCount = state.chores.filter(c => c.status === 'pending' && c.kid === kidId).length;
    document.getElementById(`${kidId}ApprovedPts`).textContent = approvedPoints;
    document.getElementById(`${kidId}WeekGoal`).textContent = state.config.weekGoal;
    document.getElementById(`${kidId}PendingCount`).textContent = `${pendingCount} pending`;
    
    // Update breakdown
    document.getElementById(`${kidId}Breakdown`).innerHTML = `
      <div class="small">Base: ${formatMoney(state.config.base)}</div>
      <div class="small">Approved points: ${approvedPoints}/${state.config.weekGoal} (${(approvedRatio * 100).toFixed(1)}%)</div>
      <div class="small">Grade bonus: ${formatMoney(gradeBonus)} (${gradeBonus > 0 ? 'improved subjects' : 'no improvement'})</div>
      <div class="small">Extra credit: ${formatMoney(extraBonus)}</div>
      <div class="small">Penalties: -${formatMoney(penalty)}</div>
      <div class="small">Total: ${formatMoney(payoutValue)}</div>
    `;
  });
  
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
  
  // Update grades summary (simplified since payout is now in kid cards)
  const gradeSummary = document.getElementById('gradeSummary');
  gradeSummary.innerHTML = state.kids.map(k => {
    const gradeBonus = calculateGradeBonus(k);
    
    return `
    <div class="row kid${k.id.slice(-1)}" style="margin:6px 0;padding:8px;background:rgba(0,0,0,0.1);border-radius:8px">
      <div style="flex:1">
        <b>${k.emoji || ''} ${k.name}</b>
        <div class="small muted">Grade bonus: ${formatMoney(gradeBonus)}</div>
        <div class="small muted" style="font-size:10px;margin-top:2px">
          ${Object.entries(k.subjects).map(([subject, data]) => {
            const baseRank = gradeRank[data.baseline] || 0;
            const currentRank = gradeRank[data.current] || 0;
            const improvement = currentRank - baseRank;
            const bonus = improvement > 0 ? `(+$${state.config.gradeBonusPerSubject})` : '';
            return `${subject}: ${data.current} (baseline: ${data.baseline}) ${bonus}`;
          }).join(' • ')}
        </div>
      </div>
      <span class="pill grade-${k.grade.toLowerCase()}">${k.grade}</span>
    </div>
  `}).join('');
  
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
          <div><b>${chore.name}</b> <span class="small muted">(${chore.points} pts • ${chore.frequency} • ${kid.emoji || ''} ${kid.name})</span></div>
          <div class="small stat-${chore.status}">
            ${chore.status} ${timeAgo ? `• ${timeAgo}` : ''}
            ${chore.autoApproved ? '• ⚡ Auto' : ''}
            ${chore.totalInstances > 1 ? `• Instance ${chore.instanceNumber}/${chore.totalInstances}` : ''}
            ${chore.extra && chore.extra.enabled ? `• +${chore.extra.points} extra points` : ''}
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

// Render calculator with new gradeCalc structure
function renderCalculator() {
  const kidSelect = document.getElementById('calcKidSelect');
  const subjectSelect = document.getElementById('calcSubjectSelect');
  const targetGradeSelect = document.getElementById('targetGradeSelect');
  const targetCategorySelect = document.getElementById('targetCategorySelect');
  
  // Populate kid selector
  if (kidSelect) {
    kidSelect.innerHTML = state.kids.map(k => 
      `<option value="${k.id}">${k.emoji || ''} ${k.name}</option>`
    ).join('');
  }
  
  // Get selected kid
  const selectedKidId = kidSelect ? kidSelect.value : 'kid1';
  const kid = state.kids.find(k => k.id === selectedKidId);
  if (!kid || !kid.gradeCalc) return;
  
  // Populate subject selector
  if (subjectSelect) {
    subjectSelect.innerHTML = Object.keys(kid.gradeCalc).map(subject => 
      `<option value="${subject}">${subject}</option>`
    ).join('');
  }
  
  // Get selected subject
  const selectedSubject = subjectSelect ? subjectSelect.value : 'Math';
  const subjectData = kid.gradeCalc[selectedSubject];
  if (!subjectData) return;
  
  // Category weights
  const weights = { tests: 40, quizzes: 30, homework: 30 };
  
  // Calculate averages and contributions
  const rows = document.getElementById('calcRows');
  rows.innerHTML = Object.entries(subjectData).map(([category, scores]) => {
    const avg = scores.length ? 
      (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : 
      0;
    const contribution = (avg * weights[category] / 100).toFixed(1);
    
    return `
      <div class="card" style="margin-bottom:12px">
        <div class="row" style="justify-content:space-between;margin-bottom:8px">
          <b>${category.charAt(0).toUpperCase() + category.slice(1)}</b>
          <span class="small muted">Weight: ${weights[category]}%</span>
        </div>
        <div class="small muted" style="margin-bottom:6px">
          Scores: ${scores.length ? scores.join(', ') : 'None yet'}
        </div>
        <div class="row" style="justify-content:space-between">
          <span class="small">Average: ${avg}%</span>
          <span class="small">Contribution: ${contribution}%</span>
        </div>
        <div class="row" style="margin-top:8px;gap:4px">
          <input type="number" min="0" max="100" placeholder="Add score" 
                 data-kid="${kid.id}" data-subject="${selectedSubject}" data-category="${category}"
                 style="flex:1;padding:4px;font-size:12px">
          <button class="small" data-action="add-score" 
                  data-kid="${kid.id}" data-subject="${selectedSubject}" data-category="${category}">
            Add
          </button>
        </div>
      </div>
    `;
  }).join('');
  
  // Calculate weighted grade for this subject
  let weighted = 0;
  Object.entries(subjectData).forEach(([category, scores]) => {
    const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    weighted += avg * (weights[category] / 100);
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
  
  // Update sparkline with subject grade history
  updateSparkline(kid.gradeHistory);
  
  // Add to grade history if not already there
  const currentGrade = Number(weighted.toFixed(1));
  if (!kid.gradeHistory.includes(currentGrade)) {
    kid.gradeHistory.push(currentGrade);
    kid.gradeHistory = kid.gradeHistory.slice(-12); // Keep last 12
    save();
  }
  
  // Populate "What do I need?" dropdowns
  if (targetGradeSelect) {
    targetGradeSelect.innerHTML = `
      <option value="90">A (90%)</option>
      <option value="80">B (80%)</option>
      <option value="70">C (70%)</option>
      <option value="60">D (60%)</option>
    `;
  }
  
  if (targetCategorySelect) {
    targetCategorySelect.innerHTML = `
      <option value="tests">Tests</option>
      <option value="quizzes">Quizzes</option>
      <option value="homework">Homework</option>
    `;
  }
  
  // Calculate and display "What do I need?" result
  calculateWhatDoINeed(kid, selectedSubject, subjectData, weights);
}

// Calculate "What do I need?" tool
function calculateWhatDoINeed(kid, subject, subjectData, weights) {
  const targetGradeSelect = document.getElementById('targetGradeSelect');
  const targetCategorySelect = document.getElementById('targetCategorySelect');
  const whatDoINeedResult = document.getElementById('whatDoINeedResult');
  
  if (!targetGradeSelect || !targetCategorySelect || !whatDoINeedResult) return;
  
  const targetGrade = parseFloat(targetGradeSelect.value);
  const targetCategory = targetCategorySelect.value;
  
  // Calculate current weighted grade without the target category
  let currentWeighted = 0;
  Object.entries(subjectData).forEach(([category, scores]) => {
    if (category !== targetCategory) {
      const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
      currentWeighted += avg * (weights[category] / 100);
    }
  });
  
  // Calculate required score in target category to reach target grade
  const weight = weights[targetCategory];
  const requiredScore = ((targetGrade - currentWeighted) * 100) / weight;
  
  // Format result
  let resultText = '';
  if (requiredScore > 100) {
    resultText = `Not reachable through ${targetCategory} alone. You'd need ${requiredScore.toFixed(1)}%, which is impossible.`;
  } else if (requiredScore < 0) {
    resultText = `You've already reached your target grade! Current weighted: ${(currentWeighted + (subjectData[targetCategory].length ? (subjectData[targetCategory].reduce((a, b) => a + b, 0) / subjectData[targetCategory].length * weight / 100) : 0)).toFixed(1)}%`;
  } else {
    resultText = `To get a ${targetGrade}% overall, you need ${requiredScore.toFixed(1)}% on your next ${targetCategory.slice(0, -1)}.`;
  }
  
  whatDoINeedResult.textContent = resultText;
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
    const points = Number(document.getElementById('chorePts').value) || 10;
    const frequency = document.getElementById('choreFrequency').value;
    const kid = document.getElementById('choreKid').value;
    
    if (!name) {
      alert('Please enter a chore name');
      return;
    }
    
    // Determine instances based on frequency
    let totalInstances = 1;
    switch (frequency) {
      case 'daily':
        totalInstances = 7;
        break;
      case 'twice-weekly':
        totalInstances = 2;
        break;
      case 'weekly':
      default:
        totalInstances = 1;
        break;
    }
    
    // Calculate points per instance
    const pointsPerInstance = Math.round(points / totalInstances);
    
    // Create separate chore entries for each instance
    for (let i = 0; i < totalInstances; i++) {
      const chore = {
        id: uid(),
        name: `${name} (${i + 1}/${totalInstances})`,
        originalName: name,
        points: pointsPerInstance,
        frequency,
        instanceNumber: i + 1,
        totalInstances,
        kid,
        status: 'pending',
        pinned: false,
        createdAt: now(),
        completedAt: null,
        autoApproved: false,
        recurring: false,
        extra: {
          enabled: false,
          points: 0
        }
      };
      
      state.chores.unshift(chore);
    }
    
    document.getElementById('choreName').value = '';
    addLog(`Added ${frequency} chore: "${name}" (${points} total points, ${totalInstances} instances × ${pointsPerInstance} points each) for ${kid === 'shared' ? 'shared' : state.kids.find(k => k.id === kid)?.name}`);
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
    if (!confirm('Start a new week? Current chores will be cleared (except recurring). Baselines will be updated to current grades.')) return;
    
    const oldWeek = formatDate(state.weekStart);
    state.weekStart = getWeekStart();
    // Keep only recurring chores
    state.chores = state.chores.filter(c => c.recurring);
    
    // Auto-update baselines: set baseline = current for all subjects
    state.kids.forEach(kid => {
      Object.keys(kid.subjects).forEach(subject => {
        kid.subjects[subject].baseline = kid.subjects[subject].current;
      });
      // Also update baseline grade
      kid.baselineGrade = kid.grade;
    });
    
    addLog(`Manual new week reset (was ${oldWeek}) - baselines updated`);
    render();
  });
  
  // Grade modal
  const gradeModal = document.getElementById('gradeModal');
  document.getElementById('openGradeBtn').addEventListener('click', () => {
    const rows = document.getElementById('gradeRows');
    rows.innerHTML = state.kids.map(k => {
      const subjectsHtml = Object.entries(k.subjects).map(([subject, data]) => `
        <div class="row" style="margin:5px 0;align-items:center">
          <label style="flex:1;font-size:12px">${subject.charAt(0).toUpperCase() + subject.slice(1)}</label>
          <select data-kid="${k.id}" data-subject="${subject}" data-type="current" style="width:80px;font-size:12px">
            ${['A', 'B', 'C', 'D', 'F'].map(g => 
              `<option value="${g}" ${data.current === g ? 'selected' : ''}>${g}</option>`
            ).join('')}
          </select>
          <span class="small muted" style="margin-left:4px;font-size:10px">current grade</span>
        </div>
      `).join('');
      
      return `
        <div style="margin:15px 0;padding:10px;background:rgba(0,0,0,0.1);border-radius:8px">
          <div style="font-weight:bold;margin-bottom:8px">${k.emoji || ''} ${k.name}</div>
          ${subjectsHtml}
        </div>
      `;
    }).join('');
    gradeModal.showModal();
  });
  
  document.getElementById('gradeCancel').addEventListener('click', () => gradeModal.close());
  document.getElementById('gradeSave').addEventListener('click', () => {
    document.querySelectorAll('[data-kid][data-subject]').forEach(select => {
      const kid = state.kids.find(k => k.id === select.dataset.kid);
      if (kid && kid.subjects[select.dataset.subject]) {
        const type = select.dataset.type; // 'current' or 'baseline'
        const oldValue = kid.subjects[select.dataset.subject][type];
        const newValue = select.value;
        
        if (oldValue !== newValue) {
          kid.subjects[select.dataset.subject][type] = newValue;
          addLog(`Updated ${kid.name} ${select.dataset.subject} ${type}: ${oldValue} → ${newValue}`);
          
          // Update overall grade based on average of current subject grades
          if (type === 'current') {
            const currentGrades = Object.values(kid.subjects).map(s => s.current);
            const gradeCounts = currentGrades.reduce((acc, grade) => {
              acc[grade] = (acc[grade] || 0) + 1;
              return acc;
            }, {});
            
            // Find most common grade
            let mostCommon = 'B';
            let maxCount = 0;
            for (const [grade, count] of Object.entries(gradeCounts)) {
              if (count > maxCount) {
                maxCount = count;
                mostCommon = grade;
              }
            }
            kid.grade = mostCommon;
          }
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
  
  // Add score to calculator (new structure)
  document.addEventListener('click', (e) => {
    if (e.target.matches('[data-action="add-score"]')) {
      const input = e.target.previousElementSibling;
      const score = Number(input.value);
      const kidId = e.target.dataset.kid;
      const subject = e.target.dataset.subject;
      const category = e.target.dataset.category;
      
      if (isNaN(score) || score < 0 || score > 100) {
        alert('Please enter a valid score (0-100)');
        return;
      }
      
      const kid = state.kids.find(k => k.id === kidId);
      if (kid && kid.gradeCalc && kid.gradeCalc[subject] && kid.gradeCalc[subject][category]) {
        kid.gradeCalc[subject][category].push(score);
        input.value = '';
        addLog(`Added ${score}% to ${subject} ${category} for ${kid.name}`);
        renderCalculator();
        save();
      }
    }
  });
  
  // Update calculator when kid or subject changes
  document.getElementById('calcKidSelect')?.addEventListener('change', renderCalculator);
  document.getElementById('calcSubjectSelect')?.addEventListener('change', renderCalculator);
  document.getElementById('targetGradeSelect')?.addEventListener('change', () => {
    const kidSelect = document.getElementById('calcKidSelect');
    const subjectSelect = document.getElementById('calcSubjectSelect');
    const kid = state.kids.find(k => k.id === kidSelect.value);
    const subjectData = kid?.gradeCalc?.[subjectSelect.value];
    const weights = { tests: 40, quizzes: 30, homework: 30 };
    
    if (kid && subjectData) {
      calculateWhatDoINeed(kid, subjectSelect.value, subjectData, weights);
    }
  });
  document.getElementById('targetCategorySelect')?.addEventListener('change', () => {
    const kidSelect = document.getElementById('calcKidSelect');
    const subjectSelect = document.getElementById('calcSubjectSelect');
    const kid = state.kids.find(k => k.id === kidSelect.value);
    const subjectData = kid?.gradeCalc?.[subjectSelect.value];
    const weights = { tests: 40, quizzes: 30, homework: 30 };
    
    if (kid && subjectData) {
      calculateWhatDoINeed(kid, subjectSelect.value, subjectData, weights);
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
    state.config.parentPin = newPin || null; // Default if empty (changed from '1234' to null)
    save();
    
    pinStatus.textContent = newPin ? 'PIN updated successfully' : 'PIN removed';
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
  document.getElementById('resetAppBtn').addEventListener('click', resetApp);
  
  // Log buttons
  document.getElementById('clearLogBtn').addEventListener('click', () => {
    if (confirm('Clear logs older than 7 days?')) {
      const weekAgo = now() - (7 * 24 * 60 * 60 * 1000);
      state.logs = state.logs.filter(log => {
        // Parse timestamp from log entry (format: "MM/DD/YYYY, HH:MM:SS AM/PM: message")
        try {
          const timestampMatch = log.match(/^(\d{1,2}\/\d{1,2}\/\d{4}, \d{1,2}:\d{2}:\d{2} (?:AM|PM))/);
          if (timestampMatch) {
            const logDate = new Date(timestampMatch[1]);
            return logDate.getTime() >= weekAgo;
          }
          // If we can't parse the timestamp, keep the log (safer)
          return true;
        } catch (e) {
          // If parsing fails, keep the log
          return true;
        }
      });
      addLog('Cleared logs older than 7 days');
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
    // If parentPin is null, allow any PIN (no PIN set)
    if (state.config.parentPin === null || pin === state.config.parentPin) {
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
    // If parentPin is null, allow any PIN (no PIN set)
    if (state.config.parentPin === null || pin === state.config.parentPin) {
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
  
  if (action === 'approve') {
    // For approve: mark as approved and ask about extra credit
    chore.status = 'approved';
    
    // Ask about extra credit
    const extraPoints = prompt(`Approve "${chore.name}". Add extra credit points? (Enter 0 for none):`, "0");
    if (extraPoints !== null) {
      const points = parseInt(extraPoints) || 0;
      if (points > 0) {
        chore.extra = {
          enabled: true,
          points: points
        };
        addLog(`Parent approved "${chore.name}" with +${points} extra points`);
      } else {
        chore.extra = { enabled: false, points: 0 };
        addLog(`Parent approved "${chore.name}"`);
      }
    } else {
      // User cancelled, don't approve
      chore.status = oldStatus;
      pendingPinAction = null;
      return;
    }
    
    confetti();
  } else {
    // For reject: mark as rejected
    chore.status = 'rejected';
    
    addLog(`Parent rejected "${chore.name}"`);
  }
  
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

// Reset app (clear localStorage and reload)
function resetApp() {
  if (!confirm('Reset the entire app? This will clear ALL data and reload the page.')) return;
  
  localStorage.clear();
  addLog('App reset - localStorage cleared');
  // Reload the page
  window.location.reload();
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