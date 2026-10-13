# Chore Club

Family chores, allowance, bonus points and rewards for Sofia & Juliana.
Live at **https://family.hqnest.com** (Cloudflare Pages — every push to `main` deploys automatically).

## How it works
- **Kids** pick their name under *Who's here?* and tap the circle when a chore is done. Tap again to undo.
- **Parent** taps 🔒 Parent and enters the PIN to approve chores, bonus activities and reward requests, add chores, update grades and start a new week.
- **Allowance:** $20 base split across each girl's chores. A chore sent back to try again loses its share. Extra-credit chores add up to +$5; each improved grade adds $1.25 (up to +$5). Max $30.
- **Points:** bonus activities earn points to spend on rewards. Screen-time rewards add minutes automatically. Points reset each new week.
- **Team goal:** every approved chore adds 10 points, and bonus activities add their points, toward a shared family reward.

## Files
- `index.html` — shell · `style.css` — design · `app.js` — everything else · `sw.js` — offline support

## Data
Stored in Supabase (`board_state` table, row `family`) and cached on each device.
A copy taken before the Oct 2026 rebuild is in row `backup-2026-10-13`.
Free Supabase projects pause after 7 days without use — opening the app counts as use.
