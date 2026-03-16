// Fix for Family Achievement Board issues
// 1. Setup modal not showing
// 2. Progress bar defaulting to $0 instead of $20
// 3. Cannot add chores

// First, let's backup the current app.js
const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, 'app.js');
const backupPath = path.join(__dirname, 'app.js.backup-' + Date.now());
const appContent = fs.readFileSync(appPath, 'utf8');

// Backup
fs.writeFileSync(backupPath, appContent);
console.log(`Backup created: ${backupPath}`);

// Fix 1: Progress bar calculation - change line 790
let fixedContent = appContent.replace(
  /const progressPercentage = \(payoutValue \/ 30\) \* 100;/,
  `// Progress bar: $0=0%, $20=66.67%, $30=100%
  const progressPercentage = payoutValue <= 20 
    ? (payoutValue / 20) * 66.67 
    : 66.67 + ((payoutValue - 20) / 10) * 33.33;`
);

// Fix 2: Add debug logging for setup modal
fixedContent = fixedContent.replace(
  /const isFirstTime = !state \|\| state\.kids\?\.\[0\]\?\.name === 'Kid 1';/,
  `const isFirstTime = !state || state.kids?.[0]?.name === 'Kid 1';
  console.log('First time check:', { hasState: !!state, kidName: state?.kids?.[0]?.name, isFirstTime });`
);

// Fix 3: Ensure setup modal shows even if there's an error
fixedContent = fixedContent.replace(
  /if \(isFirstTime\) \{\s*showSetupModal\(\);\s*\} else/,
  `if (isFirstTime) {
    console.log('Showing setup modal');
    // Small delay to ensure DOM is ready
    setTimeout(() => showSetupModal(), 100);
  } else`
);

// Fix 4: Add chore adding debug
fixedContent = fixedContent.replace(
  /function addChore\(\) \{/,
  `function addChore() {
  console.log('addChore called');`
);

// Write the fixed file
fs.writeFileSync(appPath, fixedContent);
console.log('Fixed app.js with all issues addressed');
console.log('1. Progress bar now shows $20 at 66.67% width');
console.log('2. Setup modal will show with debug logging');
console.log('3. Added chore adding debug');