import { useEffect, useState, useRef } from 'react'
import { AgGridReact } from 'ag-grid-react'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-alpine.css'
import { supabase } from '../supabase'

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
  { field: 'mss', headerName: 'MSS', width: 75, cellRenderer: MSSCell, filter: true },
  { field: 'strategy', headerName: 'Strategy', width: 110, filter: true },
  { field: 'size', headerName: 'Size', width: 80, filter: true },
  { field: 'session', headerName: 'Session', width: 100, filter: true },
  { field: 'r_multiple', headerName: 'R', width: 90, cellRenderer: RCell, filter: 'agNumberColumnFilter' },
  { field: 'rating', headerName: 'Rating', width: 110, cellRenderer: RatingCell },
  { field: 'tradingview_url', headerName: 'Chart', width: 70, cellRenderer: TVCell, sortable: false },
  { field: 'notes', headerName: 'Notes', flex: 1, minWidth: 200, tooltipField: 'notes' },
]

export default function Trades() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const gridRef = useRef()

  useEffect(() => {
    supabase.from('trades').select('*').order('entry_date', { ascending: false }).then(({ data }) => {
      setRows(data || [])
      setLoading(false)
    })
  }, [])

  const defaultColDef = {
    resizable: true,
    sortable: true,
    filter: false,
  }

  return (
    <div className="px-6 py-8 h-[calc(100vh-64px)] flex flex-col">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-black text-brand-text tracking-tight">Trade Log</h1>
          <p className="text-xs text-brand-muted mt-0.5">{rows.length} trades total</p>
        </div>
      </div>
      <div className="ag-theme-alpine flex-1 rounded-xl overflow-hidden border border-brand-border shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center h-full text-brand-muted text-sm font-medium tracking-widest uppercase animate-pulse">Loading trades...</div>
        ) : (
          <AgGridReact
            ref={gridRef}
            rowData={rows}
            columnDefs={colDefs}
            defaultColDef={defaultColDef}
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
