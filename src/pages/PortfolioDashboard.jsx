import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const UNIT = 5 // $5 per unit

// ── helpers ──────────────────────────────────────────────────────────────────
function fmtUSD(n, showSign = false) {
  if (n == null || isNaN(n)) return '—'
  if (n > 0) return `${showSign ? '+' : ''}$${n.toFixed(2)}`
  if (n < 0) return `-$${Math.abs(n).toFixed(2)}`
  return '$0.00'
}
function fmtPct(n) { return n == null ? '—' : n.toFixed(1) + '%' }
function fmtR(n, showSign = false) {
  if (n == null || isNaN(n)) return '—'
  const sign = showSign && n > 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}R`
}
function plColor(n) { return n > 0 ? 'text-brand-win' : n < 0 ? 'text-brand-loss' : 'text-brand-be' }
function plBg(n) { return n > 0 ? 'bg-green-50 border-green-100' : n < 0 ? 'bg-red-50 border-red-100' : 'bg-yellow-50 border-yellow-100' }

function getDurationMins(t) {
  if (!t.entry_time || !t.exit_time) return null
  const toMins = str => { const [h, m] = str.split(':').map(Number); return h * 60 + m }
  let diff = toMins(t.exit_time) - toMins(t.entry_time)
  if (diff < 0) diff += 1440
  return diff
}

function calcBreakdown(trades, key) {
  const map = {}
  for (const t of trades) {
    const k = t[key] ?? 'Unknown'
    if (!map[k]) map[k] = { trades: 0, wins: 0, losses: 0, be: 0, totalPL: 0 }
    const pl = t.profit_usd || 0
    map[k].trades++
    map[k].totalPL += pl
    if (pl > 0) map[k].wins++
    else if (pl < 0) map[k].losses++
    else map[k].be++
  }
  return Object.entries(map)
    .map(([k, v]) => ({ name: k, ...v, winRate: v.trades ? (v.wins / v.trades) * 100 : 0 }))
    .sort((a, b) => b.totalPL - a.totalPL)
}

// ── sub-components ────────────────────────────────────────────────────────────
function Section({ title }) {
  return (
    <div className="flex items-center gap-3 mb-4 mt-2">
      <div className="w-1.5 h-6 rounded-full bg-brand-accent" />
      <h2 className="text-sm font-black text-brand-text uppercase tracking-[0.08em]">{title}</h2>
      <div className="flex-1 h-px bg-brand-border" />
    </div>
  )
}

function Stat({ label, value, color, sub }) {
  return (
    <div className="bg-brand-surface border border-brand-border rounded-2xl p-5 shadow-sm">
      <p className="text-[10px] font-bold text-brand-muted uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-black font-mono tabular-nums leading-none ${color || 'text-brand-text'}`}>{value}</p>
      {sub && <p className="text-[10px] text-brand-muted mt-1">{sub}</p>}
    </div>
  )
}

