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

// ── REFLECTION PROMPTS (Decision Card & confidence builders) ──
const REFLECT = {
  decision: { title: '🧭 Decision Card', intro: 'Think it through. A parent reads this before approving.', qs: [
    ['options', 'What were your choices?', 'e.g. Finish my project first, or go to the park'],
    ['pick', 'What did you pick, and why?', 'The reason matters more than the choice'],
    ['result', 'How did it turn out? Would you choose the same again?', ''] ] },
  brave: { title: '🦁 One brave thing', intro: 'Something a little uncomfortable counts. Big or small.', qs: [
    ['what', 'What brave thing did you do?', 'e.g. Ordered my own food, called Grandma, tried a new food'],
    ['before', 'How did you feel before?', ''],
    ['after', 'How do you feel now?', ''] ] },
  charge: { title: '👑 Kid in charge', intro: 'You planned it, you ran it. Tell us how it went.', qs: [
    ['plan', 'What did you plan?', 'e.g. Game night with snacks, a park picnic'],
    ['budget', 'What was the budget, and how did you stay in it?', ''],
    ['next', 'What went well, and what would you change next time?', ''] ] },
  teach: { title: '🍎 Teach the family', intro: 'The best way to learn something is to teach it.', qs: [
    ['topic', 'What did you teach us?', ''],
    ['how', 'How did you explain it?', ''],
    ['q', 'What question did someone ask you?', ''] ] }
};
const REFLECT_KEYS = Object.keys(REFLECT);

// ── BREAK-WEEK CHORE SET (added to the bank once) ──
const BREAK_SET = [
  { name: 'Holiday helper', freq: 'twice-weekly', weight: 1, dod: '30+ min helping decorate, wrap gifts, bake or set the table, then clean up' },
  { name: 'Big home project', freq: 'weekly', weight: 2, dod: 'Closet clean-out with a donate bag, help wash the car, or deep-clean a room. Show a parent before and after' },
  { name: 'Help cook a family meal', freq: 'weekly', weight: 2, dod: 'Help from prep to cleanup' },
  { name: 'Decision Card', freq: 'twice-weekly', weight: 2, reflect: 'decision', dod: 'Make a real choice, then answer the 3 questions' },
  { name: 'One brave thing', freq: 'twice-weekly', weight: 1, reflect: 'brave', dod: 'Order your own food, call someone, ask a question, or try something new' },
  { name: 'Kid in charge', freq: 'weekly', weight: 3, reflect: 'charge', dod: 'Plan and run part of a family day within the budget a parent gives you' },
  { name: 'Teach the family', freq: 'weekly', weight: 1, reflect: 'teach', dod: 'Learn something and teach it to us in 5 minutes' }
];
// School-set chores that also stay on during breaks.
const BREAK_KEEP = ['clean room', 'morning routine', 'load dishwasher', 'call family members', 'clean and organize doll house(s)', 'put away clothes', 'bedtime routine', 'make bed', 'read for 25 minutes'];

