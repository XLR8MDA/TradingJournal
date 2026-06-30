# TradeJournal — Claude Context

## What this project is
A personal trading journal and portfolio tracker for a retail trader using Exness broker.
Two distinct sections:
1. **Trade Journal** — manually log trades with strategy/session/R-multiple metadata, backed by Supabase
2. **My Portfolio** — upload Exness broker statement PDFs, parse them client-side, and analyse real P&L

## Tech stack
- React 18 + Vite
- React Router v6 (client-side routing, SPA)
- Tailwind CSS with custom brand tokens (see tailwind.config.js)
- Supabase (PostgreSQL) — used only by the Journal section
- AG Grid — used in Trade Log page
- pdfjs-dist — used to parse Exness PDF statements client-side
- Deployed on Netlify

## File structure
```
src/
  App.jsx              # Router + layout shell
  main.jsx             # React entry
  supabase.js          # Supabase client (env vars VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)
  components/
    NavBar.jsx          # Fixed top nav, links array drives all nav items
  pages/
    Journal.jsx         # Manual trade entry form (~522 lines)
    Trades.jsx          # AG Grid trade log
    Dashboard.jsx       # Analytics dashboard (~777 lines)
    PortfolioUpload.jsx # Upload Exness PDF statements, parse + store in localStorage
    PortfolioDashboard.jsx # P&L dashboard from uploaded statements
    TradingInsights.jsx    # Insights & patterns page
```

## Routing
| Path | Page |
|------|------|
| / | redirect → /journal |
| /journal | Journal.jsx |
| /trades | Trades.jsx |
| /dashboard | Dashboard.jsx |
| /portfolio | PortfolioDashboard.jsx |
| /portfolio/upload | PortfolioUpload.jsx |
| /insights | TradingInsights.jsx |

Nav links are defined in `src/components/NavBar.jsx` as a `links` array — add new pages there.

## Styling conventions
- All colors use brand-* tokens: `brand-win` (green), `brand-loss` (red), `brand-be` (gold), `brand-muted`, `brand-text`, `brand-border`, `brand-surface`, `brand-raised`
- Monospace font for numbers: `font-mono tabular-nums`
- Positive P&L → `text-brand-win`, Negative → `text-brand-loss`, Zero → `text-brand-be`
- Section header pattern: left accent bar + bold label (see `Section` component in Dashboard.jsx)
- Stat card pattern: label on top, big value below, optional color (see `Stat` component in Dashboard.jsx)

## Portfolio data model (Supabase)
Table: `portfolio_trades` — same schema as `trades` plus one extra column:
- `profit_usd` (float8, nullable) — actual dollar P&L from the broker

Strategies for the portfolio form are stored in localStorage under `pf_strategies`.

## Business logic
- **$5/unit benchmark**: 1 unit = $5. `r_multiple` is auto-computed from `profit_usd / 5` when profit is entered. Used to assess whether trading is worth the time investment — PortfolioDashboard shows $/hr vs $5 target.
- **Duration**: `exit_time - entry_time` in minutes, used to compute $/hr efficiency metric.

## Important patterns
- Form field helper: `function set(field, val) { setForm(f => ({ ...f, [field]: val })) }` — used in Journal
- No global state library — everything is useState/useEffect
- Data fetching always in useEffect on mount
- localStorage helper: JSON.parse(localStorage.getItem(key) || '[]')

## Do not
- Do not add auth/login — app is single-user, no authentication
- Do not modify the Supabase `trades` table schema without confirming
- Do not add new npm packages without asking — keep bundle lean
- Do not rename brand-* color tokens — they're used everywhere
