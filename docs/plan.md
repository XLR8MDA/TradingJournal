# EDGE Trading Journal — Build Plan

## GitHub Repo
`https://github.com/XLR8MDA/TradingJournal.git`

---

## New Navigation Structure

```
Sidebar
├── Dashboard               ← live portfolio overview (stats, equity curve)
├── ── BACKTEST ──
├── Backtest Hub            ← start here, pick a pair, AI loads automatically
├── Gold Performance        ← auto-populated from backtest sessions
├── BTC Performance         ← auto-populated from backtest sessions
├── EUR/USD Performance     ← auto-populated from backtest sessions
├── ── LIVE TRADING ──
├── Trade Now               ← AI pre-trade checker + (later) broker connection
├── Trade Log               ← log a completed trade
├── Live History            ← all live trades, stats, export
├── ── STRATEGY ──
├── Checklist               ← 16-point interactive reference
├── Exit Rules
├── LTF Entry
├── Patterns
├── Simulator
├── ── MINDSET ──
├── Mistakes
├── Phases
├── Routine
└── Mindset
```

---

## Backtest Hub — Flow

### Entry screen
- Header: "Backtest Session"
- Three pair cards: **XAU/USD · BTC/USD · EUR/USD** — click one to begin
- Each card shows current stats for that pair (sessions done, win rate, AI accuracy)

### Inside a backtest session (e.g. Gold)
1. AI panel opens on the right — pre-loaded with EDGE rules, ready
2. User uploads a chart screenshot (drag & drop)
3. **User records their verdict first**: Valid / Invalid / Score (forces you to think before AI answers)
4. AI evaluates: walks through all 4 phases of the checklist, gives verdict + reasoning
5. Side-by-side shown: **Your call vs AI call**
6. User marks final outcome (if known): Win / Loss / Partial / Skip
7. Setup is saved → auto-populates that pair's Performance page
8. "Next setup" → repeat
9. After every 5 setups: AI gives a coaching summary — what you're getting right, what you keep missing

### What gets saved per backtest setup
```
Pair | Date | Screenshot (Drive URL) | Your Score | AI Score |
Your Verdict | AI Verdict | Final Outcome | AI Coaching Note
```

---

## Per-Pair Performance Pages (Gold / BTC / EURUSD)

Each page shows stats from **backtest sessions only** for that pair:
- Total setups reviewed, valid setups, win rate
- Avg R:R, total R
- Your score vs AI score over time (line chart) — tracks your improvement
- Pattern breakdown — which patterns you identify correctly vs miss
- Phase-by-phase accuracy — are you failing on Location? Hunt? Pattern? Session?
- Session filter (London / NY / Asian)
- Full table of all reviewed setups with screenshots linked

> These pages replace the current static Gold/BTC/EURUSD backtest pages.
> Old hardcoded setups (Mar 2026) are kept as seed data — importable as pre-logged setups.

---

## Trade Now — Live AI Panel

### Two sub-modes (tabs inside the page)

#### Tab A — Screenshot Analysis (MVP)
1. User uploads a screenshot of their live chart
2. Selects: Pair / Session / Direction they're considering
3. AI runs the full 16-point checklist against the chart
4. Hard gate failure → **STOP banner**: "Do not enter. Phase 2 gate not met — no confirmed stop hunt."
5. Score ≥12, all gates pass → **GO banner** with: SL suggestion, R:R estimate, confidence level
6. User can chat: "What if the wick is only 8 pips?" — AI responds contextually
7. One-click: push this trade to Trade Log with AI fields pre-filled

#### Tab B — Exness / MT5 Live Monitor (Post-MVP)
- Platform: **Exness (MT5)**
- Approach: MT5 Expert Advisor (EA) pushes trade events to the journal via HTTP
- EA sends: open price, SL, TP, pair, direction → AI checks against EDGE rules in real time
- AI alerts if SL is moved, if trade opened without checklist score, or if daily loss limit hit
- This is a future feature — placeholder tab in UI now, EA script built later

---

## Dashboard — Dual View

Toggle: **[ Live Portfolio ] [ Combined ]**

Live Portfolio shows:
- Win rate, Avg R:R, Total R, Profit factor (live trades only)
- Equity curve — cumulative R over time (Chart.js)
- Monthly P&L bar chart
- Instrument breakdown
- Session performance
- AI score vs outcome correlation

Backtest stats live on the per-pair pages — not mixed into the dashboard.

---

## Storage — Google Drive + Sheets

### Why this combo
- **Sheets** = all trade + backtest data (queryable, chartable, exportable)
- **Drive** = screenshots stored in `/EDGE/screenshots/` (you have the storage)
- One Apps Script handles both: upload image to Drive → get URL → append row to Sheet
- Sheet has a clickable screenshot column — open any trade, see the chart

### Single Apps Script web app handles:
1. `POST /logTrade` — append row to Sheets + upload screenshot to Drive
2. `GET /getTrades` — fetch all trades back (for cross-device sync)

### Two sheets in one workbook
- Sheet 1: `live_trades` — all Trade Now entries
- Sheet 2: `backtest_sessions` — all Backtest Hub entries

### Trade row schema
```
ID | Date | Mode | Pair | Direction | Entry | SL | TP | Pattern | Hunt |
Outcome | Score | R:R | Session | Notes | Screenshot_URL | AI_Score | AI_Verdict
```

### Setup (one-time, ~5 min)
1. Create a Google Sheet (two tabs: live_trades, backtest_sessions)
2. Create Drive folder: `EDGE/screenshots/`
3. Apps Script → deploy as web app → copy URL
4. Paste URL in journal Settings

---

## Groq AI — Shared Engine, Two Contexts

> Model: `meta-llama/llama-4-maverick-17b-128e-instruct-fp8` (vision, free on Groq)
> API key: user enters once in Settings → stored in localStorage

### Backtest context prompt
Knows it's in coaching mode. Asks user for their call first. Gives detailed phase-by-phase breakdown. Tracks session history to build coaching summaries.

### Live trade context prompt
Knows it's a pre-trade check. Decisive. Either blocks or clears. No ambiguity. Gives exact SL/R:R numbers. Conversational follow-up allowed.

---

## Build Phases

| # | Phase | What gets built |
|---|-------|-----------------|
| 1 | File split | `index.html` + `styles.css` + `app.js` — no logic changes |
| 2 | Nav restructure | New sidebar structure, new section routing |
| 3 | Backtest Hub | Pair selection, session flow, AI coaching loop |
| 4 | Per-pair performance pages | Auto-populated stats + charts from backtest data |
| 5 | Trade Now panel | Screenshot upload + AI pre-trade checker (Tab A) |
| 6 | Dashboard overhaul | Live portfolio stats + Chart.js equity curve |
| 7 | Drive + Sheets sync | Apps Script, screenshot upload, dual sheet |
| 8 | Deploy | GitHub push → Netlify |

---

## Design — Working Model First
Build all logic first. Design pass after.
Ideas to apply in design pass:
- AI panel as a right-side drawer (doesn't break current layout)
- Pair cards on Backtest Hub with live win rate badges
- GO / STOP verdict banners (prominent, unmissable)
- Screenshot thumbnail in every trade row
- Equity curve as hero element on Dashboard

---

## Open Items
- [x] Live platform: **Exness (MT5)** — Tab B will use MT5 EA → HTTP push to journal
- [x] Old Mar 2026 backtest data — **wiped, starting fresh**
- [ ] Groq API key — enter in Settings when ready (console.groq.com, free)