function BDTable({ rows, cols }) {
  if (!rows.length) return <p className="text-xs text-brand-muted py-2">No data</p>
  return (
    <div className="rounded-2xl border border-brand-border overflow-hidden shadow-sm">
      <table className="w-full text-xs font-mono">
        <thead>
          <tr className="bg-brand border-b border-brand-border">
            {cols.map(c => (
              <th key={c.key} className="px-3 py-2 text-left text-[10px] font-black text-brand-muted uppercase tracking-widest">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={`border-t border-brand-border hover:bg-brand-raised ${i % 2 === 0 ? 'bg-white' : 'bg-brand/60'}`}>
              {cols.map(c => (
                <td key={c.key} className={`px-3 py-2 ${c.className ? c.className(r[c.key], r) : 'text-brand-text'}`}>
                  {c.fmt ? c.fmt(r[c.key], r) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── main component ────────────────────────────────────────────────────────────
export default function PortfolioDashboard() {
  const [trades, setTrades] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterTicker, setFilterTicker] = useState('All')
  const [filterYear, setFilterYear] = useState('All')
  const [filterMonth, setFilterMonth] = useState('All')

  useEffect(() => {
    supabase.from('portfolio_trades').select('*').order('entry_date', { ascending: false }).then(({ data }) => {
      setTrades(data || [])
      setLoading(false)
    })
  }, [])

  // Filters
  const tickers = ['All', ...new Set(trades.map(t => t.ticker).filter(Boolean))].sort()
  const years = ['All', ...new Set(trades.map(t => t.entry_date?.slice(0, 4)).filter(Boolean))].sort().reverse()
  const months = ['All', '01','02','03','04','05','06','07','08','09','10','11','12']
  const MONTH_NAMES = { '01':'Jan','02':'Feb','03':'Mar','04':'Apr','05':'May','06':'Jun','07':'Jul','08':'Aug','09':'Sep','10':'Oct','11':'Nov','12':'Dec' }

  const filtered = trades.filter(t => {
    if (filterTicker !== 'All' && t.ticker !== filterTicker) return false
    if (filterYear !== 'All' && t.entry_date?.slice(0, 4) !== filterYear) return false
    if (filterMonth !== 'All' && t.entry_date?.slice(5, 7) !== filterMonth) return false
    return true
  })

  const closed = filtered.filter(t => t.profit_usd != null)
  const wins = closed.filter(t => t.profit_usd > 0)
  const losses = closed.filter(t => t.profit_usd < 0)
  const bes = closed.filter(t => t.profit_usd === 0)

  const totalPL = closed.reduce((s, t) => s + t.profit_usd, 0)
  const grossWin = wins.reduce((s, t) => s + t.profit_usd, 0)
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.profit_usd, 0))
  const winRate = closed.length ? (wins.length / closed.length) * 100 : 0
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0
  const avgWin = wins.length ? grossWin / wins.length : 0
  const avgLoss = losses.length ? grossLoss / losses.length : 0
  const expectancy = closed.length
    ? (winRate / 100) * avgWin - (1 - winRate / 100) * avgLoss
    : 0

  // $5/unit metrics
  const totalUnits = totalPL / UNIT
  const totalHours = closed.reduce((s, t) => {
    const dur = getDurationMins(t)
    return s + (dur != null ? dur / 60 : 0)
  }, 0)
  const dollarPerHour = totalHours > 0 ? totalPL / totalHours : null
  const benchmark = UNIT // $5/hr target
  const aboveBenchmark = dollarPerHour != null && dollarPerHour >= benchmark

  // Streaks
  let maxWinStreak = 0, maxLossStreak = 0, curW = 0, curL = 0
  for (const t of [...closed].reverse()) {
    if (t.profit_usd > 0) { curW++; curL = 0; maxWinStreak = Math.max(maxWinStreak, curW) }
    else if (t.profit_usd < 0) { curL++; curW = 0; maxLossStreak = Math.max(maxLossStreak, curL) }
    else { curW = 0; curL = 0 }
  }

  // Best / worst trade
  const bestTrade = closed.reduce((b, t) => (!b || t.profit_usd > b.profit_usd ? t : b), null)
  const worstTrade = closed.reduce((w, t) => (!w || t.profit_usd < w.profit_usd ? t : w), null)

  // Breakdowns
  const byTicker   = calcBreakdown(closed, 'ticker')
  const byStrategy = calcBreakdown(closed, 'strategy')
  const bySession  = calcBreakdown(closed, 'session')
  const byDir      = calcBreakdown(closed, 'direction')

  // Monthly P&L
  const monthlyMap = {}
  for (const t of closed) {
    const ym = t.entry_date?.slice(0, 7)
    if (!ym) continue
    if (!monthlyMap[ym]) monthlyMap[ym] = { pl: 0, trades: 0, wins: 0 }
    monthlyMap[ym].pl += t.profit_usd
    monthlyMap[ym].trades++
    if (t.profit_usd > 0) monthlyMap[ym].wins++
  }
  const monthly = Object.entries(monthlyMap)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([ym, v]) => ({ month: ym, ...v, wr: v.trades ? (v.wins / v.trades) * 100 : 0 }))

  const bdCols = [
    { key: 'name', label: 'Name', className: () => 'font-semibold text-brand-text' },
    { key: 'trades', label: 'Trades', className: () => 'text-brand-muted' },
    { key: 'winRate', label: 'Win%', fmt: v => fmtPct(v), className: v => v >= 50 ? 'text-brand-win font-semibold' : 'text-brand-loss' },
    { key: 'totalPL', label: 'P/L ($)', fmt: v => fmtUSD(v, true), className: (v) => plColor(v) + ' font-bold' },
    { key: 'wins', label: 'W', className: () => 'text-brand-win' },
    { key: 'losses', label: 'L', className: () => 'text-brand-loss' },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)] text-brand-muted text-sm uppercase tracking-widest animate-pulse">
        Loading portfolio…
      </div>
    )
  }

  return (
    <div className="w-full px-8 py-8 space-y-12">

      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[10px] font-bold text-brand-muted uppercase tracking-[0.15em] mb-0.5">My Portfolio</p>
          <h1 className="text-2xl font-black text-brand-text tracking-tight">Dashboard</h1>
        </div>
        <div className="flex gap-2">
          {[
            { value: filterTicker, set: setFilterTicker, options: tickers, label: 'Ticker' },
            { value: filterYear,   set: setFilterYear,   options: years,   label: 'Year' },
            { value: filterMonth,  set: setFilterMonth,  options: months,  label: 'Month',
              fmt: v => v === 'All' ? 'All' : MONTH_NAMES[v] },
          ].map(f => (
            <select key={f.label} value={f.value} onChange={e => f.set(e.target.value)}
              className="bg-white border border-brand-border rounded-lg px-3 py-1.5 text-xs font-semibold text-brand-text focus:outline-none focus:border-brand-accent">
              {f.options.map(o => <option key={o} value={o}>{f.fmt ? f.fmt(o) : o}</option>)}
            </select>
          ))}
        </div>
      </div>

      {closed.length === 0 ? (
        <div className="text-center py-24 text-brand-muted text-sm">No trades yet — log your first trade in My Portfolio → Log Trade.</div>
      ) : (
        <>
          {/* ── $5/unit benchmark banner ── */}
          <div className={`border rounded-2xl px-5 py-4 flex items-center justify-between shadow-sm ${aboveBenchmark ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-brand-muted mb-0.5">$5/Unit Benchmark</p>
              <p className={`text-sm font-semibold ${aboveBenchmark ? 'text-brand-win' : 'text-brand-loss'}`}>
                {dollarPerHour != null
                  ? `You're earning ${fmtUSD(dollarPerHour)}/hr — ${aboveBenchmark ? 'above' : 'below'} the $5/hr target`
                  : 'Add entry/exit times to track $/hr efficiency'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-brand-muted uppercase tracking-wider mb-0.5">Total units earned</p>
              <p className={`text-2xl font-black font-mono tabular-nums ${plColor(totalUnits)}`}>
                {totalUnits >= 0 ? '+' : ''}{totalUnits.toFixed(1)}u
              </p>
            </div>
          </div>

          {/* ── Core KPIs ── */}
          <div>
            <Section title="Performance" />
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
              <Stat label="Net P/L" value={fmtUSD(totalPL, true)} color={plColor(totalPL)} />
              <Stat label="Win Rate" value={fmtPct(winRate)} color={winRate >= 50 ? 'text-brand-win' : 'text-brand-loss'} />
              <Stat label="Profit Factor" value={isFinite(profitFactor) ? profitFactor.toFixed(2) : '∞'} color={profitFactor >= 1 ? 'text-brand-win' : 'text-brand-loss'} />
              <Stat label="Expectancy" value={fmtUSD(expectancy, true)} color={plColor(expectancy)} sub="per trade avg" />
              <Stat label="Total Trades" value={closed.length} />
              <Stat label="Avg Win" value={fmtUSD(avgWin)} color="text-brand-win" />
              <Stat label="Avg Loss" value={`-$${avgLoss.toFixed(2)}`} color="text-brand-loss" />
              <Stat label="$/Hour" value={dollarPerHour != null ? fmtUSD(dollarPerHour) : '—'} color={aboveBenchmark ? 'text-brand-win' : 'text-brand-loss'} sub="target: $5.00" />
            </div>
          </div>

          {/* ── Counts ── */}
          <div>
            <Section title="Trade Counts" />
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
              <Stat label="Wins" value={wins.length} color="text-brand-win" />
              <Stat label="Losses" value={losses.length} color="text-brand-loss" />
              <Stat label="Breakeven" value={bes.length} color="text-brand-be" />
              <Stat label="Best Trade" value={bestTrade ? fmtUSD(bestTrade.profit_usd, true) : '—'} color="text-brand-win" sub={bestTrade?.ticker} />
              <Stat label="Worst Trade" value={worstTrade ? fmtUSD(worstTrade.profit_usd, true) : '—'} color="text-brand-loss" sub={worstTrade?.ticker} />
              <Stat label="Gross Profit" value={fmtUSD(grossWin)} color="text-brand-win" />
            </div>
          </div>

          {/* ── Streaks ── */}
          <div>
            <Section title="Streaks" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Stat label="Max Win Streak" value={maxWinStreak} color="text-brand-win" />
              <Stat label="Max Loss Streak" value={maxLossStreak} color="text-brand-loss" />
              <Stat label="Gross Win" value={fmtUSD(grossWin)} color="text-brand-win" />
              <Stat label="Gross Loss" value={`-$${grossLoss.toFixed(2)}`} color="text-brand-loss" />
            </div>
          </div>

          {/* ── Breakdowns ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <Section title="By Ticker" />
              <BDTable rows={byTicker} cols={bdCols} />
            </div>
            <div>
              <Section title="By Strategy" />
              <BDTable rows={byStrategy} cols={bdCols} />
            </div>
            <div>
              <Section title="By Session" />
              <BDTable rows={bySession} cols={bdCols} />
            </div>
            <div>
              <Section title="By Direction" />
              <BDTable rows={byDir} cols={bdCols} />
            </div>
          </div>

          {/* ── Monthly P&L ── */}
          {monthly.length > 0 && (
            <div>
              <Section title="Monthly P/L" />
              <div className="rounded-2xl border border-brand-border overflow-hidden shadow-sm">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="bg-brand border-b border-brand-border">
                      {['Month','Trades','Win%','Gross P/L','Units'].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-[10px] font-black text-brand-muted uppercase tracking-widest">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {monthly.map((r, i) => (
                      <tr key={r.month} className={`border-t border-brand-border hover:bg-brand-raised ${i % 2 === 0 ? 'bg-white' : 'bg-brand/60'}`}>
                        <td className="px-3 py-2 font-semibold text-brand-text">{r.month}</td>
                        <td className="px-3 py-2 text-brand-muted">{r.trades}</td>
                        <td className={`px-3 py-2 font-semibold ${r.wr >= 50 ? 'text-brand-win' : 'text-brand-loss'}`}>{fmtPct(r.wr)}</td>
                        <td className={`px-3 py-2 font-bold ${plColor(r.pl)}`}>{fmtUSD(r.pl, true)}</td>
                        <td className={`px-3 py-2 ${plColor(r.pl / UNIT)}`}>{(r.pl / UNIT >= 0 ? '+' : '')}{(r.pl / UNIT).toFixed(1)}u</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
