import { useEffect, useState, useRef } from 'react'
import { AgGridReact } from 'ag-grid-react'
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-alpine.css'

ModuleRegistry.registerModules([AllCommunityModule])
import { supabase } from '../supabase'

function PLCell({ value }) {
  if (value == null) return <span className="text-brand-muted">—</span>
  const cls = value > 0 ? 'text-brand-win' : value < 0 ? 'text-brand-loss' : 'text-brand-be'
  const fmt = value > 0 ? `+$${value.toFixed(2)}` : value < 0 ? `-$${Math.abs(value).toFixed(2)}` : `$0.00`
  return <span className={`font-mono font-bold ${cls}`}>{fmt}</span>
}

function RCell({ value }) {
  if (value == null) return <span className="text-brand-muted">—</span>
  const cls = value > 0 ? 'text-brand-win' : value < 0 ? 'text-brand-loss' : 'text-brand-be'
  return <span className={`font-mono font-bold ${cls}`}>{value > 0 ? `+${value}` : value}R</span>
}

function DirCell({ value }) {
  if (!value) return null
  return <span className={value === 'Long' ? 'text-brand-win font-semibold' : 'text-brand-loss font-semibold'}>{value}</span>
}

function TVCell({ value }) {
  if (!value) return <span className="text-brand-muted/40">—</span>
  return <a href={value} target="_blank" rel="noreferrer" className="text-brand-accent hover:text-brand-bright hover:underline text-xs transition-colors">View</a>
}

function MSSCell({ value }) {
  return value
    ? <span className="text-brand-accent font-black text-xs bg-brand-accent/10 px-1.5 py-0.5 rounded">YES</span>
    : <span className="text-brand-muted/40 text-xs">NO</span>
}

function RatingCell({ value }) {
  if (!value) return null
  return <span className="text-brand-accent">{'★'.repeat(value)}{'☆'.repeat(5 - value)}</span>
}

const colDefs = [
  { field: 'entry_date', headerName: 'Date', width: 110, sort: 'desc', filter: 'agDateColumnFilter' },
  { field: 'entry_time', headerName: 'In', width: 80 },
  { field: 'exit_time', headerName: 'Out', width: 80 },
  { field: 'ticker', headerName: 'Ticker', width: 90, filter: true },
  { field: 'direction', headerName: 'Dir', width: 80, cellRenderer: DirCell, filter: true },
  { field: 'timeframe', headerName: 'TF', width: 70, filter: true },
  { field: 'session', headerName: 'Session', width: 100, filter: true },
  { field: 'strategy', headerName: 'Strategy', width: 110, filter: true },
  { field: 'size', headerName: 'Size', width: 80, filter: true },
  { field: 'mss', headerName: 'MSS', width: 75, cellRenderer: MSSCell, filter: true },
  { field: 'profit_usd', headerName: 'P/L ($)', width: 100, cellRenderer: PLCell, filter: 'agNumberColumnFilter' },
  { field: 'r_multiple', headerName: 'R', width: 80, cellRenderer: RCell, filter: 'agNumberColumnFilter' },
  { field: 'rating', headerName: 'Rating', width: 110, cellRenderer: RatingCell },
  { field: 'tradingview_url', headerName: 'Chart', width: 70, cellRenderer: TVCell, sortable: false },
  { field: 'notes', headerName: 'Notes', flex: 1, minWidth: 200, tooltipField: 'notes' },
]

export default function PortfolioTrades() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const gridRef = useRef()

  useEffect(() => {
    supabase.from('portfolio_trades').select('*').order('entry_date', { ascending: false }).then(({ data }) => {
      setRows(data || [])
      setLoading(false)
    })
  }, [])

  const totalPL = rows.reduce((sum, r) => sum + (r.profit_usd || 0), 0)
  const wins = rows.filter(r => (r.profit_usd || 0) > 0).length
  const losses = rows.filter(r => (r.profit_usd || 0) < 0).length
  const plColor = totalPL >= 0 ? 'text-brand-win' : 'text-brand-loss'

  return (
    <div className="w-full px-8 py-8 h-[calc(100vh-60px)] flex flex-col">
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-[10px] font-bold text-brand-muted uppercase tracking-[0.15em] mb-0.5">My Portfolio</p>
          <h1 className="text-2xl font-black text-brand-text tracking-tight">Trade Log</h1>
          <p className="text-xs text-brand-muted mt-0.5">{rows.length} trades · {wins}W / {losses}L</p>
        </div>
        {rows.length > 0 && (
          <div className="text-right">
            <p className="text-[10px] text-brand-muted uppercase tracking-wider mb-0.5">Total P/L</p>
            <p className={`text-2xl font-black font-mono ${plColor}`}>
              {totalPL >= 0 ? '+' : ''}${totalPL.toFixed(2)}
            </p>
          </div>
        )}
      </div>
      <div className="ag-theme-alpine flex-1 rounded-2xl overflow-hidden border border-brand-border shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center h-full text-brand-muted text-sm font-medium tracking-widest uppercase animate-pulse">Loading trades...</div>
        ) : (
          <AgGridReact
            ref={gridRef}
            rowData={rows}
            columnDefs={colDefs}
            defaultColDef={{ resizable: true, sortable: true, filter: false }}
            animateRows={true}
            rowHeight={38}
            headerHeight={42}
            suppressCellFocus={true}
            tooltipShowDelay={300}
          />
        )}
      </div>
    </div>
  )
}