// ── SKILL QUESTS ──
const QUEST_TRACKS = [
  { id: 'basics', name: 'Computer basics', icon: '💻', badge: 'Power User' },
  { id: 'safe', name: 'Stay safe online', icon: '🛡️', badge: 'Cyber Guardian' },
  { id: 'ai', name: 'AI smarts', icon: '🤖', badge: 'AI Navigator' },
  { id: 'make', name: 'Make something', icon: '🛠️', badge: 'Creator' }
];
const QUESTS = [
  // Computer basics
  { id: 'b1', track: 'basics', title: 'Know your machine', pay: 1, mins: 15,
    steps: ['On your iPad or computer, find Settings → General → About (or This PC on Windows).', 'Find: the device name, the operating system and its version, and how much storage is free.', 'Learn the difference: an app vs. a file vs. a folder vs. the browser.'],
    ask: 'What device did you check, what version is it on, and how much storage is free?' },
  { id: 'b2', track: 'basics', title: 'Files & folders boss', pay: 1, mins: 20,
    steps: ['In Files (iPad) or File Explorer / Finder, make a folder called “School”.', 'Inside it, make 3 subfolders (like Math, English, Science).', 'Rename one file and move 3 files into the right folders.', 'Show a parent where everything ended up.'],
    ask: 'What folders did you make, and which files did you move?' },
  { id: 'b3', track: 'basics', title: 'Shortcut ninja', pay: 1, mins: 15,
    steps: ['Learn these: copy, paste, undo, select all, find on page, screenshot, switch apps.', 'Mac/iPad keyboard uses ⌘ (Command). Windows uses Ctrl.', 'Show a parent all 7 without looking them up.'],
    ask: 'Which shortcut was new to you, and what will you use it for?' },
  { id: 'b4', track: 'basics', title: 'Typing practice', pay: 0.5, mins: 15, repeat: true,
    steps: ['Practice typing 15 minutes, 3 different days this week (typing.com or keybr.com are free).', 'Fingers on the home row: A S D F and J K L ;', 'Write down your words-per-minute each time.'],
    ask: 'What were your 3 words-per-minute scores this week?' },
  { id: 'b5', track: 'basics', title: 'Write a real email', pay: 1, mins: 20,
    steps: ['Email a relative from your account (with permission).', 'Include a clear subject line, a greeting, at least 3 sentences, and a sign-off.', 'CC a parent so they see it.'],
    ask: 'Who did you email and what was your subject line?' },
  { id: 'b6', track: 'basics', title: 'Search like a pro', pay: 1.5, mins: 25,
    steps: ['Try 3 search tricks: “quotes” for an exact phrase, a minus sign to remove a word (jaguar -car), and site: to search one website (site:nasa.gov moon).', 'Find 3 facts about a topic you like, and write down where each came from.', 'Decide which source is most trustworthy, and why.'],
    ask: 'Your 3 facts, their sources, and which source you trust most and why.' },
  // Stay safe online
  { id: 's1', track: 'safe', title: 'Password power', pay: 1, mins: 15,
    steps: ['Learn why long passphrases (4 random words) beat short tricky passwords.', 'Learn why you never reuse the same password on different apps.', 'With a parent, check that your main account has a passcode and 2-step verification on.', 'Never type a real password into this app!'],
    ask: 'Make up an EXAMPLE passphrase (not a real one) and explain why it is strong.' },
  { id: 's2', track: 'safe', title: 'Spot the scam', pay: 1, mins: 20,
    steps: ['Ask a parent to show you a few real scam texts or emails (or search “phishing examples for kids”).', 'Look for red flags: hurry-up language, strange links, asking for a code or password, prizes that are too good to be true, misspelled company names.', 'Learn the rule: never send a code or password to anyone, even if they say they are from the company.'],
    ask: 'List 3 red flags you found and what you would do if you got that message.' },
  { id: 's3', track: 'safe', title: 'Privacy check-up', pay: 1, mins: 20,
    steps: ['Pick one app or game you use.', 'With a parent, check: who can message you, who can see your profile, and whether location sharing is off.', 'Change anything that is too open.'],
    ask: 'Which app did you check, and what did you change?' },
  { id: 's4', track: 'safe', title: 'Never post this', pay: 0.5, mins: 10,
    steps: ['Learn what stays private: full name with school, home address, phone number, your live location, passwords, photos showing your school logo or house number.', 'Think about what a stranger could figure out from one photo.'],
    ask: 'Name 5 things you will never post, and why.' },
  { id: 's5', track: 'safe', title: 'Your digital footprint', pay: 1, mins: 20,
    steps: ['With a parent, search your own name online.', 'Talk about what a stranger, a school or a future boss could learn about you.', 'Remember: things posted online can stay forever, even “disappearing” messages can be screenshotted.'],
    ask: 'What did you find, and what is one thing you will do differently?' },
  { id: 's6', track: 'safe', title: 'When something feels off', pay: 1, mins: 15,
    steps: ['Make a plan for when someone online is mean, creepy or asks for secrets: stop replying, screenshot, block, report, tell a parent.', 'Find the block and report buttons in one app you use.', 'Remember: you will never be in trouble for telling a parent.'],
    ask: 'Write your plan in your own words, and where the report button is in your app.' },
  // AI smarts
  { id: 'a1', track: 'ai', title: 'What is AI, really?', pay: 1, mins: 15,
    steps: ['Learn the big idea: chatbots predict the most likely next words based on huge amounts of text. They do not “know” things like people do.', 'That is why AI can sound very sure and still be wrong.', 'Explain it to a parent in your own words.'],
    ask: 'Explain how an AI chatbot works in 2–3 sentences, in your own words.' },
  { id: 'a2', track: 'ai', title: 'Your AI, set up right', pay: 1, mins: 20,
    steps: ['Open your AI app with a parent and look through its settings: chat history, what it remembers, and how to delete a chat.', 'Agree on family AI rules together. For example: no personal info, AI helps me learn but does not do my homework, tell a parent about anything weird.', 'Write the rules down somewhere you will see them.'],
    ask: 'What are your family’s AI rules?' },
  { id: 'a3', track: 'ai', title: 'Prompt like a pro', pay: 1.5, mins: 20,
    steps: ['Ask your AI something vague, like “tell me about dogs”.', 'Now ask a great prompt: say who you are, what you want, details, and the format. e.g. “I’m 11 and want a small dog for a Florida apartment. Compare 3 breeds in a short table.”', 'Compare the two answers.'],
    ask: 'Paste your best prompt, and explain what made the answer better.' },
  { id: 'a4', track: 'ai', title: 'Catch the AI mistake', pay: 1.5, mins: 25,
    steps: ['Ask your AI 5 questions about something you know really well: your favorite book, a game, your city, or tricky math.', 'Check each answer against a real source or what you know.', 'Find at least one mistake or made-up detail (this is called a “hallucination”).'],
    ask: 'What did the AI get wrong, and how did you find out?' },
  { id: 'a5', track: 'ai', title: 'AI tutor, not a cheat code', pay: 1.5, mins: 25,
    steps: ['Pick a school topic that is hard for you.', 'Ask your AI: “Quiz me on this one question at a time. Give hints, not answers.”', 'Do at least 5 questions, then show a parent what you learned.'],
    ask: 'What topic did you practice, and what do you understand now that you didn’t before?' },
  { id: 'a6', track: 'ai', title: 'Real or AI?', pay: 1, mins: 20,
    steps: ['With a parent, look at some real photos and AI-made ones (try whichfaceisreal.com).', 'Look for clues: odd hands or text, too-smooth skin, backgrounds that don’t make sense, no clear source.', 'Learn the rule: check where something came from before you believe it or share it.'],
    ask: 'How did you do, and what clues helped you tell?' },
  { id: 'a7', track: 'ai', title: 'AI and fairness', pay: 1, mins: 20,
    steps: ['Ask your AI to describe “a scientist”, “a nurse”, and “a CEO”, or to make pictures of them.', 'Notice patterns: who does it imagine? Who gets left out?', 'Talk with a parent about why AI can repeat stereotypes from what it learned.'],
    ask: 'What patterns did you notice, and why do you think that happens?' },
  // Make something
  { id: 'm1', track: 'make', title: 'Make a slideshow', pay: 2, mins: 45,
    steps: ['Make 5 slides about something you love in Keynote, Google Slides or PowerPoint.', 'Use big titles, a few words per slide, and pictures.', 'Present it to the family.'],
    ask: 'What was your slideshow about, and what was the hardest part?' },
  { id: 'm2', track: 'make', title: 'Spreadsheet budget', pay: 2, mins: 40,
    steps: ['In Numbers, Google Sheets or Excel, plan how you would spend $50 on gifts.', 'Make columns: Person, Gift, Price.', 'Use a SUM formula to add up the total, and adjust until it is under $50.'],
    ask: 'What formula did you use, and what was your final total?' },
  { id: 'm3', track: 'make', title: 'Code a game', pay: 2, mins: 60,
    steps: ['Do one Hour of Code activity on code.org, or make a small game in Scratch (scratch.mit.edu).', 'Change something in the code to make it your own.', 'Show the family how it works.'],
    ask: 'What did you build, and what did you change in the code?' },
  { id: 'm4', track: 'make', title: 'Make a how-to video', pay: 2, mins: 45,
    steps: ['Film a 60-second video teaching how to do something (a recipe, a craft, a trick).', 'Edit it in iMovie or CapCut: trim it, add a title and captions.', 'Show a parent. Only share it where a parent says it’s OK.'],
    ask: 'What did your video teach, and which editing tool did you learn?' },
  { id: 'm5', track: 'make', title: 'Build it with AI help', pay: 2, mins: 45,
    steps: ['Pick a small project (a party plan, a comic, a story, a poster).', 'Use your AI to brainstorm ideas, then make it yourself.', 'Keep track of which ideas came from you and which came from the AI.'],
    ask: 'What did you make, and which parts were your ideas vs. the AI’s?' },
  { id: 'm6', track: 'make', title: 'Make a mini website', pay: 2, mins: 60,
    steps: ['With a parent, make a one-page site about a hobby using Google Sites.', 'Add a title, a photo, a few paragraphs and one link.', 'Keep it private or share only with family.'],
    ask: 'What is your site about, and what would you add next?' }
];
const questById = id => QUESTS.find(q => q.id === id);


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
    alertHours: [17, 20],
    breakMode: false,
    journal: [], questLog: [], seeded: []
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
  ['chores', 'logs', 'bank', 'activities', 'pendingRewards', 'pointSubmissions', 'penalties', 'journal', 'questLog', 'seeded'].forEach(k => { if (!Array.isArray(s[k])) s[k] = d[k]; });
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
    if (!Array.isArray(b.autoBreak)) b.autoBreak = [];
    if (b.reflect && !REFLECT[b.reflect]) b.reflect = '';
    delete b.kid;
  });
  // One-time: add the break-week chore set and pin it (and kept school chores) for break weeks.
  if (!s.seeded.includes('break-v1')) {
    const has = n => s.bank.find(b => b.name.toLowerCase() === n.toLowerCase());
    s.bank.forEach(b => { if (BREAK_KEEP.includes(b.name.toLowerCase()) && !b.autoBreak.length) b.autoBreak = /read/i.test(b.name) ? [...b.auto] : [0, 1]; });
    BREAK_SET.forEach(x => { if (!has(x.name)) s.bank.push({ ...x, pays: 'allowance', extra: false, bonusDollars: 0, points: 0, recurring: false, auto: [], autoBreak: [0, 1], reflect: x.reflect || '' }); });
    s.seeded.push('break-v1');
  }
  s.chores.forEach(c => { if (c.rare && !c.points) c.points = 10; });
  if (typeof s.teamGoal !== 'object') s.teamGoal = d.teamGoal;
  if (typeof s.teamPoints !== 'number') s.teamPoints = 0;
  if (typeof s.base !== 'number') s.base = 20;
  if (typeof s.maxPay !== 'number') s.maxPay = 30;
  if (!s.screenTimeBase) s.screenTimeBase = 360;
  if (!Array.isArray(s.alertHours)) s.alertHours = [17, 20];
  s.breakMode = !!s.breakMode;
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
  const extraChores = S.chores.filter(c => c.kid === i && c.extra && c.status === 'approved').reduce((s, c) => s + (c.bonusDollars || 0), 0);
  const questMoney = questEarnedThisWeek(i);
  const extra = Math.min(EXTRA_CAP, extraChores + questMoney);
  const pay = Math.max(0, Math.min(S.maxPay, choreEarned + extra + grade));
  const approved = S.chores.filter(c => c.kid === i && isRegular(c) && c.status === 'approved').length;
  return { total, val, weighted, rejected, choreEarned, extra, extraChores, questMoney, grade, pay, approved, wiped, penalties, lost: wiped ? choreBefore + gradeBefore : 0, choreBefore };
}
const kidPayout = i => payoutParts(i).pay;
const EXTRA_CAP = 5;
const questEarnedThisWeek = i => (S.questLog || []).filter(e => e.kid === i && e.status === 'approved' && e.week === S.week).reduce((s, e) => s + (e.pay || 0), 0);
// Pins: 📌 school weeks use b.auto, 🎄 break weeks use b.autoBreak.
const pinField = () => S.breakMode ? 'autoBreak' : 'auto';
const pinsFor = b => (S.breakMode ? b.autoBreak : b.auto) || [];

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
      reflect: REFLECT[def.reflect] ? def.reflect : '',
      status: 'none', createdAt: now(), submittedAt: null
    });
  }
  return n;
}

