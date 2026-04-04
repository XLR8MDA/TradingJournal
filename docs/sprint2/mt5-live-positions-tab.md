# Feature: MT5 Live Positions View (Tab B)

## What
Replace the static setup guide in Tab B with a live positions table that polls
the Apps Script backend for the latest open positions pushed by the MT5 EA.

## UI Layout
```
[ Connection: ● Live — last sync 14s ago ]    [ Refresh ]

┌─────────────────────────────────────────────────────┐
│ Symbol  Direction  Entry     Current   P&L    SL/TP  │
│ XAUUSD  Long       2318.40   2321.80  +3.4R  2310/2340│
│ EURUSD  Short      1.0842    1.0831   +1.1R  1.0870/1.0800│
└─────────────────────────────────────────────────────┘

[ Alert: SL moved on XAUUSD ticket #12345 ]  ← amber banner if detected
```

## Implementation Plan

### app.js
- `pollMt5Positions()` — calls `fetchSyncedData()`, filters for `eventType === 'OPEN'`
  trades with no matching CLOSE, renders the table
- Auto-poll every 30s when Tab B is active (use `setInterval`, clear on tab switch)
- `startMt5Poll()` / `stopMt5Poll()` — called from `switchTab()`
- SL-move detection: compare current SL in latest record vs original SL at open

### index.html
- Replace static setup card with dynamic positions table `<div id="mt5-positions">`
- Keep setup instructions in a collapsible "Setup Guide" section
- Add amber alert strip `<div id="mt5-alerts">` for SL-move warnings

### Prerequisite
Apps Script deployment must be fixed (see `fix-apps-script-deployment.md`) before this
feature is useful.

## Owner: Claude (Sprint 2)
