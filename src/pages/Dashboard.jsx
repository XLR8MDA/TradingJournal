import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getDurationMins(t) {
  if (!t.entry_date || !t.entry_time || !t.exit_date || !t.exit_time) return null
  try {
    const entry = new Date(`${t.entry_date}T${t.entry_time}`)
    const exit  = new Date(`${t.exit_date}T${t.exit_time}`)
    const m = Math.round((exit - entry) / 60000)
    return m >= 0 ? m : null
  } catch { return null }
}

function fmtDur(mins) {
  if (mins == null || isNaN(mins)) return '—'
  const h = Math.floor(mins / 60), m = mins % 60
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
}

function fmtR(v, digits = 2) {
  if (v == null || isNaN(v)) return '—'
  return `${v > 0 ? '+' : ''}${v.toFixed(digits)}R`
}

function median(arr) {
  if (!arr.length) return null
  const s = [...arr].sort((a,b)=>a-b), mid = Math.floor(s.length/2)
  return s.length % 2 === 0 ? (s[mid-1]+s[mid])/2 : s[mid]
}

function mode(arr) {
  if (!arr.length) return null
  const freq = {}
  arr.forEach(v => { freq[v] = (freq[v]||0)+1 })
  const maxF = Math.max(...Object.values(freq))
  return +Object.entries(freq).find(([,f])=>f===maxF)[0]
}

function getDayOfWeek(dateStr) {
  if (!dateStr) return null
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
  return days[new Date(dateStr+'T12:00:00').getDay()]
}

function getHour(timeStr) {
  if (!timeStr) return null
  return parseInt(timeStr.split(':')[0])
}

function hourLabel(h) {
  const fmt = n => {
    const ap = n < 12 ? 'AM' : 'PM'
    const h12 = n === 0 ? 12 : n > 12 ? n-12 : n
    return `${String(h12).padStart(2,'0')}${ap}`
  }
  return `${fmt(h)} – ${fmt((h+1)%24)}`
}

const DUR_BUCKETS = ['<10','10-20','20-30','30-40','40-50','50-60','60-90','90-120','120+']
function durBucket(mins) {
  if (mins == null) return null
  if (mins < 10)  return '<10'
  if (mins < 20)  return '10-20'
  if (mins < 30)  return '20-30'
  if (mins < 40)  return '30-40'
  if (mins < 50)  return '40-50'
  if (mins < 60)  return '50-60'
  if (mins < 90)  return '60-90'
  if (mins < 120) return '90-120'
  return '120+'
}

function getWeekKey(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr+'T12:00:00')
  const jan1 = new Date(d.getFullYear(), 0, 1)
  const wk = Math.ceil(((d-jan1)/86400000 + jan1.getDay()+1)/7)
  return `${d.getFullYear()}-W${String(wk).padStart(2,'0')}`
}

function calcBreakdown(trades, keyFn, order = null) {
  const map = {}
  for (const t of trades) {
    const k = typeof keyFn === 'function' ? keyFn(t) : (t[keyFn] || null)
    if (k == null) continue
    if (!map[k]) map[k] = { trades:0, wins:0, losses:0, bes:0, totalR:0 }
    map[k].trades++
    if (t.r_multiple > 0)       map[k].wins++
    else if (t.r_multiple < 0)  map[k].losses++
    else if (t.r_multiple === 0) map[k].bes++
    map[k].totalR += t.r_multiple || 0
  }
  let entries = Object.entries(map).map(([key, v]) => ({
    key,
    ...v,
    winRate: v.trades > 0 ? (v.wins / v.trades) * 100 : 0,
    avgR: v.trades > 0 ? v.totalR / v.trades : 0,
    totalR: +v.totalR.toFixed(2),
  }))
  if (order) entries.sort((a,b) => order.indexOf(a.key) - order.indexOf(b.key))
  else entries.sort((a,b) => b.totalR - a.totalR)
  return entries
}

function calcStreaks(trades) {
  const sorted = [...trades].sort((a,b)=>(a.entry_date+(a.entry_time||'')).localeCompare(b.entry_date+(b.entry_time||'')))
  let maxWin=0, maxLoss=0, maxBE=0, maxNoWin=0
  let curWin=0, curLoss=0, curBE=0, curNoWin=0
  let maxRWon=0, minRLost=0, curRWon=0, curRLost=0
  for (const t of sorted) {
    const r = t.r_multiple
    if (r > 0)      { curWin++; curLoss=0; curBE=0; curNoWin=0; curRWon+=r; curRLost=0 }
    else if (r < 0) { curLoss++; curWin=0; curBE=0; curNoWin++; curRLost+=r; curRWon=0 }
    else            { curBE++; curWin=0; curLoss=0; curNoWin++; curRWon=0; curRLost=0 }
    maxWin   = Math.max(maxWin, curWin)
    maxLoss  = Math.max(maxLoss, curLoss)
    maxBE    = Math.max(maxBE, curBE)
    maxNoWin = Math.max(maxNoWin, curNoWin)
    maxRWon  = Math.max(maxRWon, curRWon)
    minRLost = Math.min(minRLost, curRLost)
  }
  return { maxWin, maxLoss, maxBE, maxNoWin, maxRWon, minRLost }
}

function periodBreakdown(trades, keyFn) {
  const map = {}
  for (const t of trades) {
    const k = keyFn(t)
    if (!k) continue
    if (!map[k]) map[k] = []
    map[k].push(t)
  }
  return Object.entries(map).map(([period, ts]) => {
    const withR = ts.filter(t => t.r_multiple != null)
    const wins  = withR.filter(t => t.r_multiple > 0)
    const losses = withR.filter(t => t.r_multiple < 0)
    const totalR = +withR.reduce((s,t)=>s+t.r_multiple,0).toFixed(2)
    return {
      period,
      trades: ts.length,
      wins: wins.length,
      losses: losses.length,
      bes: withR.filter(t=>t.r_multiple===0).length,
      totalR,
      winRate: withR.length ? (wins.length/withR.length)*100 : 0,
      avgR: withR.length ? totalR/withR.length : 0,
    }
  }).sort((a,b)=>b.period.localeCompare(a.period))
}

