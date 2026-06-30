import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { TimePicker } from '@mui/x-date-pickers/TimePicker'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import dayjs from 'dayjs'

function TimeInput({ value, onChange }) {
  const dayjsVal = value ? dayjs(`2000-01-01T${value}`) : null
  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <TimePicker
        value={dayjsVal}
        onChange={v => onChange(v ? v.format('HH:mm') : '')}
        slotProps={{
          textField: {
            size: 'small',
            fullWidth: true,
            sx: {
              '& .MuiInputBase-root': {
                fontSize: '0.875rem',
                borderRadius: '0.5rem',
                backgroundColor: 'white',
                border: '1px solid #e2e2e2',
                transition: 'border-color 0.15s, box-shadow 0.15s',
                '&:hover': { borderColor: '#aaa' },
                '&.Mui-focused': { borderColor: '#111', boxShadow: '0 0 0 3px rgba(17,17,17,0.07)' },
              },
              '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
              '& .MuiInputLabel-root': { display: 'none' },
              '& .MuiInputBase-input': { padding: '7px 12px', fontSize: '0.875rem' },
              '& .MuiInputAdornment-root .MuiSvgIcon-root': { fontSize: '1.1rem', color: '#888' },
            },
          },
        }}
      />
    </LocalizationProvider>
  )
}

const BASE_TICKERS = ['XAUUSD', 'BTC/USD', 'USOIL', 'NAS100', 'EURUSD', 'GBPUSD', 'ETH/USD', 'XAGUSD']
const TIMEFRAMES = ['15s', '30s', '1m', '2m', '3m', '5m', '15m', '30m', '1H', '4H', 'D']
const DEFAULT_STRATEGIES = ['LSD', 'ILM', 'ORB', 'FCR', 'Strategy X']
const SESSIONS = ['London', 'New York', 'Asian', 'Mixed']
const SIZES = ['Full', 'Half', 'Quarter', 'Micro']
const UNIT_SIZE = 5 // $5 per unit

function getISTDate() {
  const now = new Date()
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000
  const istMs = utcMs + 5.5 * 60 * 60 * 1000
  return new Date(istMs).toISOString().slice(0, 10)
}

function getSessionFromIST(timeStr) {
  if (!timeStr) return null
  const [h, m] = timeStr.split(':').map(Number)
  const mins = h * 60 + m
  if (mins >= 180 && mins < 750)  return 'Asian'
  if (mins >= 750 && mins < 1050) return 'London'
  if (mins >= 1050 && mins < 1230) return 'Mixed'
  return 'New York'
}

function makeDefaultForm() {
  const today = getISTDate()
  return {
    entry_date: today, entry_time: '',
    exit_date: today,  exit_time: '',
    ticker: 'XAUUSD', timeframe: '5m', direction: 'Long',
    mss: false, size: 'Full', strategy: 'LSD',
    rating: 3, r_multiple: '', profit_usd: '', tradingview_url: '', notes: '', session: 'New York',
  }
}

const labelCls = 'block text-xs font-bold text-brand-muted uppercase tracking-[0.12em] mb-1.5'
const Field = ({ label, children }) => (
  <div>
    <label className={labelCls}>{label}</label>
    {children}
  </div>
)

