# Feature: Sidebar Redesign

## What
Redesign the left sidebar to be more visual, compact, and modern while keeping
the same navigation structure.

## Current Issues
- Nav items are plain text with a dot — minimal visual hierarchy
- No active section indicator beyond color
- Logo area is small
- Sidebar stats (win rate / total R) feel disconnected from nav

## Proposed Design

### Visual changes
- **Logo area**: Larger EDGE mark with a subtle gradient or glow, tagline below
- **Nav sections**: Section labels get a left-border accent line, bolder + spaced
- **Nav items**: Add a filled pill/highlight on active item (full-width background),
  icons via Unicode or simple SVG (📊 💹 📋 etc.) — optional, keep it clean
- **Active state**: Solid left border + background tint (currently just color change)
- **Sidebar stats**: Move to a card-style box at the bottom, add a mini sparkline bar
  showing last 5 trade outcomes (W W L W W)
- **Collapse button** (desktop only): Arrow to collapse sidebar to icon-only mode (60px)
  — saves screen space when backtesting

### Spacing
- Increase nav-item height from implicit to explicit `44px`
- Add `2px` gap between nav items for breathing room
- Nav section labels: `10px` top margin, slightly larger letter-spacing

### Mobile
No change to mobile behaviour — hamburger slide-in stays as-is.

### Files
- `styles.css`: `.sidebar`, `.nav-item`, `.nav-section`, `.logo`, `.sidebar-stats`
- `index.html`: Possibly add icons or reorder sidebar-stats markup

## Owner: Claude (Sprint 2)
## Design pass: do this after all logic features are stable
