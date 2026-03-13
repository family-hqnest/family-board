# Family Achievement Board PWA

A progressive web app for tracking family achievements, chores, grades, and payouts. Works completely offline with local encryption.

## Features

### ✅ Complete Implementation

1. **Full UI Sections**
   - Kid cards with individual colors
   - Chore lists with filtering
   - Grade modal for weekly grades
   - Calculator drawer for weighted grades
   - Settings modal with encryption
   - Display mode (fullscreen, clock, cursor hide)

2. **Complete CSS Design**
   - Design tokens (--bg, --card, --k1, --k2, etc.)
   - All required animations:
     - Confetti celebration
     - Scanline effects
     - Glowing borders
     - Smooth transitions

3. **Full JavaScript Implementation**
   - Data model with load/save (SYNC POINT comments)
   - Chore system:
     - Status flow (pending → completed → approved/rejected)
     - 48h auto-approve
     - PIN gate for parent approval
     - Recurring chore logic
   - Payout formula with breakdown
   - Grade system with history
   - Grade calculator with weighted logic
   - Sparkline SVG visualization
   - AES-GCM export/import encryption
   - Display mode controls
   - New week auto-reset
   - Service worker caching

4. **Offline-First**
   - No external network calls
   - All fonts local (Righteous, DM Sans)
   - Service worker caches all assets
   - Works completely offline

5. **Security**
   - Parent PIN protection
   - AES-GCM encryption for exports
   - Local storage only (no cloud dependency)
   - No external CDNs

## File Structure

```
family-board/
├── index.html          # Main app HTML
├── style.css           # Complete CSS with animations
├── app.js              # Full JavaScript implementation
├── sw.js              # Service worker with caching
├── manifest.json       # PWA manifest
├── README.md          # This file
├── test.html          # Test suite
├── fonts/             # Local fonts
│   ├── Righteous-Regular.ttf
│   ├── DMSans-VariableFont_opsz,wght.ttf
│   └── DMSans-Italic-VariableFont_opsz,wght.ttf
└── icons/             # App icons
    ├── icon-192.png
    └── icon-512.png
```

## Quick Start

1. **Open the app**: Simply open `index.html` in a modern browser
2. **Install as PWA**: Click "Add to Home Screen" when prompted
3. **Test**: Open `test.html` to verify all features work

## Core Features in Detail

### Chore Management
- Add chores with points and assign to kids
- Mark as completed → pending approval
- Auto-approve after 48 hours
- Parent PIN required for manual approval/rejection
- Filter by status or kid
- Pin important chores

### Grade System
- Set weekly letter grades (A-F)
- Grade bonus contributes to payout
- Weighted grade calculator for Kid1
- Sparkline visualization of grade history
- Category-based scoring (Homework, Quizzes, Tests, Participation)

### Payout Calculation
```
Weekly Payout = 
  Base ($20) +
  (Approved chores × $2.5) +
  Grade bonus (A=$10, B=$7, C=$4, D=$1, F=$0) -
  (Rejected chores × $1)
```

### Data Management
- **Auto-save**: All changes saved to localStorage
- **Export**: Encrypted backup with passphrase (AES-GCM)
- **Import**: Restore from encrypted backup
- **Clear**: Reset all data with confirmation
- **New Week**: Auto-reset chores (keeps recurring)

### Display Mode
- Fullscreen kiosk mode
- Hides cursor after inactivity
- Removes interactive elements
- Perfect for wall-mounted displays

## Testing

Run the test suite (`test.html`) to verify:
- File structure
- CSS loading
- JavaScript functionality
- Local storage
- Service worker
- Encryption capabilities

## Browser Support

- Chrome 80+ (recommended)
- Firefox 75+
- Safari 14+
- Edge 80+

Requires modern JavaScript features:
- ES2020 modules
- Web Crypto API
- Service Workers
- CSS Custom Properties

## Development Notes

### SYNC POINTS
The JavaScript includes clear SYNC POINT comments marking:
- `load()` - Load from localStorage
- `save()` - Save to localStorage
- Default state structure

### Security
- Default parent PIN: `1234` (change in settings)
- Export uses AES-GCM with PBKDF2 key derivation
- No data leaves the browser without explicit export

### Performance
- Lazy rendering where possible
- Debounced saves
- Efficient DOM updates
- Service worker caches all assets

## License

For personal/family use. Not for commercial distribution.