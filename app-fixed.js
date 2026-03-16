// ── SUPABASE CONFIG ──────────────────────────────────────
const SUPABASE_URL = 'https://fjvhkiynqejnbdbfwyxx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqdmhraXlucWVqbmJkYmZ3eXh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MTQ2OTUsImV4cCI6MjA4OTA5MDY5NX0.Rk2APihye1Zut-k5Wmm7Kn3NmIWIvM74srtBM-8vjA4';
const FAMILY_ID = 'family';
const STORAGE_KEY = 'famboard-v3';

// Supabase client (lightweight fetch wrapper — no CDN needed)
const db = {
  async load() {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/board_state?id=eq.${FAMILY_ID}&select=data`,
        { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
      );
      const rows = await res.json();
      if (rows && rows.length > 0 && rows[0].data) return rows[0].data;
      return null;
    } catch(e) {
      console.warn('Supabase load failed, using localStorage', e);
      return null;
    }
  },
  
  async save(data) {
    try {
      await fetch(
        `${SUPABASE_URL}/rest/v1/board_state`,
        {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates'
          },
          body: JSON.stringify([
            { id: FAMILY_ID, data, updated_at: new Date().toISOString() }
          ])
        }
      );
    } catch(e) {
      console.warn('Supabase save failed', e);
    }
  }
};

// Sync status UI
function setSyncStatus(status) {
  const dot = document.getElementById('syncDot');
  if (!dot) return;
  dot.className = `sync-dot ${status}`;
  dot.title = {
    saving: 'Syncing to cloud...',
    saved: 'Online - synced with cloud',
    offline: 'Offline - using local storage'
  }[status] || 'Unknown sync status';
}

async function load() {
  setSyncStatus('saving');
  const remote = await db.load();
  if (remote) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(remote));
    setSyncStatus('saved');
    return remote;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return stateDefault();
    return JSON.parse(raw);
  } catch(e) {
    return stateDefault();
  }
}

// Save with Supabase sync - FIXED VERSION
async function save() {
  try {
    setSyncStatus('saving');
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    await db.save(state);
    updateDataSize();
  } catch (e) {
    console.error('Save error:', e);
  }
}

let state = null;
let currentFilter = 'all';
let pendingPinAction = null;

// Initialize - FIXED VERSION
async function init() {
  state = await load();
  const isFirstTime = !state || state.kids?.[0]?.name === 'Kid 1';
  
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

// The rest of the original file continues here...
