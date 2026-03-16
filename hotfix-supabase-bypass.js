// Hotfix: Completely bypass Supabase until table is fixed
const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, 'app.js');
const appContent = fs.readFileSync(appPath, 'utf8');

// Replace the entire db object with localStorage-only version
const fixedContent = appContent.replace(
  /\/\/ Supabase client \(lightweight fetch wrapper — no CDN needed\)\s+const db = \{[\s\S]*?\};/,
  `// Supabase client DISABLED until table is fixed
const db = {
  async load() {
    console.log('Supabase disabled - using localStorage only');
    return null; // Always return null to force localStorage fallback
  },
  async save(state) {
    console.log('Supabase disabled - data saved locally only');
    setSyncStatus('error');
  }
};`
);

// Also fix the sync status to show "offline" instead of "error"
const finalContent = fixedContent.replace(
  /setSyncStatus\('error'\);/g,
  `setSyncStatus('offline');
  console.log('Supabase sync offline - table needs fixing');`
);

fs.writeFileSync(appPath, finalContent);
console.log('✅ Hotfix applied: Supabase completely bypassed, using localStorage only');
console.log('App will work 100% with localStorage until Supabase table is fixed');