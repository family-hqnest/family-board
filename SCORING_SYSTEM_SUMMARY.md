# Family Achievement Board - Scoring System v5

## Complete System Specification

### Financial Parameters
- **Base/Starting amount:** $20 per kid per week
- **Floor:** $0 (minimum after penalties)
- **Ceiling:** $30 (maximum with bonuses)
- **Weekly goal:** 100 points (increased from 50)
- **Point value:** $0.20 per point ($20 ÷ 100)
- **Grade bonus:** $2.50 per improved subject

### Chore System
1. **Frequency Options:**
   - Daily (7 instances per week)
   - Twice weekly (2 instances per week)
   - Weekly (1 instance per week)

2. **Point Distribution:**
   - Points are divided equally among instances
   - Example: 20-point chore, twice weekly = 10 points per instance

3. **Status Flow:**
   - Pending → Done (by kid) → Approved/Rejected (by parent)
   - Auto-approve: 48 hours after kid marks "done"

4. **Extra Credit:**
   - Parent can add bonus points when approving
   - Checkbox + points input
   - Bonus = extra points × $0.20

5. **Penalty System:**
   - Rejected chore penalty = Points × $0.20
   - Points = chore points ÷ instances (for frequency chores)
   - Penalties deducted from $20 base

### Grade System
1. **Positive Changes Only:**
   - $2.50 per improved subject
   - No penalty for same or lower grades
   - Max bonus: 4 subjects × $2.50 = $10.00

2. **Grade Point Values:**
   - F = 0, D = 1, C = 2, B = 3, A = 4
   - Improvement = New points - Old points
   - Bonus only if Improvement > 0

### Payout Calculation
1. **Starting Point:** $20 base
2. **Add Bonuses:**
   - Chore bonus based on approved points ratio
   - Grade bonus ($2.50 per improved subject)
   - Extra credit bonus
3. **Subtract Penalties:**
   - Rejected points × $0.20
4. **Apply Limits:**
   - Floor: $0 minimum
   - Ceiling: $30 maximum

### Example Scenarios

#### Scenario 1: Perfect Week
- All chores approved (100+ points)
- All grades improved (4 subjects)
- Extra credit: +10 points ($2.00)
- **Payout:** $20 + $10 (chores) + $10 (grades) + $2 (extra) = $42 → capped at $30

#### Scenario 2: Average Week
- 75 points approved ($15 chore bonus)
- 2 subjects improved ($5 grade bonus)
- No extra credit
- **Payout:** $20 + $15 + $5 = $40 → capped at $30

#### Scenario 3: Poor Week
- 25 points approved ($5 chore bonus)
- No grade improvement
- 2 chores rejected (10 points × $0.20 = $2 penalty)
- **Payout:** $20 + $5 - $2 = $23

#### Scenario 4: Very Poor Week
- No chores approved
- No grade improvement
- 5 chores rejected (50 points × $0.20 = $10 penalty)
- **Payout:** $20 - $10 = $10

### Technical Implementation

#### Files Modified:
1. **app.js** - Complete scoring logic overhaul
2. **index.html** - Added frequency dropdown, updated progress bars
3. **sw.js** - Updated cache version to v5
4. **SCORING_SYSTEM_SUMMARY.md** - This documentation

#### Key Functions:
1. `calculatePayout()` - New payout calculation with bonuses/penalties
2. `calculateGradeBonus()` - $2.50 per improved subject
3. `calculateChorePoints()` - Handles frequency chore point calculation
4. `executePinAction()` - Updated with extra credit prompt

#### Data Migration:
- Version: v4 → v5
- Added: `pointValue`, `gradeBonusPerSubject`, `frequency`, `instances`, `extra`
- Updated: `base` (0→20), `weekGoal` (50→100)
- Removed: `rate`, `penalty`

### Testing
The system has been tested with:
- Config defaults verification
- Grade bonus calculation
- Chore points calculation with frequency
- Edge cases (floor/ceiling enforcement)

### Deployment
- Committed to GitHub: `family-hqnest/family-board`
- Cache version: `famboard-cache-v5`
- Storage key: `famboard-v5`
- Auto-deploy via Cloudflare Pages

### User Instructions
1. **Clear localStorage** to see new setup modal
2. **Setup defaults:** 100 points weekly goal, $30 max payout
3. **Create chores:** Select frequency (daily/twice weekly/weekly)
4. **Approve chores:** Add extra credit if desired
5. **Update grades:** Only improvements increase payout
6. **Monitor progress:** Progress bars show $0-$30 range

The system encourages:
- Consistent chore completion (maintain $20 base)
- Academic improvement ($2.50 per subject)
- Extra effort (bonus points)
- Accountability (penalties for rejected chores)