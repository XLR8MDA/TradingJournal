import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://qikxcqqsbgvtqnxbvltb.supabase.co',
  'sb_publishable_sAPtzsjNhLJydasozNKA3A_lIdZw34c'
)

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseDate(str) {
  // "30-Apr-2026" → "2026-04-30"
  const months = { Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',
                   Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12' }
  const [d, mon, y] = str.trim().split('-')
  return `${y}-${months[mon]}-${d.padStart(2,'0')}`
}

function parseTime(str) {
  // "3:50" → "03:50"
  if (!str || !str.trim()) return null
  const [h, m] = str.trim().split(':')
  return `${h.padStart(2,'0')}:${m.padStart(2,'0')}`
}

function parseRating(str) {
  // "★★☆☆☆" → 2, empty → null
  if (!str || !str.trim()) return null
  return (str.match(/★/g) || []).length || null
}

function parseMSS(str) {
  return str?.trim().toLowerCase() === 'yes'
}

function getSession(timeStr) {
  if (!timeStr) return 'New York'
  const [h, m] = timeStr.split(':').map(Number)
  const mins = h * 60 + m
  if (mins >= 180 && mins < 750)  return 'Asian'
  if (mins >= 750 && mins < 1050) return 'London'
  if (mins >= 1050 && mins < 1230) return 'Mixed'
  return 'New York'
}

// ── Raw data ─────────────────────────────────────────────────────────────────

const raw = [
  ['30-Apr-2026','3:50','30-Apr-2026','4:10','Oil','5m','Long','No','Full','LSD',null,2.00,'https://www.tradingview.com/x/0Dul2skf/',''],
  ['1-May-2026','1:40','1-May-2026','3:30','NQ','5m','Long','No','Half','LSD',null,3.00,'https://www.tradingview.com/x/YMtvXzhz/',''],
  ['1-May-2026','15:50','1-May-2026','16:10','NQ','5m','Short','No','Half','LSD','★★☆☆☆',2.00,'https://www.tradingview.com/x/i5h3qXcc/',''],
  ['4-May-2026','20:25','4-May-2026','20:45','NQ','5m','Short','No','Full','LSD','★★★★★',4.00,'https://www.tradingview.com/x/1xgufNd0/',''],
  ['5-May-2026','13:15','5-May-2026','13:40','NQ','5m','Short','Yes','Half','LSD','★☆☆☆☆',-1.00,'https://www.tradingview.com/x/KvOtVQcv/',''],
  ['6-May-2026','12:20','6-May-2026','13:20','NQ','5m','Long','No','Half','LSD','★★☆☆☆',-1.00,'https://www.tradingview.com/x/s0VUIVft/',''],
  ['6-May-2026','19:05','7-May-2026','1:45','NQ','5m','Long','Yes','Full','LSD','★★★★★',4.00,'https://www.tradingview.com/x/fRWWihGz/',''],
  ['7-May-2026','15:40','7-May-2026','19:35','NQ','5m','Long','Yes','Full','LSD','★★★☆☆',4.00,'https://www.tradingview.com/x/AqE2Dasz/',''],
  ['8-May-2026','16:00','8-May-2026','19:25','NQ','5m','Long','No','Full','LSD','★★☆☆☆',4.00,'https://www.tradingview.com/x/10onV3E7/',''],
  ['11-May-2026','3:55','11-May-2026','6:55','NQ','5m','Long','Yes','Half','LSD','★★★☆☆',3.00,'https://www.tradingview.com/x/lbgMURGV/',''],
  ['11-May-2026','17:55','11-May-2026','18:10','NQ','5m','Long','Yes','Full','LSD','★★★☆☆',-1.00,'https://www.tradingview.com/x/caxdED94/',''],
  ['12-May-2026','18:30','12-May-2026','19:00','NQ','5m','Long','Yes','Half','LSD','★★★☆☆',2.00,'https://www.tradingview.com/x/hqzkvIgz/',''],
  ['13-May-2026','20:40','13-May-2026','20:55','NQ','5m','Short','Yes','Half','LSD','★★★☆☆',2.00,'https://www.tradingview.com/x/N6HSEqWb/',''],
  ['14-May-2026','15:50','14-May-2026','18:35','NQ','5m','Short','Yes','Half','LSD','★★★☆☆',3.00,'https://www.tradingview.com/x/KWP60Ksx/',''],
  ['15-May-2026','19:05','15-May-2026','19:15','NQ','5m','Short','Yes','Half','LSD','★★★☆☆',4.00,'https://www.tradingview.com/x/3yxlFdKG/',''],
  ['19-May-2026','13:35','19-May-2026','14:45','NQ','5m','Short','Yes','Half','LSD','★★★☆☆',4.00,'https://www.tradingview.com/x/J4OJuAR7/',''],
  ['20-May-2026','8:45','20-May-2026','9:45','NQ','5m','Long','No','Full','LSD','★★★★☆',4.00,'https://www.tradingview.com/x/Z8jPpJTw/',''],
  ['21-May-2026','12:25','21-May-2026','12:30','NQ','5m','Long','Yes','Half','LSD','★★★☆☆',-1.00,'https://www.tradingview.com/x/nTmeAmCb/',''],
  ['22-May-2026','19:55','22-May-2026','20:55','NQ','5m','Long','Yes','Full','LSD','★★★☆☆',2.00,'https://www.tradingview.com/x/HJ7ZBcjd/',''],
  ['25-May-2026','18:25','25-May-2026','19:25','NQ','5m','Long','Yes','Full','LSD','★★★☆☆',2.00,'https://www.tradingview.com/x/zZK048ry/',''],
  ['26-May-2026','17:10','26-May-2026','19:25','NQ','5m','Long','Yes','Full','LSD','★★★☆☆',4.00,'https://www.tradingview.com/x/dcbDzdrD/',''],
  ['27-May-2026','12:15','27-May-2026','13:40','NQ','5m','Long','Yes','Full','LSD','★★★☆☆',4.00,'https://www.tradingview.com/x/V6XoxNqi/',''],
  ['29-May-2026','13:20','29-May-2026','19:00','NQ','5m','Long','No','Full','LSD','★★★☆☆',4.00,'https://www.tradingview.com/x/iwDlOI8t/',''],
  ['2-Jun-2026','19:20','2-Jun-2026','21:05','NQ','5m','Long','Yes','Half','LSD','★★☆☆☆',2.00,'https://www.tradingview.com/x/ql5PEipu/',''],
  ['9-Jun-2026','7:20','9-Jun-2026','8:45','NQ','5m','Short','No','Full','LSD','★★★☆☆',-1.00,'https://www.tradingview.com/x/bsG0yrwK/',''],
  ['9-Jun-2026','9:15','9-Jun-2026','9:35','NQ','5m','Short','Yes','Half','LSD','★★★☆☆',-1.00,'https://www.tradingview.com/x/FvcGLlXN/',''],
  ['9-Jun-2026','13:30','9-Jun-2026','17:50','NQ','5m','Long','No','Full','LSD','★★★☆☆',4.00,'https://www.tradingview.com/x/Lon1vTOS/',''],
  ['9-Jun-2026','18:00','9-Jun-2026','18:55','NQ','5m','Long','Yes','Half','LSD','★★★☆☆',2.00,'https://www.tradingview.com/x/4rjvkyOr/',''],
  ['10-Jun-2026','18:10','10-Jun-2026','19:10','NQ','5m','Long','No','Full','LSD','★★☆☆☆',-1.00,'https://www.tradingview.com/x/vKnK8yjs/',''],
  ['11-Jun-2026','7:05','11-Jun-2026','8:00','NQ','5m','Long','Yes','Half','LSD','★★★☆☆',3.00,'https://www.tradingview.com/x/nNzdDXRI/',''],
  ['11-Jun-2026','11:45','11-Jun-2026','13:35','NQ','5m','Long','Yes','Half','LSD','★★★☆☆',3.00,'https://www.tradingview.com/x/HXQsUFna/',''],
  ['12-Jun-2026','18:35','12-Jun-2026','19:00','NQ','5m','Long','Yes','Half','LSD','★★★☆☆',-1.00,'https://www.tradingview.com/x/zEWcgQbS/',''],
  ['12-Jun-2026','19:50','12-Jun-2026','20:25','NQ','5m','Long','No','Full','LSD','★★★☆☆',-1.00,'https://www.tradingview.com/x/xODQXCjL/',''],
]

// ── Build payload ─────────────────────────────────────────────────────────────

const trades = raw.map(([entry_date, entry_time, exit_date, exit_time,
  ticker, timeframe, direction, mss, size, strategy, rating_str, r_multiple,
  tradingview_url, notes]) => {

  const entryTime = parseTime(entry_time)
  return {
    entry_date:      parseDate(entry_date),
    entry_time:      entryTime,
    exit_date:       parseDate(exit_date),
    exit_time:       parseTime(exit_time),
    ticker:          ticker.trim(),
    timeframe:       timeframe.trim(),
    direction:       direction.trim(),
    mss:             parseMSS(mss),
    size:            size.trim(),
    strategy:        strategy.trim(),
    rating:          parseRating(rating_str),
    r_multiple:      r_multiple,
    tradingview_url: tradingview_url?.trim() || null,
    notes:           notes?.trim() || null,
    session:         getSession(entryTime),
  }
})

// ── Insert ────────────────────────────────────────────────────────────────────

console.log(`Inserting ${trades.length} trades...`)

const { data, error } = await supabase.from('trades').insert(trades).select('id')

if (error) {
  console.error('❌ Error:', error.message)
  process.exit(1)
}

console.log(`✅ Done — inserted ${data.length} trades successfully.`)