export default function PortfolioJournal() {
  const [form, setForm]       = useState(makeDefaultForm)
  const [saving, setSaving]   = useState(false)
  const [toast, setToast]     = useState(null)
  const [recent, setRecent]   = useState([])
  const [editId, setEditId]   = useState(null)
  const [customTickerInput, setCustomTickerInput] = useState('')

  const [savedTickers, setSavedTickers] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pf_custom_tickers') || '[]') } catch { return [] }
  })
  const DEFAULT_TICKERS = [...BASE_TICKERS, ...savedTickers.filter(t => !BASE_TICKERS.includes(t))]

  const [strategies, setStrategies] = useState(() => {
    try {
      const saved = localStorage.getItem('pf_strategies')
      return saved ? JSON.parse(saved) : DEFAULT_STRATEGIES
    } catch { return DEFAULT_STRATEGIES }
  })
  const [editingStratIdx, setEditingStratIdx] = useState(null)
  const [editingStratVal, setEditingStratVal] = useState('')
  const [newStratInput, setNewStratInput]     = useState('')

  useEffect(() => { fetchRecent() }, [])
  useEffect(() => { localStorage.setItem('pf_strategies', JSON.stringify(strategies)) }, [strategies])
  useEffect(() => {
    const session = getSessionFromIST(form.entry_time)
    if (session) set('session', session)
  }, [form.entry_time])

  // Auto-compute R multiple from profit_usd when profit changes
  useEffect(() => {
    if (form.profit_usd !== '' && form.profit_usd !== null) {
      const r = (parseFloat(form.profit_usd) / UNIT_SIZE).toFixed(2)
      setForm(f => ({ ...f, r_multiple: isNaN(r) ? '' : r }))
    }
  }, [form.profit_usd])

  async function fetchRecent() {
    const { data } = await supabase.from('portfolio_trades').select('*').order('entry_date', { ascending: false }).limit(10)
    setRecent(data || [])
  }

  function set(field, val) { setForm(f => ({ ...f, [field]: val })) }
  function handleTickerChip(t) { set('ticker', t); setCustomTickerInput('') }
  function handleCustomTicker(val) { setCustomTickerInput(val); if (val.trim()) set('ticker', val.trim().toUpperCase()) }

  function saveStrategy(idx, newName) {
    const trimmed = newName.trim()
    if (!trimmed) { setEditingStratIdx(null); return }
    const updated = [...strategies]
    if (form.strategy === strategies[idx]) set('strategy', trimmed)
    updated[idx] = trimmed
    setStrategies(updated)
    setEditingStratIdx(null)
  }

  function addStrategy() {
    const trimmed = newStratInput.trim()
    if (!trimmed || strategies.includes(trimmed)) return
    setStrategies([...strategies, trimmed])
    set('strategy', trimmed)
    setNewStratInput('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    const payload = {
      entry_date: form.entry_date, entry_time: form.entry_time || null,
      exit_date: form.exit_date || null, exit_time: form.exit_time || null,
      ticker: form.ticker, timeframe: form.timeframe, direction: form.direction,
      mss: form.mss, size: form.size, strategy: form.strategy,
      rating: Number(form.rating),
      r_multiple: form.r_multiple !== '' ? Number(form.r_multiple) : null,
      profit_usd: form.profit_usd !== '' ? Number(form.profit_usd) : null,
      tradingview_url: form.tradingview_url || null,
      notes: form.notes || null, session: form.session,
    }
    let error
    if (editId) {
      ;({ error } = await supabase.from('portfolio_trades').update(payload).eq('id', editId))
    } else {
      ;({ error } = await supabase.from('portfolio_trades').insert(payload))
    }
    setSaving(false)
    if (error) {
      setToast({ type: 'error', msg: error.message })
    } else {
      // Persist custom ticker if new
      if (customTickerInput.trim() && !DEFAULT_TICKERS.includes(form.ticker)) {
        const updated = [...new Set([...savedTickers, form.ticker])]
        setSavedTickers(updated)
        localStorage.setItem('pf_custom_tickers', JSON.stringify(updated))
      }
      setToast({ type: 'success', msg: editId ? 'Trade updated!' : 'Trade saved!' })
      setForm(makeDefaultForm())
      setCustomTickerInput('')
      setEditId(null)
      fetchRecent()
    }
    setTimeout(() => setToast(null), 3000)
  }

  function loadEdit(trade) {
    setEditId(trade.id)
    const isDefault = DEFAULT_TICKERS.includes(trade.ticker)
    setCustomTickerInput(isDefault ? '' : (trade.ticker || ''))
    setForm({
      entry_date: trade.entry_date || '', entry_time: trade.entry_time || '',
      exit_date: trade.exit_date || '',   exit_time: trade.exit_time || '',
      ticker: trade.ticker || 'XAUUSD',   timeframe: trade.timeframe || '5m',
      direction: trade.direction || 'Long', mss: trade.mss || false,
      size: trade.size || 'Full', strategy: trade.strategy || strategies[0] || 'LSD',
      rating: trade.rating || 3,
      r_multiple: trade.r_multiple ?? '',
      profit_usd: trade.profit_usd ?? '',
      tradingview_url: trade.tradingview_url || '', notes: trade.notes || '',
      session: trade.session || 'New York',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleDelete(id) {
    if (!confirm('Delete this trade?')) return
    await supabase.from('portfolio_trades').delete().eq('id', id)
    fetchRecent()
  }

  const inputCls = 'w-full bg-white border border-brand-border rounded-lg px-3 py-2.5 text-sm text-brand-text placeholder-brand-muted/40 focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent/10 transition-all'

  const Chip = ({ label, active, onClick, color }) => (
    <button type="button" onClick={onClick} className={`cursor-pointer select-none px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-100 border active:scale-[0.96] ${
      active
        ? color === 'green' ? 'bg-brand-win text-white border-brand-win shadow-sm'
        : color === 'red'   ? 'bg-brand-loss text-white border-brand-loss shadow-sm'
        : 'bg-brand-text text-white border-brand-text shadow-sm'
        : 'bg-white border-brand-border text-brand-muted hover:border-brand-text/30 hover:text-brand-text'
    }`}>
      {label}
    </button>
  )

  const profitNum = parseFloat(form.profit_usd)
  const profitColor = isNaN(profitNum) ? 'text-brand-muted' : profitNum > 0 ? 'text-brand-win' : profitNum < 0 ? 'text-brand-loss' : 'text-brand-be'

  return (
    <div className="w-full px-8 py-6">

      {toast && (
        <div className={`fixed top-20 right-6 z-50 px-4 py-2.5 rounded-lg text-sm font-semibold shadow-lg border ${
          toast.type === 'success' ? 'bg-white border-brand-win/30 text-brand-win' : 'bg-white border-brand-loss/30 text-brand-loss'
        }`}>
          {toast.msg}
        </div>
      )}

      <div className="mb-5">
        <p className="text-[10px] font-bold text-brand-muted uppercase tracking-[0.15em] mb-0.5">My Portfolio</p>
        <h1 className="text-xl font-black text-brand-text tracking-tight">
          {editId ? 'Edit Trade' : 'Log a Trade'}
        </h1>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="flex gap-5 items-start">

          {/* LEFT PANEL */}
          <div className="w-[360px] flex-shrink-0 bg-white border border-brand-border rounded-2xl p-6 space-y-5 shadow-sm">

            <div className="grid grid-cols-2 gap-2">
              <Field label="Entry Date">
                <input type="date" className={inputCls} value={form.entry_date} onChange={e => set('entry_date', e.target.value)} required />
              </Field>
              <Field label="Entry Time">
                <TimeInput value={form.entry_time} onChange={v => set('entry_time', v)} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Exit Date">
                <input type="date" className={inputCls} value={form.exit_date} onChange={e => set('exit_date', e.target.value)} />
              </Field>
              <Field label="Exit Time">
                <TimeInput value={form.exit_time} onChange={v => set('exit_time', v)} />
              </Field>
            </div>

            <div className="border-t border-brand-border" />

            <Field label="Direction">
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => set('direction', 'Long')}
                  className={`cursor-pointer select-none py-3 rounded-lg text-sm font-black transition-all border active:scale-[0.97] ${form.direction === 'Long' ? 'bg-brand-win text-white border-brand-win shadow-sm' : 'bg-white border-brand-border text-brand-muted hover:text-brand-text'}`}>
                  ▲ Long
                </button>
                <button type="button" onClick={() => set('direction', 'Short')}
                  className={`cursor-pointer select-none py-3 rounded-lg text-sm font-black transition-all border active:scale-[0.97] ${form.direction === 'Short' ? 'bg-brand-loss text-white border-brand-loss shadow-sm' : 'bg-white border-brand-border text-brand-muted hover:text-brand-text'}`}>
                  ▼ Short
                </button>
              </div>
            </Field>

            <Field label="MSS Confirmed">
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => set('mss', !form.mss)}
                  className={`cursor-pointer relative w-10 h-5 rounded-full transition-all duration-200 ${form.mss ? 'bg-brand-text' : 'bg-brand-border'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${form.mss ? 'left-5' : 'left-0.5'}`} />
                </button>
                <span className={`text-sm font-semibold ${form.mss ? 'text-brand-text' : 'text-brand-muted'}`}>{form.mss ? 'Yes' : 'No'}</span>
              </div>
            </Field>

            <div className="border-t border-brand-border" />

            {/* Profit USD — primary input */}
            <Field label="Profit / Loss (USD)">
              <div className="relative">
                <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold ${profitColor}`}>$</span>
                <input
                  type="number" step="0.01"
                  className={`${inputCls} pl-7 font-mono font-bold ${profitColor}`}
                  placeholder="e.g. -5.89 or 8.24"
                  value={form.profit_usd}
                  onChange={e => set('profit_usd', e.target.value)}
                />
              </div>
              {form.profit_usd !== '' && !isNaN(profitNum) && (
                <p className="text-[10px] text-brand-muted mt-1 font-mono">
                  = <span className={`font-bold ${profitColor}`}>{(profitNum / UNIT_SIZE).toFixed(2)}R</span>
                  {' '}at $5/unit
                </p>
              )}
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Rating">
                <div className="flex gap-1">
                  {[1,2,3,4,5].map(n => (
                    <button key={n} type="button" onClick={() => set('rating', n)}
                      className={`cursor-pointer select-none w-9 h-9 rounded-lg text-xs font-bold transition-all border ${form.rating >= n ? 'bg-brand-text text-white border-brand-text' : 'bg-white border-brand-border text-brand-muted'}`}>
                      {n}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="R Multiple">
                <input type="number" step="0.01" className={`${inputCls} font-mono`} placeholder="auto" value={form.r_multiple}
                  onChange={e => set('r_multiple', e.target.value)} />
              </Field>
            </div>

            <Field label="TradingView URL">
              <input type="url" className={inputCls} placeholder="tradingview.com/x/..." value={form.tradingview_url} onChange={e => set('tradingview_url', e.target.value)} />
            </Field>

            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={saving}
                className="cursor-pointer select-none flex-1 bg-brand-text text-white font-black text-base py-3.5 px-6 rounded-xl shadow-sm hover:bg-brand-bright active:scale-[0.98] transition-all duration-150 disabled:opacity-50">
                {saving ? 'Saving...' : editId ? 'Update' : 'Save Trade'}
              </button>
              {editId && (
                <button type="button"
                  onClick={() => { setForm(makeDefaultForm()); setCustomTickerInput(''); setEditId(null) }}
                  className="cursor-pointer select-none px-4 py-3 rounded-xl border-2 border-brand-border text-brand-muted hover:text-brand-text transition-all text-sm font-semibold active:scale-[0.98]">
                  Cancel
                </button>
              )}
            </div>
          </div>

          {/* RIGHT PANEL */}
          <div className="flex-1 bg-white border border-brand-border rounded-2xl p-6 space-y-5 shadow-sm">

            <Field label="Ticker">
              <div className="flex flex-wrap gap-2">
                {DEFAULT_TICKERS.map(t => (
                  <Chip key={t} label={t} active={form.ticker === t && !customTickerInput} onClick={() => handleTickerChip(t)} />
                ))}
                <input
                  className={`px-3 py-2 rounded-lg text-xs border bg-white text-brand-text focus:outline-none w-28 placeholder-brand-muted/40 transition-all ${customTickerInput ? 'border-brand-text ring-1 ring-brand-text/10' : 'border-brand-border focus:border-brand-text/30'}`}
                  placeholder="Other…"
                  value={customTickerInput}
                  onChange={e => handleCustomTicker(e.target.value)}
                />
              </div>
            </Field>

            <div className="border-t border-brand-border" />

            <Field label="Timeframe">
              <div className="flex flex-wrap gap-2">
                {TIMEFRAMES.map(opt => <Chip key={opt} label={opt} active={form.timeframe === opt} onClick={() => set('timeframe', opt)} />)}
              </div>
            </Field>

            <div className="border-t border-brand-border" />

            <div className="grid grid-cols-2 gap-6">
              <Field label="Position Size">
                <div className="flex flex-wrap gap-2">
                  {SIZES.map(opt => <Chip key={opt} label={opt} active={form.size === opt} onClick={() => set('size', opt)} />)}
                </div>
              </Field>
              <Field label={`Session${form.entry_time ? ' · auto' : ''}`}>
                <div className="flex flex-wrap gap-2">
                  {SESSIONS.map(opt => <Chip key={opt} label={opt} active={form.session === opt} onClick={() => set('session', opt)} />)}
                </div>
              </Field>
            </div>

            <div className="border-t border-brand-border" />

            <Field label="Strategy">
              <div className="flex flex-wrap gap-2 items-center">
                {strategies.map((s, idx) =>
                  editingStratIdx === idx ? (
                    <form key={idx} onSubmit={e => { e.preventDefault(); saveStrategy(idx, editingStratVal) }} className="flex gap-1 items-center">
                      <input autoFocus
                        className="px-2 py-1.5 rounded-lg text-xs bg-white border border-brand-text text-brand-text focus:outline-none w-28"
                        value={editingStratVal}
                        onChange={e => setEditingStratVal(e.target.value)}
                        onBlur={() => saveStrategy(idx, editingStratVal)}
                      />
                      <button type="submit" className="cursor-pointer text-xs text-brand-text px-1">✓</button>
                    </form>
                  ) : (
                    <div key={idx} className={`group flex items-center rounded-lg text-xs font-semibold transition-all border ${
                      form.strategy === s ? 'bg-brand-text text-white border-brand-text shadow-sm' : 'bg-white border-brand-border text-brand-muted hover:border-brand-text/30 hover:text-brand-text'
                    }`}>
                      <button type="button" onClick={() => set('strategy', s)} className="cursor-pointer select-none pl-3 pr-1.5 py-2">{s}</button>
                      <button type="button" title="Rename"
                        onClick={() => { setEditingStratIdx(idx); setEditingStratVal(s) }}
                        className={`cursor-pointer pr-2 py-2 opacity-0 group-hover:opacity-100 text-xs transition-opacity ${form.strategy === s ? 'text-white/50 hover:text-white' : 'text-brand-muted hover:text-brand-text'}`}>✎</button>
                    </div>
                  )
                )}
                <div className="flex gap-1 items-center">
                  <input
                    className="px-2 py-1.5 rounded-lg text-xs bg-white border border-brand-border text-brand-text focus:outline-none focus:border-brand-text/30 w-24 placeholder-brand-muted/40"
                    placeholder="+ Add…"
                    value={newStratInput}
                    onChange={e => setNewStratInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addStrategy())}
                  />
                  {newStratInput.trim() && (
                    <button type="button" onClick={addStrategy} className="cursor-pointer text-xs text-brand-text px-1">✓</button>
                  )}
                </div>
              </div>
            </Field>

            <div className="border-t border-brand-border" />

            <Field label="Notes">
              <textarea
                className={`${inputCls} h-24 resize-none`}
                placeholder="What happened? What did you do well / poorly?"
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
              />
            </Field>
          </div>
        </div>
      </form>

      {/* Recent trades */}
      {recent.length > 0 && (
        <div className="mt-6">
          <h2 className="text-[10px] font-bold text-brand-muted uppercase tracking-[0.15em] mb-3">Recent Entries</h2>
          <div className="rounded-2xl border border-brand-border overflow-hidden bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-border bg-brand">
                  {['Date','Ticker','Dir','TF','Strategy','P/L ($)','R','Rating','MSS',''].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-[10px] font-black text-brand-muted uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recent.map((t, i) => {
                  const pl = t.profit_usd
                  const plColor = pl > 0 ? 'text-brand-win' : pl < 0 ? 'text-brand-loss' : 'text-brand-be'
                  return (
                    <tr key={t.id} className={`border-t border-brand-border transition-colors hover:bg-brand-raised ${i % 2 === 0 ? 'bg-white' : 'bg-brand/60'}`}>
                      <td className="px-3 py-2 text-brand-muted text-xs tabular-nums">{t.entry_date}</td>
                      <td className="px-3 py-2 font-bold text-brand-text text-xs">{t.ticker}</td>
                      <td className={`px-3 py-2 font-bold text-xs ${t.direction === 'Long' ? 'text-brand-win' : 'text-brand-loss'}`}>{t.direction}</td>
                      <td className="px-3 py-2 text-brand-muted text-xs">{t.timeframe}</td>
                      <td className="px-3 py-2 text-brand-text text-xs">{t.strategy}</td>
                      <td className={`px-3 py-2 font-mono font-black text-xs ${plColor}`}>
                        {pl != null ? (pl >= 0 ? `+$${pl.toFixed(2)}` : `-$${Math.abs(pl).toFixed(2)}`) : '—'}
                      </td>
                      <td className={`px-3 py-2 font-mono font-black text-xs ${t.r_multiple > 0 ? 'text-brand-win' : t.r_multiple < 0 ? 'text-brand-loss' : 'text-brand-be'}`}>
                        {t.r_multiple != null ? (t.r_multiple > 0 ? `+${t.r_multiple}R` : `${t.r_multiple}R`) : '—'}
                      </td>
                      <td className="px-3 py-2 text-brand-muted text-xs">{'★'.repeat(t.rating || 0)}</td>
                      <td className="px-3 py-2">
                        {t.mss ? <span className="text-[10px] font-black bg-brand-text text-white px-1.5 py-0.5 rounded">YES</span>
                                : <span className="text-brand-muted text-[10px]">—</span>}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <button onClick={() => loadEdit(t)} className="cursor-pointer text-[11px] text-brand-muted hover:text-brand-text mr-3 font-semibold transition-colors">Edit</button>
                        <button onClick={() => handleDelete(t.id)} className="cursor-pointer text-[11px] text-brand-muted hover:text-brand-loss font-semibold transition-colors">Del</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