// Daily chores from earlier days this week that were never checked off.
const overdueChores = () => S.chores.filter(c => c.status === 'none' && c.freq === 'daily' && c.day !== undefined && c.day < todayIdx());
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
  c.status = 'approved'; c.approvedAt = now(); c.missed = false; c.note = '';
  const who = isKid(c.kid) ? c.kid : (isKid(c.by) ? c.by : null);
  if (who !== null) S.kids[who].xp = (S.kids[who].xp || 0) + 1;
  if (c.rare && who !== null) { const k = S.kids[who]; k.points = (k.points || 0) + c.points; k.weekPoints = (k.weekPoints || 0) + c.points; }
  S.teamPoints = (S.teamPoints || 0) + TEAM_PTS_PER_CHORE + (c.rare ? c.points : 0);
  if (c.reflect && c.answers && who !== null) {
    S.journal = [{ id: uid(), choreId: c.id, kid: who, kind: c.reflect, chore: c.baseName, answers: c.answers, at: now() }, ...(S.journal || []).filter(j => j.choreId !== c.id)].slice(0, 120);
  }
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
  rewards: S.pendingRewards.filter(r => r.status === 'pending').length,
  quests: (S.questLog || []).filter(e => e.status === 'pending').length
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
  const pc = pendingCounts(), inbox = pc.chores + pc.acts + pc.rewards + pc.quests;
  const tabs = p
    ? [['inbox', '📥', 'Approvals', inbox], ['chores', '📋', 'Chores'], ['family', '👨‍👩‍👧', 'Family'], ['settings', '⚙️', 'Settings']]
    : [['today', '🏠', 'Today'], ['chores', '✅', 'Chores'], ['learn', '🧠', 'Learn'], ['rewards', '🎁', 'Rewards'], ['team', '💜', 'Team']];
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
  if (c.reflect && REFLECT[c.reflect] && (mode === 'kid' || !c.answers)) meta.push('<span class="tag reflect">📝 3 questions</span>');
  if (c.status === 'pending') meta.push(`<span class="tag waiting">⏳ waiting for OK · ${hrsAgo(c.submittedAt)}</span>`);
  else if (c.status === 'approved') meta.push('<span class="tag ok">✓ approved</span>');
  else if (c.status === 'rejected') meta.push(c.missed ? '<span class="tag no">✗ missed</span>' : '<span class="tag no">↺ try again</span>');
  if (c.dod) meta.push(`<span class="${meta.length ? 'dot' : ''}">${esc(c.dod)}</span>`);
  const kidCls = isKid(c.kid) ? KID_CLS[c.kid] : '';
  const icon = `<div class="ico ${icoBg[hashIdx(c.baseName, icoBg.length)]}">${choreIcon(c.baseName)}</div>`;
  const note = c.status === 'rejected' && c.note ? `<div class="rej-note">💬 ${esc(c.note)}</div>` : '';
  const refl = mode === 'parent' && c.answers ? reflectionBlock(c.reflect, c.answers) : '';
  const body = `<div class="ci"><div class="cn">${esc(display)}</div><div class="cm">${meta.join('')}</div>${note}${refl}</div>`;
  if (mode === 'kid') {
    const glyph = c.missed && c.status === 'rejected' ? '✗' : { none: '', pending: '⏳', approved: '✓', rejected: '↺' }[c.status] || '';
    return `<div class="chore status-${c.status}">${icon}${body}<span class="pill ${c.status === 'approved' ? 'green' : c.status === 'rejected' ? 'lost' : ''}">${c.status === 'rejected' ? '<s>' + val + '</s>' : val}</span>
      <button class="check ${c.status}" data-act="kid-toggle" data-id="${c.id}" aria-label="Mark ${esc(display)} done">${glyph}</button></div>`;
  }
  const acts = c.status === 'pending'
    ? `<button class="ibtn ok" data-act="approve" data-id="${c.id}" aria-label="Approve">✓</button><button class="ibtn no" data-act="reject" data-id="${c.id}" aria-label="Reject">✗</button>`
    : c.status === 'none' ? `<button class="ibtn ok" data-act="mark-done" data-id="${c.id}" title="Mark done" aria-label="Mark done">✓</button><button class="ibtn no" data-act="miss" data-id="${c.id}" title="Mark not finished" aria-label="Mark not finished">✗</button>`
    : (c.status === 'rejected' ? `<button class="ibtn" data-act="note-open" data-id="${c.id}" title="Add a note" aria-label="Add a note">💬</button>` : '') + `<button class="ibtn" data-act="reset" data-id="${c.id}" title="Reset to not done" aria-label="Reset">↺</button>`;
  return `<div class="chore prow ${kidCls} status-${c.status}">${icon}${body}<div class="actions">${acts}
    <button class="ibtn" data-act="edit" data-id="${c.id}" aria-label="Edit">✏️</button>
    <button class="ibtn ghost" data-act="del" data-id="${c.id}" aria-label="Delete">🗑</button></div></div>`;
}