// ─── UI Components ─────────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-1.5 h-6 rounded-full bg-brand-accent" />
        <h2 className="text-sm font-black text-brand-text uppercase tracking-[0.08em]">{title}</h2>
        <div className="flex-1 h-px bg-brand-border" />
      </div>
      {children}
    </div>
  )
}

function Stat({ label, value, accent, sm, hero }) {
  return (
    <div className={`
      relative overflow-hidden rounded-2xl border border-brand-border
      bg-gradient-to-b from-brand-surface to-brand-raised
      p-5 transition-all duration-200 shadow-sm
      hover:border-brand-accent/40 group
      ${hero ? 'ring-1 ring-brand-accent/20' : ''}
    `}>
      {hero && <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-accent/60 to-transparent" />}
      <div className="text-[10px] font-semibold text-brand-muted uppercase tracking-[0.12em] mb-2 group-hover:text-brand-accent/70 transition-colors">{label}</div>
      <div className={`font-bold tabular-nums leading-none ${hero ? 'text-3xl' : sm ? 'text-xl' : 'text-2xl'} ${accent || 'text-brand-text'}`}>
        {value ?? '—'}
      </div>
    </div>
  )
}

function BreakdownTable({ title, data, keyLabel }) {
  if (!data || data.length === 0) return null
  return (
    <div className="rounded-2xl border border-brand-border overflow-hidden bg-brand-surface shadow-sm">
      <div className="px-4 py-3 border-b border-brand-border flex items-center gap-2">
        <div className="w-1 h-3 rounded-full bg-brand-accent/60" />
        <h3 className="text-[11px] font-bold text-brand-muted uppercase tracking-[0.12em]">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-brand border-b border-brand-border">
              <th className="px-4 py-2.5 text-left text-[10px] font-black text-brand-muted uppercase tracking-widest">{keyLabel}</th>
              <th className="px-3 py-2.5 text-right text-[10px] font-black text-brand-muted uppercase tracking-widest">Trd</th>
              <th className="px-3 py-2.5 text-right text-[10px] font-black text-brand-muted uppercase tracking-widest">W</th>
              <th className="px-3 py-2.5 text-right text-[10px] font-black text-brand-muted uppercase tracking-widest">L</th>
              <th className="px-3 py-2.5 text-right text-[10px] font-black text-brand-muted uppercase tracking-widest">BE</th>
              <th className="px-3 py-2.5 text-right text-[10px] font-black text-brand-muted uppercase tracking-widest">Win%</th>
              <th className="px-3 py-2.5 text-right text-[10px] font-black text-brand-muted uppercase tracking-widest">Total R</th>
              <th className="px-3 py-2.5 text-right text-[10px] font-black text-brand-muted uppercase tracking-widest">Avg R</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={row.key} className={`border-t border-brand-border/40 hover:bg-brand-raised transition-colors ${i%2===0?'bg-white':'bg-brand/60'}`}>
                <td className="px-4 py-2.5 font-semibold text-brand-accent">{row.key}</td>
                <td className="px-3 py-2.5 text-right text-brand-text/80">{row.trades}</td>
                <td className="px-3 py-2.5 text-right text-brand-win font-medium">{row.wins}</td>
                <td className="px-3 py-2.5 text-right text-brand-loss font-medium">{row.losses}</td>
                <td className="px-3 py-2.5 text-right text-brand-be">{row.bes}</td>
                <td className={`px-3 py-2.5 text-right font-semibold ${row.winRate>=60?'text-brand-win':row.winRate>=45?'text-brand-be':'text-brand-loss'}`}>
                  {row.winRate.toFixed(1)}%
                </td>
                <td className={`px-3 py-2.5 text-right font-mono font-bold ${row.totalR>0?'text-brand-win':row.totalR<0?'text-brand-loss':'text-brand-muted'}`}>
                  {fmtR(row.totalR)}
                </td>
                <td className={`px-3 py-2.5 text-right font-mono ${row.avgR>0?'text-brand-win':row.avgR<0?'text-brand-loss':'text-brand-muted'}`}>
                  {fmtR(row.avgR)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PeriodTable({ title, data }) {
  if (!data || data.length === 0) return null
  return (
    <div className="rounded-2xl border border-brand-border overflow-hidden bg-brand-surface shadow-sm">
      <div className="px-4 py-3 border-b border-brand-border flex items-center gap-2">
        <div className="w-1 h-3 rounded-full bg-brand-accent/60" />
        <h3 className="text-[11px] font-bold text-brand-muted uppercase tracking-[0.12em]">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-brand border-b border-brand-border">
              <th className="px-4 py-2.5 text-left text-[10px] font-black text-brand-muted uppercase tracking-widest">Period</th>
              <th className="px-3 py-2.5 text-right text-[10px] font-black text-brand-muted uppercase tracking-widest">Trd</th>
              <th className="px-3 py-2.5 text-right text-[10px] font-black text-brand-muted uppercase tracking-widest">W</th>
              <th className="px-3 py-2.5 text-right text-[10px] font-black text-brand-muted uppercase tracking-widest">L</th>
              <th className="px-3 py-2.5 text-right text-[10px] font-black text-brand-muted uppercase tracking-widest">Win%</th>
              <th className="px-3 py-2.5 text-right text-[10px] font-black text-brand-muted uppercase tracking-widest">Total R</th>
              <th className="px-3 py-2.5 text-right text-[10px] font-black text-brand-muted uppercase tracking-widest">Avg R</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={row.period} className={`border-t border-brand-border/40 hover:bg-brand-raised transition-colors ${i%2===0?'bg-white':'bg-brand/60'}`}>
                <td className="px-4 py-2.5 font-medium text-brand-text">{row.period}</td>
                <td className="px-3 py-2.5 text-right text-brand-text/80">{row.trades}</td>
                <td className="px-3 py-2.5 text-right text-brand-win font-medium">{row.wins}</td>
                <td className="px-3 py-2.5 text-right text-brand-loss font-medium">{row.losses}</td>
                <td className={`px-3 py-2.5 text-right font-semibold ${row.winRate>=60?'text-brand-win':row.winRate>=45?'text-brand-be':'text-brand-loss'}`}>
                  {row.winRate.toFixed(1)}%
                </td>
                <td className={`px-3 py-2.5 text-right font-mono font-bold ${row.totalR>0?'text-brand-win':row.totalR<0?'text-brand-loss':'text-brand-muted'}`}>
                  {fmtR(row.totalR)}
                </td>
                <td className={`px-3 py-2.5 text-right font-mono ${row.avgR>0?'text-brand-win':row.avgR<0?'text-brand-loss':'text-brand-muted'}`}>
                  {fmtR(row.avgR)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [trades, setTrades]   = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState({ ticker: 'All', year: 'All', month: 'All' })
  const [monthlyTarget, setMonthlyTarget] = useState(10)
  const [selectedPair, setSelectedPair]   = useState(null)

  useEffect(() => {
    supabase.from('trades').select('*').then(({ data }) => {
      setTrades(data || [])
      setLoading(false)
    })
  }, [])

  const tickers = ['All', ...new Set(trades.map(t => t.ticker).filter(Boolean))]
  const years   = ['All', ...[...new Set(trades.map(t => t.entry_date?.slice(0,4)).filter(Boolean))].sort().reverse()]
  const months  = ['All', ...[...new Set(trades.map(t => t.entry_date?.slice(0,7)).filter(Boolean))].sort().reverse()]

  const filtered = trades.filter(t => {
    if (filter.ticker !== 'All' && t.ticker !== filter.ticker) return false
    if (filter.year   !== 'All' && t.entry_date?.slice(0,4) !== filter.year) return false
    if (filter.month  !== 'All' && t.entry_date?.slice(0,7) !== filter.month) return false
    return true
  })

  const withR    = filtered.filter(t => t.r_multiple != null)
  const wins     = withR.filter(t => t.r_multiple > 0)
  const losses   = withR.filter(t => t.r_multiple < 0)
  const bes      = withR.filter(t => t.r_multiple === 0)

  const r1plus = withR.filter(t => t.r_multiple >= 1)
  const r2plus = withR.filter(t => t.r_multiple >= 2)
  const r3plus = withR.filter(t => t.r_multiple >= 3)
  const r4plus = withR.filter(t => t.r_multiple >= 4)
  const r5plus = withR.filter(t => t.r_multiple >= 5)

  const grossProfit  = +wins.reduce((s,t)=>s+t.r_multiple,0).toFixed(2)
  const grossLoss    = +losses.reduce((s,t)=>s+t.r_multiple,0).toFixed(2)
  const netR         = +(grossProfit+grossLoss).toFixed(2)
  const profitFactor = grossLoss !== 0 ? +(Math.abs(grossProfit/grossLoss)).toFixed(2) : null
  const winRate      = withR.length ? (wins.length/withR.length)*100 : 0
  const avgWin       = wins.length   ? +(grossProfit/wins.length).toFixed(2) : 0
  const avgLoss      = losses.length ? +(grossLoss/losses.length).toFixed(2) : 0
  const expectancy   = withR.length  ? +(netR/withR.length).toFixed(2) : 0
  const wlRatio      = avgLoss !== 0 ? +(Math.abs(avgWin/avgLoss)).toFixed(2) : null
  const bestTrade    = wins.length   ? Math.max(...wins.map(t=>t.r_multiple))   : null
  const worstTrade   = losses.length ? Math.min(...losses.map(t=>t.r_multiple)) : null
  const beWinRate    = withR.length  ? ((wins.length+bes.length)/withR.length)*100 : 0

  const cumR1 = +r1plus.reduce((s,t)=>s+t.r_multiple,0).toFixed(2)
  const cumR2 = +r2plus.reduce((s,t)=>s+t.r_multiple,0).toFixed(2)
  const cumR3 = +r3plus.reduce((s,t)=>s+t.r_multiple,0).toFixed(2)
  const cumR4 = +r4plus.reduce((s,t)=>s+t.r_multiple,0).toFixed(2)
  const cumR5 = +r5plus.reduce((s,t)=>s+t.r_multiple,0).toFixed(2)

  const medAll  = median(withR.map(t=>t.r_multiple))
  const medWin  = median(wins.map(t=>t.r_multiple))
  const medLoss = median(losses.map(t=>t.r_multiple))
  const modeAll  = mode(withR.map(t=>t.r_multiple))
  const modeWin  = mode(wins.map(t=>t.r_multiple))
  const modeLoss = mode(losses.map(t=>t.r_multiple))

  const { maxWin: maxWinStr, maxLoss: maxLossStr, maxBE: maxBEStr, maxNoWin, maxRWon, minRLost } = calcStreaks(withR)

  const withDur  = filtered.map(t=>({...t, dur: getDurationMins(t)})).filter(t=>t.dur!=null)
  const winDurs  = withDur.filter(t=>t.r_multiple>0).map(t=>t.dur)
  const lossDurs = withDur.filter(t=>t.r_multiple<0).map(t=>t.dur)
  const beDurs   = withDur.filter(t=>t.r_multiple===0).map(t=>t.dur)
  const allDurs  = withDur.map(t=>t.dur)

  const avgDurAll  = allDurs.length  ? Math.round(allDurs.reduce((s,v)=>s+v,0)/allDurs.length)   : null
  const avgDurWin  = winDurs.length  ? Math.round(winDurs.reduce((s,v)=>s+v,0)/winDurs.length)   : null
  const avgDurLoss = lossDurs.length ? Math.round(lossDurs.reduce((s,v)=>s+v,0)/lossDurs.length) : null
  const avgDurBE   = beDurs.length   ? Math.round(beDurs.reduce((s,v)=>s+v,0)/beDurs.length)     : null
  const longWin  = winDurs.length  ? Math.max(...winDurs)  : null
  const longLoss = lossDurs.length ? Math.max(...lossDurs) : null
  const shortWin  = winDurs.length  ? Math.min(...winDurs)  : null
  const shortLoss = lossDurs.length ? Math.min(...lossDurs) : null

  const avgDurR = (minR) => {
    const ds = withDur.filter(t=>t.r_multiple>=minR).map(t=>t.dur)
    return ds.length ? Math.round(ds.reduce((s,v)=>s+v,0)/ds.length) : null
  }
  const avgDurLongArr  = withDur.filter(t=>t.direction==='Long').map(t=>t.dur)
  const avgDurShortArr = withDur.filter(t=>t.direction==='Short').map(t=>t.dur)

  const dailyData   = periodBreakdown(filtered, t => t.entry_date)
  const weeklyData  = periodBreakdown(filtered, t => getWeekKey(t.entry_date))
  const monthlyData = periodBreakdown(filtered, t => t.entry_date?.slice(0,7))
  const yearlyData  = periodBreakdown(filtered, t => t.entry_date?.slice(0,4))

  const winDays  = dailyData.filter(d=>d.totalR>0)
  const lossDays = dailyData.filter(d=>d.totalR<0)
  const winWeeks = weeklyData.filter(w=>w.totalR>0)
  const winMonths = monthlyData.filter(m=>m.totalR>0)
  const winYears  = yearlyData.filter(y=>y.totalR>0)

  const avgRPerDay   = dailyData.length   ? +(dailyData.reduce((s,d)=>s+d.totalR,0)/dailyData.length).toFixed(2)     : null
  const avgRPerWeek  = weeklyData.length  ? +(weeklyData.reduce((s,d)=>s+d.totalR,0)/weeklyData.length).toFixed(2)   : null
  const avgRPerMonth = monthlyData.length ? +(monthlyData.reduce((s,d)=>s+d.totalR,0)/monthlyData.length).toFixed(2) : null
  const avgRPerYear  = yearlyData.length  ? +(yearlyData.reduce((s,d)=>s+d.totalR,0)/yearlyData.length).toFixed(2)   : null

  const bestDay   = dailyData.length   ? Math.max(...dailyData.map(d=>d.totalR))   : null
  const worstDay  = dailyData.length   ? Math.min(...dailyData.map(d=>d.totalR))   : null
  const bestWeek  = weeklyData.length  ? Math.max(...weeklyData.map(d=>d.totalR))  : null
  const worstWeek = weeklyData.length  ? Math.min(...weeklyData.map(d=>d.totalR))  : null

  const dowData = calcBreakdown(filtered, t => getDayOfWeek(t.entry_date), ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'])
  const bestDOW  = dowData.length ? [...dowData].sort((a,b)=>b.totalR-a.totalR)[0]?.key  : null
  const worstDOW = dowData.length ? [...dowData].sort((a,b)=>a.totalR-b.totalR)[0]?.key : null

  const tickerBD    = calcBreakdown(filtered, 'ticker')
  const tfBD        = calcBreakdown(filtered, 'timeframe')
  const mostTicker  = [...tickerBD].sort((a,b)=>b.trades-a.trades)[0]?.key
  const highWRTick  = tickerBD.length ? [...tickerBD].sort((a,b)=>b.winRate-a.winRate)[0]?.key : null
  const lowWRTick   = tickerBD.length ? [...tickerBD].filter(x=>x.trades>0).sort((a,b)=>a.winRate-b.winRate)[0]?.key : null
  const mostTF      = [...tfBD].sort((a,b)=>b.trades-a.trades)[0]?.key

  const curMonth = new Date().toISOString().slice(0,7)
  const curMonthR = +filtered.filter(t=>t.entry_date?.startsWith(curMonth)).reduce((s,t)=>s+(t.r_multiple||0),0).toFixed(2)
  const targetPct = Math.min((curMonthR / monthlyTarget) * 100, 100)

  const selectCls = "bg-brand-surface border border-brand-border rounded-lg px-3 py-1.5 text-xs text-brand-text focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent/30 transition-all"

  if (loading) return (
    <div className="flex items-center justify-center h-96">
      <div className="text-brand-muted text-sm font-medium tracking-widest uppercase animate-pulse">Loading...</div>
    </div>
  )

  return (
    <div className="w-full px-8 py-8 space-y-12">

      {/* Header + Filters */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black text-brand-text tracking-tight">Dashboard</h1>
          <p className="text-xs text-brand-muted mt-0.5">{filtered.length} trades · filtered view</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <select className={selectCls} value={filter.ticker} onChange={e=>setFilter(f=>({...f,ticker:e.target.value}))}>
            {tickers.map(t=><option key={t}>{t}</option>)}
          </select>
          <select className={selectCls} value={filter.year} onChange={e=>setFilter(f=>({...f,year:e.target.value}))}>
            {years.map(y=><option key={y}>{y}</option>)}
          </select>
          <select className={selectCls} value={filter.month} onChange={e=>setFilter(f=>({...f,month:e.target.value}))}>
            {months.map(m=><option key={m}>{m}</option>)}
          </select>
        </div>
      </div>

      {/* Monthly R Target */}
      <div className="relative overflow-hidden rounded-2xl border border-brand-border bg-gradient-to-r from-brand-surface to-brand-raised p-5 shadow-sm">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-accent/50 to-transparent" />
        <div className="flex items-center justify-between mb-3">
          <div>
            <span className="text-xs font-bold text-brand-muted uppercase tracking-widest">Monthly R Target</span>
            <span className="ml-3 text-xs text-brand-muted/60">{curMonth}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-lg font-black tabular-nums ${curMonthR >= monthlyTarget ? 'text-brand-win' : 'text-brand-accent'}`}>
              {fmtR(curMonthR)}
            </span>
            <span className="text-brand-muted text-sm">/</span>
            <input
              type="number" min="1" step="1"
              className="w-16 bg-brand border border-brand-border rounded-lg px-2 py-1 text-sm text-brand-text text-center focus:outline-none focus:border-brand-accent font-bold tabular-nums"
              value={monthlyTarget}
              onChange={e=>setMonthlyTarget(+e.target.value||10)}
            />
            <span className="text-brand-muted text-sm">R</span>
          </div>
        </div>
        <div className="h-3 bg-brand rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${curMonthR >= monthlyTarget ? 'bg-brand-win' : 'bg-gradient-to-r from-brand-accent to-brand-bright'}`}
            style={{ width: `${Math.max(0,targetPct)}%` }}
          />
        </div>
        <div className="text-xs text-brand-muted/60 mt-2 tabular-nums">{targetPct.toFixed(0)}% of target</div>
      </div>

      {/* Hero KPIs */}
      <Section title="Performance">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          <Stat hero label="Net R"         value={fmtR(netR)}        accent={netR>=0?'text-brand-win':'text-brand-loss'} />
          <Stat hero label="Win Rate"      value={`${winRate.toFixed(1)}%`} accent={winRate>=60?'text-brand-win':winRate>=45?'text-brand-be':'text-brand-loss'} />
          <Stat hero label="Profit Factor" value={profitFactor ?? '—'} accent={profitFactor&&profitFactor>=1?'text-brand-win':'text-brand-loss'} />
          <Stat hero label="Expectancy"    value={fmtR(expectancy)}  accent={expectancy>=0?'text-brand-win':'text-brand-loss'} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
          <Stat label="Total Trades"  value={filtered.length} />
          <Stat label="Avg Win R"     value={fmtR(avgWin)}  accent="text-brand-win" sm />
          <Stat label="Avg Loss R"    value={fmtR(avgLoss)} accent="text-brand-loss" sm />
          <Stat label="W/L R Ratio"   value={wlRatio ? wlRatio.toFixed(2) : '—'} sm />
          <Stat label="Gross Profit"  value={fmtR(grossProfit)} accent="text-brand-win" sm />
          <Stat label="Gross Loss"    value={fmtR(grossLoss)}   accent="text-brand-loss" sm />
          <Stat label="Best Trade"    value={fmtR(bestTrade)}   accent="text-brand-win" sm />
          <Stat label="Worst Trade"   value={fmtR(worstTrade)}  accent="text-brand-loss" sm />
        </div>
      </Section>

      {/* Trade Counts */}
      <Section title="Trade Counts">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4 mb-4">
          <Stat label="Wins"        value={wins.length}   accent="text-brand-win" sm />
          <Stat label="Losses"      value={losses.length} accent="text-brand-loss" sm />
          <Stat label="Breakevens"  value={bes.length}    accent="text-brand-be" sm />
          <Stat label="BE Win Rate" value={`${beWinRate.toFixed(1)}%`} sm />
          <Stat label="Win Rate"    value={`${winRate.toFixed(1)}%`} accent={winRate>=60?'text-brand-win':winRate>=45?'text-brand-be':'text-brand-loss'} sm />
          <Stat label="Total"       value={filtered.length} sm />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <Stat label="1R+ Trades" value={r1plus.length} sm />
          <Stat label="2R+ Trades" value={r2plus.length} sm />
          <Stat label="3R+ Trades" value={r3plus.length} sm />
          <Stat label="4R+ Trades" value={r4plus.length} sm />
          <Stat label="5R+ Trades" value={r5plus.length} sm />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mt-4">
          <Stat label="1R Win Rate" value={withR.length ? `${(r1plus.length/withR.length*100).toFixed(1)}%` : '—'} accent="text-brand-win" sm />
          <Stat label="2R Win Rate" value={withR.length ? `${(r2plus.length/withR.length*100).toFixed(1)}%` : '—'} accent="text-brand-win" sm />
          <Stat label="3R Win Rate" value={withR.length ? `${(r3plus.length/withR.length*100).toFixed(1)}%` : '—'} accent="text-brand-win" sm />
          <Stat label="4R Win Rate" value={withR.length ? `${(r4plus.length/withR.length*100).toFixed(1)}%` : '—'} accent="text-brand-win" sm />
          <Stat label="5R Win Rate" value={withR.length ? `${(r5plus.length/withR.length*100).toFixed(1)}%` : '—'} accent="text-brand-win" sm />
        </div>
      </Section>

      {/* P&L in R */}
      <Section title="P&L in R">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4 mb-4">
          <Stat label="Max Consec. R Won"  value={fmtR(maxRWon)}  accent="text-brand-win" sm />
          <Stat label="Max Consec. R Lost" value={fmtR(minRLost)} accent="text-brand-loss" sm />
          <Stat label="Median R (All)"     value={fmtR(medAll)}   sm />
          <Stat label="Median R (Wins)"    value={fmtR(medWin)}   accent="text-brand-win" sm />
          <Stat label="Median R (Losses)"  value={fmtR(medLoss)}  accent="text-brand-loss" sm />
          <Stat label="Mode R (All)"       value={fmtR(modeAll)}  sm />
          <Stat label="Mode R (Wins)"      value={fmtR(modeWin)}  accent="text-brand-win" sm />
          <Stat label="Mode R (Losses)"    value={fmtR(modeLoss)} accent="text-brand-loss" sm />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <Stat label="Cum. R of 1R+" value={fmtR(cumR1)} accent="text-brand-win" sm />
          <Stat label="Cum. R of 2R+" value={fmtR(cumR2)} accent="text-brand-win" sm />
          <Stat label="Cum. R of 3R+" value={fmtR(cumR3)} accent="text-brand-win" sm />
          <Stat label="Cum. R of 4R+" value={fmtR(cumR4)} accent="text-brand-win" sm />
          <Stat label="Cum. R of 5R+" value={fmtR(cumR5)} accent="text-brand-win" sm />
        </div>
      </Section>

      {/* Streaks */}
      <Section title="Streaks">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <Stat label="Max Win Streak"     value={maxWinStr}      accent="text-brand-win" sm />
          <Stat label="Max Loss Streak"    value={maxLossStr}     accent="text-brand-loss" sm />
          <Stat label="Max BE Streak"      value={maxBEStr}       accent="text-brand-be" sm />
          <Stat label="Max w/o Win"        value={maxNoWin}       accent="text-brand-loss" sm />
          <Stat label="Max Consec. R Won"  value={fmtR(maxRWon)}  accent="text-brand-win" sm />
          <Stat label="Max Consec. R Lost" value={fmtR(minRLost)} accent="text-brand-loss" sm />
        </div>
      </Section>

      {/* Duration */}
      <Section title="Duration">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4 mb-4">
          <Stat label="Avg All"   value={fmtDur(avgDurAll)}  sm />
          <Stat label="Avg Win"   value={fmtDur(avgDurWin)}  accent="text-brand-win" sm />
          <Stat label="Avg Loss"  value={fmtDur(avgDurLoss)} accent="text-brand-loss" sm />
          <Stat label="Avg BE"    value={fmtDur(avgDurBE)}   accent="text-brand-be" sm />
          <Stat label="Avg Long"  value={fmtDur(avgDurLongArr.length?Math.round(avgDurLongArr.reduce((s,v)=>s+v,0)/avgDurLongArr.length):null)} sm />
          <Stat label="Avg Short" value={fmtDur(avgDurShortArr.length?Math.round(avgDurShortArr.reduce((s,v)=>s+v,0)/avgDurShortArr.length):null)} sm />
          <Stat label="Longest Win"  value={fmtDur(longWin)}  accent="text-brand-win" sm />
          <Stat label="Longest Loss" value={fmtDur(longLoss)} accent="text-brand-loss" sm />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Stat label="Avg 1R+ Duration" value={fmtDur(avgDurR(1))} sm />
          <Stat label="Avg 2R+ Duration" value={fmtDur(avgDurR(2))} sm />
          <Stat label="Avg 3R+ Duration" value={fmtDur(avgDurR(3))} sm />
          <Stat label="Shortest Win"     value={fmtDur(shortWin)}   accent="text-brand-win" sm />
        </div>
      </Section>

      {/* Insights */}
      <Section title="Insights">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <Stat label="Most Traded Ticker"  value={mostTicker ?? '—'} sm />
          <Stat label="Highest WR Ticker"   value={highWRTick ?? '—'} accent="text-brand-win" sm />
          <Stat label="Lowest WR Ticker"    value={lowWRTick  ?? '—'} accent="text-brand-loss" sm />
          <Stat label="Most Traded TF"      value={mostTF     ?? '—'} sm />
          <Stat label="Best Day of Week"    value={bestDOW    ?? '—'} accent="text-brand-accent" sm />
        </div>
      </Section>

      {/* Breakdowns */}
      <Section title="Breakdowns">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <BreakdownTable title="By Ticker"    keyLabel="Ticker"    data={calcBreakdown(filtered, 'ticker')} />
          <BreakdownTable title="By Strategy"  keyLabel="Strategy"  data={calcBreakdown(filtered, 'strategy')} />
          <BreakdownTable title="By Session"   keyLabel="Session"   data={calcBreakdown(filtered, 'session', ['Asian','London','New York','Mixed'])} />
          <BreakdownTable title="By Direction" keyLabel="Direction" data={calcBreakdown(filtered, 'direction', ['Long','Short'])} />
          <BreakdownTable title="By Timeframe" keyLabel="Timeframe" data={calcBreakdown(filtered, 'timeframe')} />
          <BreakdownTable title="By Size"      keyLabel="Size"      data={calcBreakdown(filtered, 'size', ['Full','Half','Quarter','Micro'])} />
          <BreakdownTable title="By MSS"       keyLabel="MSS"       data={calcBreakdown(filtered, t => t.mss ? 'Yes' : 'No', ['Yes','No'])} />
          <BreakdownTable title="By Rating"    keyLabel="Rating"    data={calcBreakdown(filtered, t => t.rating ? String(t.rating) : null, ['1','2','3','4','5'])} />
          <BreakdownTable title="By Day of Week" keyLabel="Day"     data={dowData} />
          <BreakdownTable title="By Duration Bucket" keyLabel="Duration (min)" data={calcBreakdown(filtered, t => durBucket(getDurationMins(t)), DUR_BUCKETS)} />
          <BreakdownTable title="By Hour of Day" keyLabel="Hour"   data={calcBreakdown(filtered, t => { const h = getHour(t.entry_time); return h != null ? hourLabel(h) : null })} />
        </div>
      </Section>

      {/* Daily */}
      <Section title="Daily">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          <Stat label="Days Traded"   value={dailyData.length}  sm />
          <Stat label="Winning Days"  value={winDays.length}   accent="text-brand-win" sm />
          <Stat label="Losing Days"   value={lossDays.length}  accent="text-brand-loss" sm />
          <Stat label="Win Day Rate"  value={dailyData.length ? `${(winDays.length/dailyData.length*100).toFixed(0)}%` : '—'} accent="text-brand-win" sm />
          <Stat label="Avg R / Day"   value={fmtR(avgRPerDay)}  accent={avgRPerDay&&avgRPerDay>=0?'text-brand-win':'text-brand-loss'} sm />
          <Stat label="Best Day R"    value={fmtR(bestDay)}    accent="text-brand-win" sm />
          <Stat label="Worst Day R"   value={fmtR(worstDay)}   accent="text-brand-loss" sm />
          <Stat label="Best Weekday"  value={bestDOW ?? '—'}   accent="text-brand-accent" sm />
        </div>
        <PeriodTable title="Daily Log" data={dailyData} />
      </Section>

      {/* Weekly */}
      <Section title="Weekly">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          <Stat label="Weeks Traded"    value={weeklyData.length}  sm />
          <Stat label="Winning Weeks"   value={winWeeks.length}   accent="text-brand-win" sm />
          <Stat label="Win Week Rate"   value={weeklyData.length ? `${(winWeeks.length/weeklyData.length*100).toFixed(0)}%` : '—'} accent="text-brand-win" sm />
          <Stat label="Avg R / Week"    value={fmtR(avgRPerWeek)} accent={avgRPerWeek&&avgRPerWeek>=0?'text-brand-win':'text-brand-loss'} sm />
          <Stat label="Avg Trades/Week" value={weeklyData.length ? (filtered.length/weeklyData.length).toFixed(1) : '—'} sm />
          <Stat label="Best Week R"     value={fmtR(bestWeek)}   accent="text-brand-win" sm />
          <Stat label="Worst Week R"    value={fmtR(worstWeek)}  accent="text-brand-loss" sm />
        </div>
        <PeriodTable title="Weekly Log" data={weeklyData} />
      </Section>

      {/* Monthly */}
      <Section title="Monthly">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          <Stat label="Months Traded"    value={monthlyData.length}  sm />
          <Stat label="Winning Months"   value={winMonths.length}   accent="text-brand-win" sm />
          <Stat label="Win Month Rate"   value={monthlyData.length ? `${(winMonths.length/monthlyData.length*100).toFixed(0)}%` : '—'} accent="text-brand-win" sm />
          <Stat label="Avg R / Month"    value={fmtR(avgRPerMonth)} accent={avgRPerMonth&&avgRPerMonth>=0?'text-brand-win':'text-brand-loss'} sm />
          <Stat label="Avg Trades/Month" value={monthlyData.length ? (filtered.length/monthlyData.length).toFixed(1) : '—'} sm />
          <Stat label="Best Month"       value={monthlyData.length ? [...monthlyData].sort((a,b)=>b.totalR-a.totalR)[0].period : '—'} accent="text-brand-win" sm />
          <Stat label="Worst Month"      value={monthlyData.length ? [...monthlyData].sort((a,b)=>a.totalR-b.totalR)[0].period : '—'} accent="text-brand-loss" sm />
          <Stat label="Avg R Winning Mo" value={winMonths.length ? fmtR(+(winMonths.reduce((s,m)=>s+m.totalR,0)/winMonths.length).toFixed(2)) : '—'} accent="text-brand-win" sm />
        </div>
        <PeriodTable title="Monthly Log" data={monthlyData} />
      </Section>

      {/* Yearly */}
      <Section title="Yearly">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          <Stat label="Years Traded"    value={yearlyData.length}  sm />
          <Stat label="Winning Years"   value={winYears.length}   accent="text-brand-win" sm />
          <Stat label="Win Year Rate"   value={yearlyData.length ? `${(winYears.length/yearlyData.length*100).toFixed(0)}%` : '—'} accent="text-brand-win" sm />
          <Stat label="Avg R / Year"    value={fmtR(avgRPerYear)} accent={avgRPerYear&&avgRPerYear>=0?'text-brand-win':'text-brand-loss'} sm />
          <Stat label="Avg Trades/Year" value={yearlyData.length ? (filtered.length/yearlyData.length).toFixed(1) : '—'} sm />
          <Stat label="Best Year"       value={yearlyData.length ? [...yearlyData].sort((a,b)=>b.totalR-a.totalR)[0].period : '—'} accent="text-brand-win" sm />
          <Stat label="Worst Year"      value={yearlyData.length ? [...yearlyData].sort((a,b)=>a.totalR-b.totalR)[0].period : '—'} accent="text-brand-loss" sm />
        </div>
        <PeriodTable title="Yearly Log" data={yearlyData} />
      </Section>

      {/* ── Pair Analysis ── */}
      <Section title="Pair Analysis">
        {/* Pair summary cards */}
        {tickerBD.length === 0 ? (
          <p className="text-sm text-brand-muted">No trades yet.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 mb-6">
              {tickerBD.map(t => {
                const active = selectedPair === t.key
                return (
                  <button
                    key={t.key}
                    onClick={() => setSelectedPair(active ? null : t.key)}
                    className={`cursor-pointer select-none text-left p-5 rounded-2xl border transition-all shadow-sm ${
                      active
                        ? 'bg-brand-text border-brand-text text-white'
                        : 'bg-white border-brand-border hover:border-brand-text/30'
                    }`}
                  >
                    <div className={`font-black text-base mb-2 tracking-tight ${active ? 'text-white' : 'text-brand-text'}`}>{t.key}</div>
                    <div className="space-y-1 text-xs">
                      <div className={active ? 'text-white/60' : 'text-brand-muted'}>{t.trades} trades</div>
                      <div className={t.winRate>=60?'text-brand-win':t.winRate>=45?'text-brand-be':'text-brand-loss'}>
                        {t.winRate.toFixed(1)}% win
                      </div>
                      <div className={`font-mono font-bold ${t.totalR>0?'text-brand-win':t.totalR<0?'text-brand-loss':'text-brand-muted'}`}>
                        {fmtR(t.totalR)}
                      </div>
                      <div className={active ? 'text-white/60' : 'text-brand-muted'}>
                        PF: {t.trades && t.losses > 0
                          ? (Math.abs(t.wins > 0 ? t.totalR / Math.abs(t.losses > 0 ? calcBreakdown(filtered.filter(x=>x.ticker===t.key),'ticker')[0]?.totalR||0 : 0) : 0)).toFixed(2)
                          : '—'}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Drill-down for selected pair */}
            {selectedPair && (() => {
              const pt = filtered.filter(x => x.ticker === selectedPair)
              const pWithR  = pt.filter(x => x.r_multiple != null)
              const pWins   = pWithR.filter(x => x.r_multiple > 0)
              const pLosses = pWithR.filter(x => x.r_multiple < 0)
              const pBEs    = pWithR.filter(x => x.r_multiple === 0)

              const pGrossProfit  = +pWins.reduce((s,x)=>s+x.r_multiple,0).toFixed(2)
              const pGrossLoss    = +pLosses.reduce((s,x)=>s+x.r_multiple,0).toFixed(2)
              const pNetR         = +(pGrossProfit+pGrossLoss).toFixed(2)
              const pPF           = pGrossLoss !== 0 ? +(Math.abs(pGrossProfit/pGrossLoss)).toFixed(2) : null
              const pWinRate      = pWithR.length ? (pWins.length/pWithR.length)*100 : 0
              const pAvgWin       = pWins.length   ? +(pGrossProfit/pWins.length).toFixed(2) : 0
              const pAvgLoss      = pLosses.length ? +(pGrossLoss/pLosses.length).toFixed(2) : 0
              const pExpectancy   = pWithR.length  ? +(pNetR/pWithR.length).toFixed(2) : 0
              const pWLRatio      = pAvgLoss !== 0 ? +(Math.abs(pAvgWin/pAvgLoss)).toFixed(2) : null
              const pBestTrade    = pWins.length   ? Math.max(...pWins.map(x=>x.r_multiple))   : null
              const pWorstTrade   = pLosses.length ? Math.min(...pLosses.map(x=>x.r_multiple)) : null

              const p1R = pWithR.filter(x=>x.r_multiple>=1)
              const p2R = pWithR.filter(x=>x.r_multiple>=2)
              const p3R = pWithR.filter(x=>x.r_multiple>=3)
              const p4R = pWithR.filter(x=>x.r_multiple>=4)
              const p5R = pWithR.filter(x=>x.r_multiple>=5)

              const pMonthly = periodBreakdown(pt, x => x.entry_date?.slice(0,7))
              const pWeekly  = periodBreakdown(pt, x => getWeekKey(x.entry_date))

              return (
                <div className="space-y-5 rounded-2xl border border-brand-border bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-black text-brand-text tracking-tight">{selectedPair}</h3>
                    <span className="text-xs text-brand-muted">{pt.length} trades</span>
                    <button onClick={() => setSelectedPair(null)} className="cursor-pointer ml-auto text-xs text-brand-muted hover:text-brand-text font-semibold transition-colors">✕ Close</button>
                  </div>

                  {/* Hero stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <Stat hero label="Net R"         value={fmtR(pNetR)}       accent={pNetR>=0?'text-brand-win':'text-brand-loss'} />
                    <Stat hero label="Win Rate"      value={`${pWinRate.toFixed(1)}%`} accent={pWinRate>=60?'text-brand-win':pWinRate>=45?'text-brand-be':'text-brand-loss'} />
                    <Stat hero label="Profit Factor" value={pPF ?? '—'}        accent={pPF&&pPF>=1?'text-brand-win':'text-brand-loss'} />
                    <Stat hero label="Expectancy"    value={fmtR(pExpectancy)} accent={pExpectancy>=0?'text-brand-win':'text-brand-loss'} />
                  </div>

                  {/* Secondary stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
                    <Stat label="Wins"        value={pWins.length}   accent="text-brand-win" sm />
                    <Stat label="Losses"      value={pLosses.length} accent="text-brand-loss" sm />
                    <Stat label="Breakevens"  value={pBEs.length}    accent="text-brand-be" sm />
                    <Stat label="Avg Win R"   value={fmtR(pAvgWin)}  accent="text-brand-win" sm />
                    <Stat label="Avg Loss R"  value={fmtR(pAvgLoss)} accent="text-brand-loss" sm />
                    <Stat label="W/L Ratio"   value={pWLRatio ? pWLRatio.toFixed(2) : '—'} sm />
                    <Stat label="Best Trade"  value={fmtR(pBestTrade)}  accent="text-brand-win" sm />
                    <Stat label="Worst Trade" value={fmtR(pWorstTrade)} accent="text-brand-loss" sm />
                  </div>

                  {/* R threshold win rates */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                    <Stat label="1R Win Rate" value={pWithR.length ? `${(p1R.length/pWithR.length*100).toFixed(1)}%` : '—'} accent="text-brand-win" sm />
                    <Stat label="2R Win Rate" value={pWithR.length ? `${(p2R.length/pWithR.length*100).toFixed(1)}%` : '—'} accent="text-brand-win" sm />
                    <Stat label="3R Win Rate" value={pWithR.length ? `${(p3R.length/pWithR.length*100).toFixed(1)}%` : '—'} accent="text-brand-win" sm />
                    <Stat label="4R Win Rate" value={pWithR.length ? `${(p4R.length/pWithR.length*100).toFixed(1)}%` : '—'} accent="text-brand-win" sm />
                    <Stat label="5R Win Rate" value={pWithR.length ? `${(p5R.length/pWithR.length*100).toFixed(1)}%` : '—'} accent="text-brand-win" sm />
                  </div>

                  {/* Breakdowns */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <BreakdownTable title="By Direction" keyLabel="Direction" data={calcBreakdown(pt, 'direction', ['Long','Short'])} />
                    <BreakdownTable title="By Session"   keyLabel="Session"   data={calcBreakdown(pt, 'session', ['Asian','London','New York','Mixed'])} />
                    <BreakdownTable title="By Timeframe" keyLabel="Timeframe" data={calcBreakdown(pt, 'timeframe')} />
                    <BreakdownTable title="By Rating"    keyLabel="Rating"    data={calcBreakdown(pt, x => x.rating ? String(x.rating) : null, ['1','2','3','4','5'])} />
                  </div>

                  {/* Period tables */}
                  <PeriodTable title="Monthly Log" data={pMonthly} />
                  <PeriodTable title="Weekly Log"  data={pWeekly} />
                </div>
              )
            })()}
          </>
        )}
      </Section>

    </div>
  )
}