function reflectionBlock(kind, answers) {
  const R = REFLECT[kind]; if (!R || !answers) return '';
  return `<div class="reflection">${R.qs.filter(([k]) => answers[k]).map(([k, q]) => `<div class="rq">${esc(q)}</div><div class="ra">${esc(answers[k])}</div>`).join('')}</div>`;
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
      <div class="line"><span>Extra credit${p.questMoney ? ' & quests' : ''}${p.extraChores + p.questMoney > EXTRA_CAP ? ' (max $' + EXTRA_CAP + ')' : ''}</span><span class="plus">+${money(p.extra)}</span></div>
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
  if (t === 'learn') return kidLearnView(i);
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
  const shown = seg === 'todo' ? week.filter(c => !isDoneish(c) && !c.missed) : seg === 'done' ? week.filter(isDoneish) : list;
  const sentBack = week.filter(c => c.status === 'rejected');
  const order = { rejected: 0, none: 1, pending: 2, approved: 3 };
  shown.sort((a, b) => order[a.status] - order[b.status]);
  const lvl = LEVELS[Math.min(Math.floor((S.kids[i].xp || 0) / 25), LEVELS.length - 1)];

  const left = `<div class="col">
    <div class="hero"><div class="hero-main"><span class="hero-tag">${S.breakMode ? '🎄 Break week' : '✦ Your daily glow-up'}</span>
      <div class="hero-title">Hey, ${esc(S.names[i])}! ✌️</div><div class="hero-text">${msg}</div></div>
      ${ring(pct, list.length ? `${done} of ${list.length} done` : 'free day')}</div>
    <div class="grid3">
      <div class="stat"><div class="stat-ico bg-gold">⭐</div><div class="stat-val">${availablePoints(i)} pts</div><div class="stat-lbl">Your points balance</div></div>
      <div class="stat"><div class="stat-ico bg-red">🔥</div><div class="stat-val">${streak(i)} day${streak(i) === 1 ? '' : 's'}</div><div class="stat-lbl">Streak · ${lvl}</div></div>
      <div class="stat"><div class="stat-ico bg-blue">🎯</div><div class="stat-val">${done} of ${list.length}</div><div class="stat-lbl">Today's chores</div></div>
    </div>
    <div class="wide-only col">${allowanceCard(i)}${screenCard(i)}</div>
  </div>`;

  const tryN = sentBack.filter(c => !c.missed).length, missN = sentBack.length - tryN;
  const banner = sentBack.length ? `<button class="sentback" data-act="tab" data-tab="chores">
      <span class="sb-ico">${tryN ? '↺' : '✗'}</span><span class="sb-txt"><b>${[tryN ? tryN + ' to try again' : '', missN ? missN + ' marked missed' : ''].filter(Boolean).join(' · ')}</b>
      <span>${sentBack.slice(0, 2).map(c => esc(c.freq === 'daily' && c.day !== undefined ? c.baseName + ' (' + DAYS[c.day] + ')' : c.name) + (c.note ? ' — “' + esc(c.note) + '”' : '')).join('<br>')}${sentBack.length > 2 ? '<br>+' + (sentBack.length - 2) + ' more' : ''}</span></span><span class="sb-go">See all ›</span></button>` : '';
  const right = `<div class="col">
    ${banner}
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
    [c => c.status === 'rejected' && !c.missed, '↺ Try again', 'A parent sent these back — fix them up and tap the circle again.'],
    [c => c.status === 'rejected' && c.missed, '✗ Missed', "A parent marked these as not done. They don't count toward your allowance this week."],
    [c => c.status === 'none', '📝 To do', ''],
    [c => c.status === 'pending', '⏳ Waiting for a parent', ''],
    [c => c.status === 'approved', '✅ Done & approved', '']
  ];
  const mySubs = S.pointSubmissions.filter(p => p.kidIdx === i && p.status === 'pending');
  const left = `<div class="col">
    <div><div class="section-title">My chores</div><div class="section-sub">Week of ${esc(S.week)} · ${week.length} total</div></div>
    ${week.length ? groups.map(([st, title, sub]) => {
      const items = week.filter(st);
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


// ── SKILL QUESTS (kid Learn tab) ─────────────────────────────
function questEntries(i, qid) { return (S.questLog || []).filter(e => e.kid === i && e.qid === qid); }
function questState(i, q) {
  // done | pending | retry | open | locked  (repeatable quests: done = approved this week)
  const es = questEntries(i, q.id);
  if (es.some(e => e.status === 'pending')) return 'pending';
  if (q.repeat ? es.some(e => e.status === 'approved' && e.week === S.week) : es.some(e => e.status === 'approved')) return 'done';
  const last = es[es.length - 1];
  if (last && last.status === 'rejected') return 'retry';
  if (q.repeat) return 'open';
  const track = QUESTS.filter(x => x.track === q.track && !x.repeat);
  const idx = track.indexOf(q);
  const prevOk = idx <= 0 || ['done', 'pending'].includes(questState(i, track[idx - 1]));
  return prevOk ? 'open' : 'locked';
}
const questDoneCount = i => QUESTS.filter(q => !q.repeat && questEntries(i, q.id).some(e => e.status === 'approved')).length;
const trackDone = (i, t) => QUESTS.filter(q => q.track === t.id && !q.repeat).every(q => questEntries(i, q.id).some(e => e.status === 'approved'));

function kidLearnView(i) {
  const p = payoutParts(i), oneTime = QUESTS.filter(q => !q.repeat).length, done = questDoneCount(i);
  const capLeft = Math.max(0, EXTRA_CAP - p.extraChores - p.questMoney);
  const badges = QUEST_TRACKS.filter(t => trackDone(i, t));
  const glyph = { done: '✓', pending: '⏳', retry: '↺', open: '▶', locked: '🔒' };
  const tracks = QUEST_TRACKS.map(t => {
    const qs = QUESTS.filter(q => q.track === t.id);
    const n = qs.filter(q => !q.repeat).length, d = qs.filter(q => !q.repeat && questEntries(i, q.id).some(e => e.status === 'approved')).length;
    return `<div class="card quest-track"><div class="card-head"><div><div class="card-title">${t.icon} ${esc(t.name)}</div><div class="card-sub">${d} of ${n} done${d === n ? ' · 🏅 ' + esc(t.badge) + ' badge!' : ''}</div></div></div>
      <div class="bar thin"><div class="bar-fill" style="width:${n ? d / n * 100 : 0}%"></div></div>
      <div class="list mt12">${qs.map(q => {
        const st = questState(i, q);
        return `<button class="quest q-${st}" data-act="quest-open" data-q="${q.id}" ${st === 'locked' ? 'aria-disabled="true"' : ''}>
          <span class="q-glyph">${glyph[st]}</span><span class="q-body"><span class="q-title">${esc(q.title)}</span>
          <span class="q-meta">${q.repeat ? '🔁 every week · ' : ''}~${q.mins} min${st === 'pending' ? ' · waiting for a parent' : st === 'retry' ? ' · try again' : st === 'locked' ? ' · finish the one above first' : ''}</span></span>
          <span class="pill ${st === 'done' ? 'green' : ''}">+${money(q.pay)}</span></button>`;
      }).join('')}</div></div>`;
  }).join('');
  const wins = (S.journal || []).filter(j => j.kid === i).slice(0, 5);
  return `<div class="split"><div class="col">
    <div class="hero learn-hero"><div class="hero-main"><span class="hero-tag">🧠 Skill Quests</span>
      <div class="hero-title">Level up your tech skills</div>
      <div class="hero-text">Real computer and AI skills you'll use for life. Every quest pays cash once a parent checks it.</div></div>
      ${ring(Math.round(done / oneTime * 100), done + ' of ' + oneTime + ' quests')}</div>
    <div class="card"><div class="card-title">⭐ Extra credit this week</div>
      <div class="card-sub">Quests and ⭐ extra chores share up to ${money(EXTRA_CAP)} a week.</div>
      <div class="bar"><div class="bar-fill" style="width:${Math.min(100, (p.extraChores + p.questMoney) / EXTRA_CAP * 100)}%"></div></div>
      <div class="bar-labels"><span>${money(p.extra)} earned</span><span>${capLeft ? money(capLeft) + ' left' : 'Maxed out! Quests still earn badges 🏅'}</span></div></div>
    ${badges.length ? `<div class="card"><div class="card-title">🏅 Badges</div><div class="badges mt12">${badges.map(t => `<span class="badge-chip">${t.icon} ${esc(t.badge)}</span>`).join('')}</div></div>` : ''}
    ${wins.length ? `<div class="card"><div class="card-title">📓 My wins</div><div class="card-sub">Your decisions and brave moments.</div><div class="list mt12">${wins.map(j => `<div class="win"><b>${esc(REFLECT[j.kind] ? REFLECT[j.kind].title : j.chore)}</b><span>${esc(Object.values(j.answers || {})[0] || '')}</span><span class="small muted">${new Date(j.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span></div>`).join('')}</div></div>` : ''}
  </div><div class="col">
    <div><div class="section-title">Quests</div><div class="section-sub">Tap one to see the steps. Finish a quest to unlock the next.</div></div>
    ${tracks}
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
  const quests = (S.questLog || []).filter(e => e.status === 'pending');
  const none = !chores.length && !acts.length && !reqs.length && !quests.length;
  return `<div class="split"><div class="col">
    <div><div class="section-title">Approvals</div><div class="section-sub">${none ? 'Nothing waiting on you.' : 'Check the work, then tap ✓ or ✗.'}</div></div>
    ${none ? '<div class="card empty"><span class="big">✨</span>All caught up!</div>' : ''}
    ${chores.length ? `<div class="list"><div class="card-head" style="margin:0"><div class="card-title">Chores <span class="muted small">(${chores.length})</span></div>
      ${chores.length > 1 ? `<button class="btn sm green" data-act="approve-all">✓ Approve all</button>` : ''}</div>${chores.map(c => choreRow(c, 'parent')).join('')}</div>` : ''}
    ${quests.length ? `<div class="list"><div class="card-title">🧠 Skill quests <span class="muted small">(${quests.length})</span></div>${quests.map(e => {
      const q = questById(e.qid) || { title: e.qid, ask: '' };
      return `<div class="chore prow ${KID_CLS[e.kid]}"><div class="ico bg-blue">${(QUEST_TRACKS.find(t => t.id === q.track) || {}).icon || '🧠'}</div>
      <div class="ci"><div class="cn">${esc(q.title)}</div><div class="cm"><span class="tag kid${e.kid}">${esc(S.names[e.kid])}</span><span>+${money(e.pay)} · ${hrsAgo(e.at)}</span></div>
        <div class="reflection"><div class="rq">${esc(q.ask)}</div><div class="ra">${esc(e.answer || '—')}</div></div></div>
      <div class="actions"><button class="ibtn ok" data-act="quest-ok" data-id="${e.id}" aria-label="Approve">✓</button><button class="ibtn no" data-act="quest-no" data-id="${e.id}" aria-label="Send back">✗</button></div></div>`;
    }).join('')}</div>` : ''}
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
    <div class="mini-stats"><div class="mini"><b>${p.approved}/${p.total}</b><span>chores</span></div><div class="mini"><b>${S.kids[i].points}</b><span>points</span></div><div class="mini"><b>${questDoneCount(i)}</b><span>quests</span></div><div class="mini"><b>${mins(s.left)}</b><span>screen left</span></div></div>
    ${penaltyNotice(i, true)}
    ${small ? '' : `<div class="lines">
      <div class="line"><span>Chores (${!p.total ? '—' : p.weighted ? money(p.val) + ' per 1×' : money(p.val) + ' each'})</span><span>${p.wiped ? '<s class="muted">' + money(p.choreBefore) + '</s> ' : ''}${money(p.choreEarned)}</span></div>
      <div class="line"><span>Extra credit${p.questMoney ? ' (incl. ' + money(p.questMoney) + ' quests)' : ''}</span><span class="plus">+${money(p.extra)}</span></div>
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
  const filters = [['all', 'All'], ['pending', 'Waiting'], ['notdone', 'Not done'], ['approved', 'Approved'], ['rejected', 'Sent back / missed'], ['k0', S.names[0]], ['k1', S.names[1]], ['shared', 'Shared']];
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
    ${overdueChores().length ? `<button class="btn block soft" data-act="miss-overdue">✗ Mark ${overdueChores().length} unchecked from earlier days as not finished</button>` : ''}
    <div class="chips">${filters.map(([k, l]) => `<button class="chip ${f === k ? 'active' : ''}" data-act="filter" data-f="${k}">${esc(l)}</button>`).join('')}</div>
    <div class="list">${list.length ? list.map(c => choreRow(c, 'parent')).join('') : '<div class="card empty"><span class="big">🧺</span>No chores here.</div>'}</div>
  </div></div>`;
}

function paysLabel(b) {
  return b.pays === 'points' ? '🌟 +' + (b.points || 10) + ' pts' : b.pays === 'extra' ? '⭐ +' + money(b.bonusDollars) : 'allowance' + (cw(b) > 1 ? ' · ×' + cw(b) + ' worth' : '');
}
const worthOpts = cur => [[1, '1× normal'], [2, '2× double'], [3, '3× triple']].map(([v, l]) => `<option value="${v}" ${Number(cur) === v ? 'selected' : ''}>${l}</option>`).join('');
function bankCard(kidOpts) {
  const baked = S.bank.filter(b => pinsFor(b).length);
  const row = (b, idx) => `<div class="bank-row">
      <div class="ico ${icoBg[hashIdx(b.name, icoBg.length)]}" style="width:42px;height:42px;font-size:1.3rem">${choreIcon(b.name)}</div>
      <div class="ci"><div class="cn" style="font-size:.98rem">${esc(b.name)}</div>
        <div class="cm"><span>${b.freq === 'daily' ? 'Daily' : b.freq === 'twice-weekly' ? '2×/wk' : 'Weekly'}</span><span class="dot">${paysLabel(b)}</span></div>
        ${b.reflect && REFLECT[b.reflect] ? `<div class="cm"><span class="tag reflect">📝 ${esc(REFLECT[b.reflect].title)} questions</span></div>` : ''}
        ${[['auto', '📌 School weeks'], ['autoBreak', '🎄 Break weeks']].map(([f, lbl]) => `<div class="bake ${S.breakMode === (f === 'autoBreak') ? 'live' : ''}"><span class="bake-lbl">${lbl}:</span>${[0, 1].map(k => `<button class="bake-chip k${k} ${(b[f] || []).includes(k) ? 'on' : ''}" data-act="bake" data-i="${idx}" data-k="${k}" data-f="${f}">${(b[f] || []).includes(k) ? '✓ ' : ''}${esc(S.names[k])}</button>`).join('')}</div>`).join('')}</div>
      <div class="actions"><select id="bankKid_${idx}" style="width:auto;padding:8px" aria-label="Add for">${kidOpts(0)}</select>
        <button class="ibtn ok" data-act="bank-add" data-i="${idx}">+ Add</button>
        <button class="ibtn" data-act="bank-edit" data-i="${idx}" aria-label="Edit">✏️</button>
        <button class="ibtn ghost" data-act="bank-del" data-i="${idx}" aria-label="Delete">🗑</button></div></div>`;
  const regular = S.bank.map((b, i) => [b, i]).filter(([b]) => b.pays !== 'points');
  const rare = S.bank.map((b, i) => [b, i]).filter(([b]) => b.pays === 'points');
  return `<div class="card"><div class="card-title">🏦 Chore bank</div>
    <div class="card-sub">📌 loads on school weeks, 🎄 on break weeks (Settings → Break mode). Right now: <b>${S.breakMode ? '🎄 break weeks' : '📌 school weeks'}</b>.</div>
    <div class="list mt12">${regular.length ? regular.map(([b, i]) => row(b, i)).join('') : '<div class="empty">Chores you add with “Save to bank” show up here.</div>'}</div>
    ${rare.length ? `<div class="card-title mt16">🌟 Rare chores <span class="muted small">(bonus points)</span></div><div class="list mt8">${rare.map(([b, i]) => row(b, i)).join('')}</div>` : ''}
    ${baked.length ? `<button class="btn block soft mt12" data-act="bake-load">${S.breakMode ? '🎄 Load break-week chores now' : '📌 Load school-week chores now'}</button>` : ''}
  </div>`;
}

function journalCard() {
  const js = (S.journal || []).slice(0, 8);
  return `<div class="card"><div class="card-title">📓 Decisions & brave moments</div><div class="card-sub">What the girls wrote on their Decision Cards and confidence chores.</div>
    <div class="list mt12">${js.length ? js.map(j => `<details class="jentry"><summary><span class="tag kid${j.kid}">${esc(S.names[j.kid])}</span> <b>${esc(REFLECT[j.kind] ? REFLECT[j.kind].title : j.chore)}</b> <span class="small muted">${new Date(j.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span></summary>${reflectionBlock(j.kind, j.answers)}</details>`).join('') : '<div class="empty">Nothing yet. Answers show up here once you approve a Decision Card, One brave thing, Kid in charge or Teach the family.</div>'}</div></div>`;
}

function parentFamilyView() {
  return `<div class="stack">
    <div class="card-head" style="margin:0"><div><div class="section-title">Family</div><div class="section-sub">Week of ${esc(S.week)} · total payout ${money(kidPayout(0) + kidPayout(1))}</div></div>
      <div class="btn-row"><button class="btn sm soft" data-act="grades-open">📚 Update grades</button><button class="btn sm danger" data-act="new-week">🔄 New week</button></div></div>
    <div class="split even">${kidSummaryCard(0, false)}${kidSummaryCard(1, false)}</div>
    <div class="split even">${teamCard(true)}
      ${journalCard()}
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

function breakCard() {
  const count = f => [0, 1].map(k => S.bank.filter(b => (b[f] || []).includes(k)).length);
  const sc = count('auto'), bc = count('autoBreak');
  return `<div class="card break-card ${S.breakMode ? 'on' : ''}"><div class="card-head"><div><div class="card-title">🎄 Break mode</div>
      <div class="card-sub">${S.breakMode ? 'On: New Week loads the 🎄 break-week chores.' : 'Off: New Week loads the 📌 school-week chores.'}</div></div>
      <button class="switch ${S.breakMode ? 'on' : ''}" data-act="break-toggle" role="switch" aria-checked="${S.breakMode}" aria-label="Break mode"><span></span></button></div>
    <div class="lines"><div class="line"><span>📌 School set</span><span>${esc(S.names[0])} ${sc[0]} · ${esc(S.names[1])} ${sc[1]}</span></div>
      <div class="line"><span>🎄 Break set</span><span>${esc(S.names[0])} ${bc[0]} · ${esc(S.names[1])} ${bc[1]}</span></div></div>
    <div class="small muted mt8">Pick which chores belong to each set in Chores → Chore bank.</div>
    <button class="btn block soft mt12" data-act="break-swap">${S.breakMode ? '🎄 Switch this week to break chores now' : '📌 Switch this week back to school chores now'}</button></div>`;
}

function parentSettingsView() {
  const g = S.teamGoal;
  if (pushState === 'checking') refreshPushState();
  return `<div class="split even"><div class="col">
    ${breakCard()}
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
    if (c.status === 'rejected' && c.missed) { toast('A parent marked this as missed — ask them if you can make it up'); return; }
    if (c.status === 'pending') { c.status = 'none'; c.submittedAt = null; log(S.names[me] + ' un-checked "' + c.name + '"'); commit('Undone — no worries'); return; }
    if (c.reflect && REFLECT[c.reflect]) { A['reflect-open']({ id }); return; }
    c.status = 'pending'; c.submittedAt = now(); c.by = me; markActive(me);
    log(S.names[me] + ' finished "' + c.name + '"');
    save(); render();
    const left = todayList(me).filter(x => !isDoneish(x)).length;
    if (left === 0 && todayList(me).length) { confetti(); toast("That's everything for today! 🎉"); }
    else toast('Nice! Sent to a parent for a ✓');
  },
  'reflect-open'({ id }) {
    const c = findChore(id); if (!c) return; const R = REFLECT[c.reflect]; editingId = id;
    const a = c.answers || {};
    openModal(`<div class="modal-title">${R.title}</div><div class="muted bold">${esc(R.intro)}</div>
      ${R.qs.map(([k, q, ph], n) => `<div class="field"><label for="rf_${k}">${n + 1}. ${esc(q)}</label><textarea id="rf_${k}" rows="2" maxlength="400" placeholder="${esc(ph)}">${esc(a[k] || '')}</textarea></div>`).join('')}
      <div class="modal-btns"><button class="btn white" data-act="modal-close">Not yet</button><button class="btn" data-act="reflect-send">Send to a parent</button></div>`);
    setTimeout(() => { const f = el('rf_' + R.qs[0][0]); if (f) f.focus(); }, 50);
  },
  'reflect-send'() {
    const c = findChore(editingId); if (!c) return closeModal();
    const R = REFLECT[c.reflect], ans = {};
    R.qs.forEach(([k]) => { ans[k] = (el('rf_' + k).value || '').trim(); });
    const blank = R.qs.filter(([k]) => ans[k].length < 2).length;
    if (blank) { toast('Answer all ' + R.qs.length + ' questions first'); return; }
    const me = isKid(ui.who) ? ui.who : (isKid(c.kid) ? c.kid : 0);
    c.answers = ans; c.status = 'pending'; c.submittedAt = now(); c.by = me; c.missed = false; markActive(me);
    log(S.names[me] + ' finished "' + c.name + '" (answered the questions)');
    closeModal(); save(); render(); confetti(); toast('Great thinking! Sent to a parent 💜');
  },

  'quest-open'({ q }) {
    const quest = questById(q); if (!quest) return;
    const i = isKid(ui.who) ? ui.who : 0, st = questState(i, quest);
    if (st === 'locked') { toast('Finish the quest above this one first 🔒'); return; }
    const es = questEntries(i, quest.id), last = es[es.length - 1];
    const track = QUEST_TRACKS.find(t => t.id === quest.track);
    editingId = quest.id;
    const body = st === 'pending'
      ? `<div class="banner" style="background:var(--amber-soft);color:var(--amber)">⏳ Sent! Waiting for a parent to check it.</div><div class="reflection"><div class="rq">${esc(quest.ask)}</div><div class="ra">${esc(last.answer)}</div></div>
         <div class="modal-btns"><button class="btn white" data-act="quest-cancel" data-id="${last.id}">Take it back</button><button class="btn" data-act="modal-close">OK</button></div>`
      : st === 'done'
      ? `<div class="banner" style="background:var(--green-soft);color:var(--green)">✓ Done${quest.repeat ? ' for this week. Come back next week!' : '! Nice work.'}</div>${last && last.answer ? `<div class="reflection"><div class="rq">${esc(quest.ask)}</div><div class="ra">${esc(last.answer)}</div></div>` : ''}
         <div class="modal-btns"><button class="btn" data-act="modal-close">Close</button></div>`
      : `${st === 'retry' && last.note ? `<div class="rej-note">💬 ${esc(last.note)}</div>` : ''}
         <ol class="steps">${quest.steps.map(x => `<li>${esc(x)}</li>`).join('')}</ol>
         <div class="field"><label for="qAns">✍️ ${esc(quest.ask)}</label><textarea id="qAns" rows="3" maxlength="600" placeholder="Write it in your own words">${st === 'retry' && last ? esc(last.answer) : ''}</textarea></div>
         <div class="modal-btns"><button class="btn white" data-act="modal-close">Later</button><button class="btn" data-act="quest-send">Send to a parent · +${money(quest.pay)}</button></div>`;
    openModal(`<div class="modal-title">${track ? track.icon : '🧠'} ${esc(quest.title)}</div>
      <div class="muted bold">${esc(track ? track.name : '')} · about ${quest.mins} min · +${money(quest.pay)}${quest.repeat ? ' each week' : ''}</div>${body}`);
  },
  'quest-send'() {
    const quest = questById(editingId); if (!quest) return closeModal();
    const answer = (el('qAns').value || '').trim();
    if (answer.length < 8) { toast('Write a little more so a parent can see what you learned'); return; }
    const i = isKid(ui.who) ? ui.who : 0;
    S.questLog.push({ id: uid(), qid: quest.id, kid: i, status: 'pending', answer, pay: quest.pay, at: now() });
    markActive(i); log(S.names[i] + ' finished quest "' + quest.title + '"');
    closeModal(); save(); render(); confetti(); toast('Quest sent to a parent 🧠');
  },
  'quest-cancel'({ id }) { S.questLog = S.questLog.filter(e => e.id !== id); closeModal(); commit('Taken back'); },
  'quest-ok'({ id }) {
    const e = S.questLog.find(x => x.id === id); if (!e) return;
    const q = questById(e.qid) || { title: e.qid };
    const before = payoutParts(e.kid);
    e.status = 'approved'; e.decidedAt = now(); e.week = S.week; e.note = '';
    S.kids[e.kid].xp = (S.kids[e.kid].xp || 0) + 1;
    S.teamPoints = (S.teamPoints || 0) + TEAM_PTS_PER_CHORE;
    const added = payoutParts(e.kid).extra - before.extra;
    log('Approved quest "' + q.title + '" for ' + S.names[e.kid]);
    confetti(); commit(added > 0 ? '+' + money(added) + ' for ' + S.names[e.kid] : 'Approved ✓ ($' + EXTRA_CAP + ' extra-credit cap reached)');
  },
  'quest-no'({ id }) {
    const e = S.questLog.find(x => x.id === id); if (!e) return; editingId = id;
    const q = questById(e.qid) || { title: e.qid };
    openModal(`<div class="modal-title">↺ Send back “${esc(q.title)}”</div>
      <div class="field"><label for="qNote">What should ${esc(S.names[e.kid])} fix? (she'll see this)</label><input id="qNote" type="text" maxlength="140" placeholder="e.g. Show me the folders before you send it"></div>
      <div class="modal-btns"><button class="btn white" data-act="modal-close">Cancel</button><button class="btn danger" data-act="quest-no-save">Send back</button></div>`);
  },
  'quest-no-save'() {
    const e = S.questLog.find(x => x.id === editingId); if (!e) return closeModal();
    e.status = 'rejected'; e.decidedAt = now(); e.note = el('qNote').value.trim();
    log('Sent back quest "' + ((questById(e.qid) || {}).title || e.qid) + '"'); closeModal(); commit('Sent back to try again');
  },

  'break-toggle'() {
    S.breakMode = !S.breakMode;
    log('Break mode ' + (S.breakMode ? 'on' : 'off'));
    save(); render();
    toast(S.breakMode ? '🎄 Break mode on: New Week loads break chores' : '📌 Break mode off: New Week loads school chores', 'Switch this week now', () => A['break-swap']());
  },
  'break-swap'() {
    const f = pinField(), label = S.breakMode ? 'break' : 'school';
    const keep = (c) => isKid(c.kid) && S.bank.some(b => b.name.toLowerCase() === c.baseName.toLowerCase() && (b[f] || []).includes(c.kid));
    const drop = S.chores.filter(c => c.recurring && c.status === 'none' && !keep(c));
    const after = S.chores.filter(c => !drop.includes(c));
    const add = [];
    S.bank.forEach(b => (b[f] || []).forEach(k => { if (!after.some(c => c.kid === k && c.baseName.toLowerCase() === b.name.toLowerCase())) add.push({ b, k }); }));
    if (!drop.length && !add.length) { toast('This week already has the ' + label + ' chores'); return; }
    const names = [...new Set(drop.map(c => c.baseName))];
    confirmModal('Switch this week to ' + label + ' chores?',
      (names.length ? 'Removes unchecked: ' + names.join(', ') + '. ' : '') + (add.length ? 'Adds: ' + [...new Set(add.map(x => x.b.name))].join(', ') + '. ' : '') + 'Anything already checked off stays.', 'Switch', () => {
      undoable('Switched this week to ' + label + ' chores', () => {
        S.chores = S.chores.filter(c => !drop.includes(c));
        add.forEach(x => expandChore({ ...x.b, kid: x.k, recurring: true }));
        log('Switched this week to ' + label + ' chores');
      });
    });
  },
  approve({ id }) { const c = findChore(id); if (!c) return; approveChore(c); confetti(); commit('Approved ✓'); },
  reject({ id }) {
    const c = findChore(id); if (!c) return;
    c.status = 'rejected'; c.missed = false; c.note = ''; c.rejectedAt = now();
    log('Sent back "' + c.name + '"'); save(); render();
    toast('Sent back to try again', 'Add reason', () => A['note-open']({ id }));
  },
  miss({ id }) {
    const c = findChore(id); if (!c) return;
    c.status = 'rejected'; c.missed = true; c.note = ''; c.rejectedAt = now(); c.submittedAt = null;
    log('Marked "' + c.name + '" not finished'); save(); render();
    toast('Marked not finished', 'Add reason', () => A['note-open']({ id }));
  },
  'mark-done'({ id }) {
    const c = findChore(id); if (!c) return;
    if (!isKid(c.by)) c.by = isKid(c.kid) ? c.kid : undefined;
    c.submittedAt = c.submittedAt || now(); approveChore(c);
    log('Parent marked "' + c.name + '" done'); commit('Marked done ✓');
  },
  'miss-overdue'() {
    const list = overdueChores();
    if (!list.length) return toast('Nothing overdue');
    confirmModal('Mark ' + list.length + ' as not finished?', 'These daily chores from earlier days were never checked off: ' + [...new Set(list.map(c => c.baseName + ' (' + kidName(c.kid) + ')'))].join(', ') + '. They\'ll lose their share of the allowance. You can undo any one with ↺.', 'Mark not finished', () => {
      const t = now(); list.forEach(c => { c.status = 'rejected'; c.missed = true; c.note = ''; c.rejectedAt = t; });
      log('Marked ' + list.length + ' overdue chores not finished');
      save(); render();
      toast(list.length + ' marked not finished', 'Undo', () => { list.forEach(c => { c.status = 'none'; c.missed = false; c.rejectedAt = null; }); commit('Undone'); });
    }, true);
  },
  'note-open'({ id }) {
    const c = findChore(id); if (!c) return; editingId = id;
    openModal(`<div class="modal-title">💬 Note for ${esc(kidName(c.kid))}</div>
      <div class="muted bold">${esc(c.name)} · ${c.missed ? 'marked not finished' : 'sent back to try again'}</div>
      <div class="field"><label for="rejNote">What she'll see</label><input id="rejNote" type="text" maxlength="120" value="${esc(c.note || '')}" placeholder="${c.missed ? 'e.g. Bed wasn\'t made before school' : 'e.g. Clothes still on the floor'}"></div>
      <div class="modal-btns"><button class="btn white" data-act="modal-close">Cancel</button><button class="btn" data-act="note-save">Save note</button></div>`);
    setTimeout(() => el('rejNote') && el('rejNote').focus(), 50);
  },
  'note-save'() {
    const c = findChore(editingId); if (!c) return closeModal();
    c.note = el('rejNote').value.trim(); closeModal(); commit(c.note ? 'Note added' : 'Note removed');
  },
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
    S.journal = (S.journal || []).filter(j => j.choreId !== c.id);
    c.status = 'none'; c.submittedAt = null; c.approvedAt = null; c.missed = false; c.note = ''; commit('Reset to not done');
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
      if (existing) { const f = pinField(); if (bake && !(existing[f] || (existing[f] = [])).includes(kid)) existing[f].push(kid); }
      else S.bank.push({ name, freq: def.freq, pays, extra: pays === 'extra', bonusDollars: def.bonusDollars, points: def.points, weight, dod: def.dod, recurring: bake, auto: bake && !S.breakMode ? [kid] : [], autoBreak: bake && S.breakMode ? [kid] : [], reflect: '' });
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
  bake({ i, k, f }) {
    const b = S.bank[Number(i)]; if (!b) return; k = Number(k); f = f === 'autoBreak' ? 'autoBreak' : 'auto';
    const cur = b[f] || [];
    b[f] = cur.includes(k) ? cur.filter(x => x !== k) : [...cur, k].sort();
    b.recurring = (b.auto || []).length > 0 || (b.autoBreak || []).length > 0;
    const set = f === 'autoBreak' ? '🎄 break weeks' : '📌 school weeks';
    commit(b[f].includes(k) ? b.name + ' on ' + set + ' for ' + S.names[k] : b.name + ' off ' + set + ' for ' + S.names[k]);
  },
  'bake-load'() {
    const missing = bakedMissing();
    if (!missing.length) { toast((S.breakMode ? 'Break-week' : 'School-week') + ' chores are already on this week'); return; }
    confirmModal(S.breakMode ? 'Load break-week chores?' : 'Load school-week chores?', 'Adds ' + missing.length + ' pinned chore' + (missing.length > 1 ? 's' : '') + ' that aren\'t on this week yet: ' + missing.map(m => m.b.name + ' (' + S.names[m.k] + ')').join(', ') + '.', 'Load', () => {
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
      <div class="field"><label>Questions she answers when she checks it off</label><select id="bReflect"><option value="">None</option>${REFLECT_KEYS.map(k => `<option value="${k}" ${b.reflect === k ? 'selected' : ''}>${REFLECT[k].title}</option>`).join('')}</select></div>
      <div class="small muted bold">Changes apply next time it's added. Chores already on this week stay as they are.</div>
      <div class="modal-btns"><button class="btn white" data-act="modal-close">Cancel</button><button class="btn" data-act="bank-save">Save</button></div>`);
  },
  'bank-save'() {
    const b = S.bank[editingBank]; if (!b) return closeModal();
    const name = el('bName').value.trim(); if (!name) return;
    const pays = el('bPays').value, amt = parseFloat(el('bAmt').value) || 0;
    Object.assign(b, { name, dod: el('bDod').value.trim(), freq: el('bFreq').value, pays, extra: pays === 'extra',
      bonusDollars: pays === 'extra' ? (amt || 1) : 0, points: pays === 'points' ? Math.round(amt || 10) : 0,
      weight: pays === 'allowance' ? Number(el('bWeight').value) || 1 : 1, reflect: el('bReflect').value });
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
    requirePin(() => confirmModal('Start a new week?', 'Clears this week\'s chores and any disrespect penalty, resets points, screen time and the team goal, makes current grades the new baseline, and loads the ' + (S.breakMode ? '🎄 break-week' : '📌 school-week') + ' chores. You\'ll have 30 seconds to undo.' + (S.breakMode ? ' (Break mode is ON. Turn it off in Settings when school starts.)' : ''), 'Start new week', () => {
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
      let n = 0; S.bank.forEach(b => pinsFor(b).forEach(k => { n += expandChore({ ...b, kid: k, recurring: true }); }));
      log('New ' + (S.breakMode ? 'break ' : '') + 'week started' + (n ? ' — ' + n + ' chores loaded' : ''));
      save(); render();
      toast(n ? 'New ' + (S.breakMode ? 'break ' : '') + 'week — ' + n + ' chores loaded' : 'New week started — add chores from the bank', 'Undo', () => { S = normalize(JSON.parse(snap)); save(); render(); toast('New week undone'); }, 30000);
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
  S.bank.forEach(b => pinsFor(b).forEach(k => { if (!S.chores.some(c => c.kid === k && c.baseName.toLowerCase() === b.name.toLowerCase())) out.push({ b, k }); }));
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
