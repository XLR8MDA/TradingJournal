'use strict';

// ── STORAGE ──────────────────────────────────────────
const Store = {
  get: (k, def=[]) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } },
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v))
};

let trades     = Store.get('edge_trades', []);
let backtests  = Store.get('edge_backtest', []);
let settings   = Store.get('edge_settings', {});

const EDGE_SYNC_VERSION = 1;
const EDGE_CLIENT_NAME  = 'edge-journal-web';
const EDGE_ENV = window.EDGE_ENV ? { ...window.EDGE_ENV } : {};

async function loadRuntimeEnv() {
  try {
    const res = await fetch('.env', { cache: 'no-store' });
    if (!res.ok) return;
    const text = await res.text();
    text.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const idx = trimmed.indexOf('=');
      if (idx === -1) return;
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      EDGE_ENV[key] = value;
    });
  } catch {
    // .env is optional for local/static deployments
  }
}

function normalizeSettings(raw = {}) {
  const normalized = { ...raw };
  const envUrl = EDGE_ENV.EDGE_APPS_SCRIPT_URL || EDGE_ENV.APPS_SCRIPT_URL || '';
  const envGroqKey = EDGE_ENV.EDGE_GROQ_API_KEY || EDGE_ENV.GROQ_API_KEY || '';
  const legacyUrl = raw.appsScriptUrl || raw.sheetsUrl || raw.driveUrl || envUrl;
  normalized.appsScriptUrl = typeof legacyUrl === 'string' ? legacyUrl.trim() : '';
  normalized.sheetsUrl = typeof raw.sheetsUrl === 'string' ? raw.sheetsUrl.trim() : '';
  normalized.driveUrl = typeof raw.driveUrl === 'string' ? raw.driveUrl.trim() : '';
  const resolvedGroqKey = raw.groqKey || envGroqKey;
  normalized.groqKey = typeof resolvedGroqKey === 'string' ? resolvedGroqKey.trim() : '';
  return normalized;
}

function hydrateSettingsFromEnv() {
  const envUrl = EDGE_ENV.EDGE_APPS_SCRIPT_URL || EDGE_ENV.APPS_SCRIPT_URL || '';
  const envGroqKey = EDGE_ENV.EDGE_GROQ_API_KEY || EDGE_ENV.GROQ_API_KEY || '';
  let changed = false;

  if (!settings.appsScriptUrl && envUrl) {
    settings.appsScriptUrl = envUrl.trim();
    changed = true;
  }

  if (!settings.groqKey && envGroqKey) {
    settings.groqKey = envGroqKey.trim();
    changed = true;
  }

  if (changed) saveSettings();
}

settings = normalizeSettings(settings);

function saveTrades()    { Store.set('edge_trades', trades); }
function saveBacktests() { Store.set('edge_backtest', backtests); }
function saveSettings()  {
  settings = normalizeSettings(settings);
  Store.set('edge_settings', settings);
}

// ── TOP NAV ──────────────────────────────────────────
function toggleNavGroup(id) {
  const group = document.getElementById(id);
  if (!group) return;
  const isOpen = group.classList.contains('open');
  // Close all groups first
  document.querySelectorAll('.nav-group').forEach(g => g.classList.remove('open'));
  if (!isOpen) {
    group.classList.add('open');
    document.getElementById('backdrop').classList.add('show');
  } else {
    document.getElementById('backdrop').classList.remove('show');
  }
}

function toggleMobileMenu() {
  const menu     = document.getElementById('mobile-menu');
  const backdrop = document.getElementById('backdrop');
  const isOpen   = menu.classList.contains('open');
  menu.classList.toggle('open', !isOpen);
  backdrop.classList.toggle('show', !isOpen);
  document.body.style.overflow = isOpen ? '' : 'hidden';
}

function closeAllNav() {
  document.querySelectorAll('.nav-group').forEach(g => g.classList.remove('open'));
  document.getElementById('mobile-menu').classList.remove('open');
  document.getElementById('backdrop').classList.remove('show');
  document.body.style.overflow = '';
}

// Keep legacy aliases so any old refs don't break
function toggleSidebar() { toggleMobileMenu(); }
function closeSidebar()   { closeAllNav(); }

function nav(id, el) {
  // Show the target section
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(id);
  if (target) target.classList.add('active');

  // Update active state across all nav elements
  document.querySelectorAll('.nav-group-btn, .nav-dd-item, .mob-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');

  // Also highlight parent group btn when a dropdown item is clicked
  if (el) {
    const parentGroup = el.closest('.nav-group');
    if (parentGroup) {
      const btn = parentGroup.querySelector('.nav-group-btn');
      if (btn) btn.classList.add('active');
    }
    // Mirror on mobile menu
    document.querySelectorAll('.mob-item').forEach(m => {
      const oc = m.getAttribute('onclick') || '';
      if (oc.includes(`'${id}'`)) m.classList.add('active');
    });
  }

  window.scrollTo(0, 0);
  closeAllNav();

  if (id === 'backtest-hub')  initBacktestHub();
  if (id === 'gold')          renderPairPerf('XAU/USD', 'gold-perf');
  if (id === 'btc')           renderPairPerf('BTC/USD', 'btc-perf');
  if (id === 'eurusd')        renderPairPerf('EUR/USD', 'eurusd-perf');
  if (id === 'live-history')  renderLiveHistory();
  if (id === 'dashboard')     updateDashboard();
}

// ── MINI CHECKLIST ────────────────────────────────────
function toggleChk(el, ctx) {
  el.classList.toggle('checked');
  updateMiniScore(ctx);
}

function updateMiniScore(ctx) {
  const container = document.getElementById(ctx + '-chk');
  if (!container) return;
  const items   = container.querySelectorAll('.mini-item');
  const all     = [...items];
  const checked = all.filter(i => i.classList.contains('checked')).length;

  // TN checklist: 11 items — P1[0-2] P2[3-5] P3[6] P4[7-10]
  // BH checklist: 16 items — original layout unchanged
  const isTn  = ctx === 'tn';
  const total = isTn ? 11 : 16;

  const p1 = [0,1,2].every(i => all[i]?.classList.contains('checked'));
  const p2 = [3,4,5].some(i  => all[i]?.classList.contains('checked'));
  const p3 = isTn
    ? !!all[6]?.classList.contains('checked')
    : [6,7,8,9,10,11].some(i => all[i]?.classList.contains('checked'));
  const p4 = isTn
    ? [7,8,9,10].every(i => all[i]?.classList.contains('checked'))
    : [12,13,14,15].every(i => all[i]?.classList.contains('checked'));

  const fill    = document.getElementById(ctx + '-score-fill');
  const num     = document.getElementById(ctx + '-score-num');
  const verdict = document.getElementById(ctx + '-score-verdict');

  if (fill) fill.style.width = Math.round(checked / total * 100) + '%';

  const goThresh  = isTn ? 9  : 12;
  const mrgThresh = isTn ? 7  : 10;

  let color, text;
  if (checked >= goThresh && p1 && p2 && p3 && p4) {
    color = 'var(--green)'; text = 'All gates passed — ready to trade';
    if (fill) fill.style.background = 'var(--green2)';
  } else if (checked >= mrgThresh && p1 && p2 && p3) {
    color = 'var(--amber)'; text = 'Marginal — reduce size to 0.5%';
    if (fill) fill.style.background = 'var(--amber2)';
  } else {
    color = 'var(--red)'; text = 'Gate failed — check phases';
    if (fill) fill.style.background = 'var(--red2)';
  }
  if (num)     { num.textContent = checked + '/' + total; num.style.color = color; }
  if (verdict) { verdict.textContent = text; verdict.style.color = color; }

  // Sync hidden score input (Backtest uses it for save)
  const scoreInput = document.getElementById(ctx + '-user-score');
  if (scoreInput) scoreInput.value = checked;

  // Enable/disable analyze button (Trade Now)
  if (ctx === 'tn') {
    const btn = document.getElementById('tn-analyze-btn');
    const hasImg = document.getElementById('tn-image-data')?.value;
    if (btn) btn.disabled = !hasImg;
  }
}

function getMiniChecklist(ctx) {
  const container = document.getElementById(ctx + '-chk');
  if (!container) return '';
  const phases = ['P1 Location', 'P2 Stop Hunt', 'P3 Pattern', 'P4 Session/Risk'];
  const items   = [...container.querySelectorAll('.mini-item')];
  const groups  = [[0,1,2],[3,4,5],[6,7,8,9,10,11],[12,13,14,15]];
  return groups.map((g, pi) =>
    phases[pi] + ': ' + g.map(i =>
      items[i] ? (items[i].classList.contains('checked') ? '✓' : '✗') + ' ' + items[i].textContent.trim() : ''
    ).join(' | ')
  ).join('\n');
}

// ── CHECKLIST ────────────────────────────────────────
function toggle(el) { el.classList.toggle('checked'); updateScore(); }

function updateScore() {
  const items   = document.querySelectorAll('#checklist .chk-item');
  let checked   = 0;
  items.forEach(i => { if (i.classList.contains('checked')) checked++; });
  const fill    = document.getElementById('score-fill');
  const num     = document.getElementById('score-num');
  const verdict = document.getElementById('score-verdict');
  fill.style.width = Math.round(checked / items.length * 100) + '%';
  num.textContent  = checked + ' / ' + items.length;

  const all  = [...items];
  const p1   = [0,1,2].every(i => all[i].classList.contains('checked'));
  const p2   = [3,4,5].some(i  => all[i].classList.contains('checked'));
  const p3   = [6,7,8,9,10,11].some(i => all[i].classList.contains('checked'));
  const p4   = [12,13,14,15].every(i  => all[i].classList.contains('checked'));

  if (checked >= 12 && p1 && p2 && p3 && p4) {
    fill.style.background = 'var(--green2)';
    num.style.color       = 'var(--green)';
    verdict.style.color   = 'var(--green)';
    verdict.textContent   = 'Take the trade. All gates passed.';
  } else if (checked >= 10 && p1 && p2 && p3) {
    fill.style.background = 'var(--amber2)';
    num.style.color       = 'var(--amber)';
    verdict.style.color   = 'var(--amber)';
    verdict.textContent   = 'Marginal setup. Reduce position size to 0.5%.';
  } else {
    fill.style.background = 'var(--red2)';
    num.style.color       = 'var(--text3)';
    verdict.style.color   = 'var(--red)';
    const missing = [];
    if (!p1) missing.push('Location (Phase 1)');
    if (!p2) missing.push('Stop hunt (Phase 2)');
    if (!p3) missing.push('Pattern (Phase 3)');
    if (!p4) missing.push('Risk filter (Phase 4)');
    verdict.textContent = 'Skip. Missing: ' + (missing.length ? missing.join(', ') : 'score too low') + '.';
  }
}

function resetChecklist() {
  document.querySelectorAll('#checklist .chk-item').forEach(i => i.classList.remove('checked'));
  const fill = document.getElementById('score-fill');
  fill.style.width = '0%'; fill.style.background = 'var(--red2)';
  document.getElementById('score-num').style.color = 'var(--text3)';
  document.getElementById('score-num').textContent = '0 / 16';
  document.getElementById('score-verdict').style.color = 'var(--text3)';
  document.getElementById('score-verdict').textContent = 'Check items above to evaluate the setup.';
}

// ── LIVE TRADE LOGGER ────────────────────────────────
async function addTrade() {
  const inst  = document.getElementById('l-inst').value;
  const entry = parseFloat(document.getElementById('l-entry').value);
  if (!inst || !entry) {
    showMsg('l-msg', 'Please fill at least instrument and entry.', 'var(--red)');
    return;
  }
  const trade = {
    id:      Date.now(),
    mode:    'live',
    date:    document.getElementById('l-date').value || today(),
    inst,
    dir:     document.getElementById('l-dir').value,
    entry,
    sl:      parseFloat(document.getElementById('l-sl').value) || null,
    tp:      parseFloat(document.getElementById('l-tp').value) || null,
    pat:     document.getElementById('l-pat').value,
    hunt:    document.getElementById('l-hunt').value,
    out:     document.getElementById('l-out').value,
    score:   parseInt(document.getElementById('l-score').value) || null,
    rr:      parseFloat(document.getElementById('l-rr').value) || null,
    session: document.getElementById('l-session').value,
    notes:   document.getElementById('l-notes').value,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    syncStatus: hasBackendConfig() ? 'pending' : 'local'
  };
  trades.unshift(trade);
  saveTrades();
  showMsg('l-msg', hasBackendConfig() ? 'Trade saved locally. Syncing...' : 'Trade saved locally.', 'var(--green)');
  ['l-entry','l-sl','l-tp','l-score','l-rr','l-notes'].forEach(id => {
    document.getElementById(id).value = '';
  });
  updateDashboard();
  updateSidebar();

  if (!hasBackendConfig()) return;

  try {
    const result = await syncLiveTrade(trade);
    trade.syncStatus = 'synced';
    trade.syncedAt = result.syncedAt || new Date().toISOString();
    if (result.screenshotUrl) trade.screenshot = result.screenshotUrl;
    saveTrades();
    showMsg('l-msg', 'Trade synced to Google Sheets.', 'var(--green)');
  } catch (error) {
    trade.syncStatus = 'failed';
    trade.syncError = error.message;
    saveTrades();
    showMsg('l-msg', 'Trade saved locally. Sync failed.', 'var(--amber)');
  }
}

function deleteLiveTrade(i) {
  if (!confirm('Delete this trade?')) return;
  trades.splice(i, 1);
  saveTrades();
  renderLiveHistory();
  updateDashboard();
  updateSidebar();
}

function renderLiveHistory() {
  const el = document.getElementById('live-history-body');
  if (!el) return;
  if (!trades.length) {
    el.innerHTML = '<div class="perf-empty">No live trades logged yet.</div>';
    const sc = document.getElementById('live-stats-card');
    if (sc) sc.style.display = 'none';
    return;
  }
  const sc = document.getElementById('live-stats-card');
  if (sc) sc.style.display = 'block';

  let html = `<table class="data-table"><thead><tr>
    <th>Date</th><th>Pair</th><th>Dir</th><th>Entry</th><th>Pattern</th><th>Hunt</th><th>Score</th><th>R:R</th><th>Outcome</th><th>Notes</th><th></th>
  </tr></thead><tbody>`;
  trades.forEach((t, i) => {
    const oc = t.out.startsWith('Win') ? 'var(--green)' : t.out === 'Loss' ? 'var(--red)' : 'var(--amber)';
    const sc2 = t.score >= 12 ? 'var(--green)' : t.score >= 10 ? 'var(--amber)' : 'var(--red)';
    html += `<tr>
      <td class="mono" style="color:var(--text3)">${t.date}</td>
      <td style="font-weight:500;color:var(--amber)">${t.inst}</td>
      <td><span class="tag ${t.dir==='Long'?'tg':'tr'}">${t.dir}</span></td>
      <td class="mono">${t.entry||'—'}</td>
      <td style="font-size:11px">${t.pat||'—'}</td>
      <td style="font-size:11px">${t.hunt||'—'}</td>
      <td class="mono" style="color:${sc2}">${t.score?t.score+'/16':'—'}</td>
      <td class="mono" style="color:var(--amber)">${t.rr?'1:'+t.rr:'—'}</td>
      <td style="color:${oc};font-weight:500;font-size:12px">${t.out}</td>
      <td style="font-size:11px;color:var(--text3);max-width:140px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${t.notes||'—'}</td>
      <td><button class="btn btn-sm btn-danger" onclick="deleteLiveTrade(${i})">×</button></td>
    </tr>`;
  });
  html += '</tbody></table>';
  el.innerHTML = html;
  renderLiveStats();
}

function renderLiveStats() {
  const el = document.getElementById('live-perf-metrics');
  if (!el || !trades.length) return;
  const wins  = trades.filter(t => t.out.startsWith('Win') || t.out === 'Break-even');
  const wr    = Math.round(wins.length / trades.length * 100);
  const vrr   = trades.filter(t => t.rr);
  const avgRR = vrr.length ? vrr.reduce((a,t) => a+t.rr,0)/vrr.length : 0;
  const totalR = trades.reduce((a,t) => {
    if (t.out.startsWith('Win')) return a+(t.rr||0);
    if (t.out==='Loss') return a-1;
    if (t.out==='Partial') return a+((t.rr||0)*0.5);
    return a;
  }, 0);
  el.innerHTML = `
    <div class="metric"><div class="metric-label">Live trades</div><div class="metric-val">${trades.length}</div></div>
    <div class="metric"><div class="metric-label">Win rate</div><div class="metric-val ${wr>=65?'pos':wr>=40?'warn':'neg'}">${wr}%</div></div>
    <div class="metric"><div class="metric-label">Avg R:R</div><div class="metric-val warn">1:${avgRR.toFixed(1)}</div></div>
    <div class="metric"><div class="metric-label">Net R</div><div class="metric-val ${totalR>=0?'pos':'neg'}">${totalR>=0?'+':''}${totalR.toFixed(1)}R</div></div>
  `;
}

function exportCSV() {
  if (!trades.length) { alert('No trades to export.'); return; }
  const h    = ['Date','Instrument','Direction','Entry','SL','TP','Pattern','Hunt','Outcome','Score','RR','Session','Notes'];
  const rows = trades.map(t => [t.date,t.inst,t.dir,t.entry,t.sl,t.tp,t.pat,t.hunt,t.out,t.score,t.rr,t.session,'"'+(t.notes||'').replace(/"/g,"'")+'"'].join(','));
  download([h.join(','), ...rows].join('\n'), 'edge_live_' + today() + '.csv', 'text/csv');
}

// ── DASHBOARD ────────────────────────────────────────
function updateDashboard() {
  const el = document.getElementById('dm-total');
  if (!el) return;
  if (!trades.length) return;
  const wins  = trades.filter(t => t.out.startsWith('Win') || t.out === 'Break-even');
  const wr    = Math.round(wins.length / trades.length * 100);
  const vrr   = trades.filter(t => t.rr);
  const avgRR = vrr.length ? vrr.reduce((a,t) => a+t.rr,0)/vrr.length : 0;
  const totalR = trades.reduce((a,t) => {
    if (t.out.startsWith('Win')) return a+(t.rr||0);
    if (t.out==='Loss') return a-1;
    if (t.out==='Partial') return a+((t.rr||0)*0.5);
    return a;
  }, 0);

  document.getElementById('dm-total').textContent = trades.length;
  const wrEl = document.getElementById('dm-wr');
  wrEl.textContent = wr + '%';
  wrEl.style.color = wr >= 65 ? 'var(--green)' : wr >= 40 ? 'var(--amber)' : 'var(--red)';
  document.getElementById('dm-rr').textContent = '1:' + avgRR.toFixed(1);
  const trEl = document.getElementById('dm-tr');
  trEl.textContent = (totalR >= 0 ? '+' : '') + totalR.toFixed(1) + 'R';
  trEl.style.color = totalR >= 0 ? 'var(--green)' : 'var(--red)';

  const recent = trades.slice(0, 5);
  if (recent.length) {
    let h = `<table class="data-table"><thead><tr><th>Date</th><th>Pair</th><th>Dir</th><th>Pattern</th><th>Score</th><th>Outcome</th></tr></thead><tbody>`;
    recent.forEach(t => {
      const c = t.out.startsWith('Win') ? 'var(--green)' : t.out==='Loss' ? 'var(--red)' : 'var(--amber)';
      h += `<tr>
        <td class="mono" style="color:var(--text3)">${t.date}</td>
        <td style="color:var(--amber);font-weight:500">${t.inst}</td>
        <td><span class="tag ${t.dir==='Long'?'tg':'tr'}">${t.dir}</span></td>
        <td style="font-size:11px">${t.pat||'—'}</td>
        <td class="mono" style="color:${t.score>=12?'var(--green)':t.score>=10?'var(--amber)':'var(--red)'}">${t.score?t.score+'/16':'—'}</td>
        <td style="color:${c};font-weight:500;font-size:12px">${t.out}</td>
      </tr>`;
    });
    h += '</tbody></table>';
    document.getElementById('dash-recent').innerHTML = h;
  }

  // Equity curve
  const canvas = document.getElementById('equity-chart');
  const emptyEl = document.getElementById('equity-empty');
  if (canvas) {
    canvas.style.display = 'block';
    if (emptyEl) emptyEl.style.display = 'none';
    const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));
    let cum = 0;
    const labels = ['Start'];
    const data   = [0];
    sorted.forEach(t => {
      if (t.out.startsWith('Win'))   cum += (t.rr || 0);
      else if (t.out === 'Loss')     cum -= 1;
      else if (t.out === 'Partial')  cum += ((t.rr || 0) * 0.5);
      labels.push(t.date.slice(5));  // MM-DD
      data.push(parseFloat(cum.toFixed(2)));
    });
    const posColor = cum >= 0 ? 'rgba(74,222,128,.85)' : 'rgba(248,113,113,.85)';
    const posFill  = cum >= 0 ? 'rgba(74,222,128,.06)' : 'rgba(248,113,113,.06)';
    if (window._equityChart) window._equityChart.destroy();
    window._equityChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{ data, borderColor: posColor, backgroundColor: posFill,
          fill: true, tension: 0.35, borderWidth: 2,
          pointRadius: data.length > 25 ? 0 : 3, pointHoverRadius: 5 }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => (ctx.raw >= 0 ? '+' : '') + ctx.raw + 'R' } }
        },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,.04)' },
               ticks: { color: 'rgba(255,255,255,.3)', font: { family: 'Space Mono', size: 9 },
                        maxTicksLimit: 8 }},
          y: { grid: { color: 'rgba(255,255,255,.04)' },
               ticks: { color: 'rgba(255,255,255,.35)', font: { family: 'Space Mono', size: 9 },
                        callback: v => (v >= 0 ? '+' : '') + v + 'R' }}
        }
      }
    });
  }

  // Monthly P&L chart
  const monthCanvas = document.getElementById('monthly-chart');
  const monthEmpty  = document.getElementById('monthly-empty');
  if (monthCanvas) {
    const monthMap = {};
    trades.forEach(t => {
      const m = t.date.slice(0, 7);
      if (!monthMap[m]) monthMap[m] = 0;
      if (t.out.startsWith('Win'))  monthMap[m] += (t.rr || 0);
      else if (t.out === 'Loss')    monthMap[m] -= 1;
      else if (t.out === 'Partial') monthMap[m] += ((t.rr || 0) * 0.5);
    });
    const months = Object.keys(monthMap).sort();
    if (months.length >= 2) {
      monthCanvas.style.display = 'block';
      if (monthEmpty) monthEmpty.style.display = 'none';
      const mData   = months.map(m => parseFloat(monthMap[m].toFixed(2)));
      const mColors = mData.map(v => v >= 0 ? 'rgba(74,222,128,.7)' : 'rgba(248,113,113,.7)');
      if (window._monthlyChart) window._monthlyChart.destroy();
      window._monthlyChart = new Chart(monthCanvas, {
        type: 'bar',
        data: {
          labels: months.map(m => {
            const [y, mo] = m.split('-');
            return new Date(+y, +mo - 1).toLocaleString('default', { month: 'short', year: '2-digit' });
          }),
          datasets: [{ data: mData, backgroundColor: mColors, borderRadius: 4, borderSkipped: false }]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: ctx => (ctx.raw >= 0 ? '+' : '') + ctx.raw + 'R' } }
          },
          scales: {
            x: { grid: { color: 'rgba(255,255,255,.04)' },
                 ticks: { color: 'rgba(255,255,255,.35)', font: { family: 'Space Mono', size: 9 } }},
            y: { grid: { color: 'rgba(255,255,255,.04)' },
                 ticks: { color: 'rgba(255,255,255,.35)', font: { family: 'Space Mono', size: 9 },
                          callback: v => (v >= 0 ? '+' : '') + v + 'R' }}
          }
        }
      });
    }
  }

  // Backtest summary
  const btEl = document.getElementById('dash-bt-summary');
  if (btEl && backtests.length) {
    const pairs = ['XAU/USD','BTC/USD','EUR/USD'];
    let bh = '';
    pairs.forEach(p => {
      const ps   = backtests.filter(b => b.pair === p);
      const wins = ps.filter(b => b.outcome && b.outcome.startsWith('Win'));
      const wr2  = ps.length ? Math.round(wins.length/ps.length*100) : null;
      bh += `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px">
        <span style="color:var(--amber);font-family:var(--mono);font-weight:600">${p}</span>
        <span style="color:var(--text3);font-size:11px">${ps.length} sessions</span>
        <span style="color:${wr2===null?'var(--text3)':wr2>=65?'var(--green)':wr2>=40?'var(--amber)':'var(--red)'};font-family:var(--mono);font-weight:600">${wr2===null?'—':wr2+'%'}</span>
      </div>`;
    });
    btEl.innerHTML = bh || '<div style="font-size:12px;color:var(--text3);padding:8px 0">No backtest sessions yet.</div>';
  }
}

function updateSidebar() {
  if (!trades.length) return;
  const wins   = trades.filter(t => t.out.startsWith('Win'));
  const wr     = Math.round(wins.length / trades.length * 100);
  const totalR = trades.reduce((a,t) => {
    if (t.out.startsWith('Win')) return a+(t.rr||0);
    if (t.out==='Loss') return a-1;
    if (t.out==='Partial') return a+((t.rr||0)*0.5);
    return a;
  }, 0);
  const sbWr = document.getElementById('sb-wr');
  const sbR  = document.getElementById('sb-r');
  if (sbWr) { sbWr.textContent = wr+'%'; sbWr.style.color = wr>=65?'var(--green)':wr>=40?'var(--amber)':'var(--red)'; }
  if (sbR)  { sbR.textContent = (totalR>=0?'+':'')+totalR.toFixed(1)+'R'; sbR.style.color = totalR>=0?'var(--amber)':'var(--red)'; }

  // Last 5 outcome pips
  const pipsEl = document.getElementById('sb-outcomes');
  if (pipsEl) {
    const last5 = trades.slice(0, 5);
    pipsEl.innerHTML = last5.map(t => {
      const cls = t.out.startsWith('Win') ? 'w' : t.out === 'Loss' ? 'l' : 'p';
      return `<div class="ss-pip ${cls}" title="${t.out} · ${t.inst || ''} ${t.date || ''}"></div>`;
    }).join('') + (trades.length > 5
      ? `<span style="font-size:9px;color:var(--text3);font-family:var(--mono);margin-left:4px">+${trades.length-5}</span>`
      : '');
  }
}

// ── BACKTEST HUB ─────────────────────────────────────
let bhPair    = null;
let bhSession = { setups: [], currentImage: null };

function initBacktestHub() {
  showBhSelect();
  renderBhPairCards();
}

function renderBhPairCards() {
  const pairs = [
    { id: 'XAU/USD', label: 'Gold', sub: 'Stop hunt + confluence' },
    { id: 'BTC/USD', label: 'Bitcoin', sub: 'Crypto — overlap sessions' },
    { id: 'EUR/USD', label: 'Euro / Dollar', sub: 'FX — London & NY open' }
  ];
  const wrap = document.getElementById('bh-pair-cards');
  if (!wrap) return;
  wrap.innerHTML = pairs.map(p => {
    const ps   = backtests.filter(b => b.pair === p.id);
    const wins = ps.filter(b => b.outcome && b.outcome.startsWith('Win'));
    const wr   = ps.length ? Math.round(wins.length/ps.length*100)+'%' : '—';
    const vrr  = ps.filter(b => b.aiScore);
    const acc  = vrr.length ? Math.round(vrr.filter(b => {
      const aiV  = b.aiScore >= 12 ? 'valid' : 'invalid';
      const outV = b.outcome && b.outcome !== 'Loss' ? 'valid' : 'invalid';
      return aiV === outV;
    }).length / vrr.length * 100)+'%' : '—';
    return `<div class="pair-card" onclick="startBhSession('${p.id}')">
      <div class="pair-card-icon">${p.label.toUpperCase()}</div>
      <div class="pair-card-name">${p.id}</div>
      <div class="pair-card-sub">${p.sub}</div>
      <div class="pair-card-stats">
        <div class="pcs"><div class="pcs-label">Sessions</div><div class="pcs-val">${ps.length}</div></div>
        <div class="pcs"><div class="pcs-label">Win rate</div><div class="pcs-val" style="color:${ps.length&&wins.length/ps.length>=0.65?'var(--green)':'var(--text)'}">${wr}</div></div>
        <div class="pcs"><div class="pcs-label">AI Acc.</div><div class="pcs-val" style="color:var(--blue)">${acc}</div></div>
      </div>
      <button class="btn btn-sm" style="width:100%;justify-content:center">Start session →</button>
    </div>`;
  }).join('');
}

function startBhSession(pair) {
  bhPair = pair;
  bhSession = { setups: [], currentImage: null };
  document.getElementById('bh-pair-title').textContent = pair + ' — Backtest Session';
  document.getElementById('bh-session-count').textContent = '0';
  document.getElementById('bh-session-wr').textContent = '—';
  resetBhForm();
  showBhSession();
  renderAiPanel('backtest');
  showAiToggle();
}

function showBhSelect()   { document.getElementById('bh-select').style.display='block'; document.getElementById('bh-session').style.display='none'; }
function showBhSession()  { document.getElementById('bh-select').style.display='none'; document.getElementById('bh-session').style.display='block'; }

function resetBhForm() {
  document.getElementById('bh-user-score').value   = '';
  document.getElementById('bh-user-verdict').value = 'valid';
  document.getElementById('bh-outcome').value      = 'Win (TP2)';
  document.getElementById('bh-notes').value        = '';
  document.getElementById('bh-preview').innerHTML  = `<div class="upload-icon">📷</div><div class="upload-label">Drop chart screenshot here</div><div class="upload-hint">or click to browse · PNG, JPG, WEBP</div>`;
  bhSession.currentImage = null;
  const aiBtn = document.getElementById('bh-ai-btn');
  if (aiBtn) aiBtn.style.display = 'none';
  // Hide and reset checklist
  const bhChkWrap = document.getElementById('bh-chk-wrap');
  if (bhChkWrap) bhChkWrap.style.display = 'none';
  document.querySelectorAll('#bh-chk .mini-item').forEach(i => i.classList.remove('checked'));
  updateMiniScore('bh');
  hideBhVerdicts();
}

function hideBhVerdicts() {
  ['bh-verdict-go','bh-verdict-stop','bh-verdict-marginal'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.classList.remove('show'); }
  });
}

// ── BACKTEST AI ANALYSIS ──────────────────────────────
function runBhAiAnalysis() {
  if (!bhSession.currentImage) { alert('Upload a chart screenshot first.'); return; }
  if (!settings.groqKey) {
    appendAiMsg('ai', 'No Groq API key set. Go to Settings → enter your key → come back and try again.');
    return;
  }

  const userVerdict  = document.getElementById('bh-user-verdict').value;

  appendAiMsg('user', `My call: ${userVerdict}`);
  appendAiMsg('ai', 'Analyzing against the 16-point EDGE checklist…');

  const prompt = `You are EDGE, a strict backtest coaching AI for the Stop Hunt + Pattern Confluence strategy.

Trader's initial call: ${userVerdict}

Evaluate this chart screenshot against the full EDGE 16-point checklist. Be strict and educational. Walk through all 4 phases.

Respond ONLY in this exact JSON format (no extra text):
{
  "score": <0-16>,
  "p1_pass": <true/false>,
  "p2_pass": <true/false>,
  "p3_pass": <true/false>,
  "p4_pass": <true/false>,
  "verdict": "valid" | "marginal" | "invalid",
  "vs_trader": "agree" | "disagree" | "partial",
  "p1_notes": "<Location gate — what you see on this chart>",
  "p2_notes": "<Stop hunt gate — wick/fake breakout present or absent>",
  "p3_notes": "<Pattern gate — pin bar/engulfing/etc. present or absent>",
  "p4_notes": "<Session/timing — London/NY/Asian, overlap quality>",
  "coaching": "<2-3 sentences: what the trader got right, what they missed, key learning>"
}`;

  callGroqVision(prompt, bhSession.currentImage, result => {
    try {
      const json   = JSON.parse(result.match(/\{[\s\S]*\}/)[0]);
      const vc     = json.verdict === 'valid' ? 'var(--green)' : json.verdict === 'invalid' ? 'var(--red)' : 'var(--amber)';
      const agree  = { agree: '✓ Agrees with you', disagree: '✗ Disagrees with you', partial: '~ Partial agreement' };

      appendAiMsg('ai', `<strong style="color:${vc}">AI: ${json.verdict.toUpperCase()} — ${json.score}/16</strong> &nbsp;<span style="font-size:11px;color:var(--text3)">${agree[json.vs_trader] || ''}</span><br><br>` +
        `<strong>P1 Location:</strong> ${json.p1_notes}<br>` +
        `<strong>P2 Stop Hunt:</strong> ${json.p2_notes}<br>` +
        `<strong>P3 Pattern:</strong> ${json.p3_notes}<br>` +
        `<strong>P4 Session:</strong> ${json.p4_notes}<br><br>` +
        `<em style="color:var(--blue)">${json.coaching}</em><br><br>` +
        `<span style="font-size:11px;color:var(--text3)">← Tick the checklist to record your self-assessment, then save the setup.</span>`);

      // Auto-open AI drawer so user sees the analysis
      toggleAiDrawer(true);

      // Reveal checklist for self-assessment
      const bhChkWrap = document.getElementById('bh-chk-wrap');
      if (bhChkWrap) bhChkWrap.style.display = 'block';

      // Write AI result back onto the most recent setup for this pair
      const idx = backtests.findIndex(b => b.pair === bhPair && !b.aiScore);
      if (idx !== -1) {
        backtests[idx].aiScore   = json.score;
        backtests[idx].aiVerdict = json.verdict;
        backtests[idx].aiNotes   = json.coaching;
        saveBacktests();
      }

      checkBhCoachingSummary();
    } catch {
      appendAiMsg('ai', 'Could not parse AI response. Try again or check your Groq key.<br><small style="color:var(--text3)">' + result.slice(0, 200) + '</small>');
    }
  });
}

function checkBhCoachingSummary() {
  const aiScored = bhSession.setups.filter(s => s.aiScore !== null && s.aiScore !== undefined);
  if (!aiScored.length || aiScored.length % 5 !== 0) return;

  const last5 = aiScored.slice(0, 5);
  const summaryLines = last5.map((s, i) =>
    `Setup ${i+1}: User ${s.userScore}/16 (${s.userVerdict}) | AI ${s.aiScore}/16 (${s.aiVerdict}) | Outcome: ${s.outcome || 'unknown'}`
  ).join('\n');

  appendAiMsg('ai', 'Running 5-setup coaching summary…');

  const prompt = `You are EDGE, a trading coach reviewing a 5-setup backtest session on ${bhPair}.

Session results:
${summaryLines}

Identify patterns in what the trader is getting right and consistently missing. Be specific to the EDGE strategy (Location, Stop Hunt, Pattern, Session). Give 3-4 sentences of actionable coaching. No fluff.`;

  callGroq([{ role: 'user', content: prompt }], reply => {
    appendAiMsg('ai', `<strong style="color:var(--amber)">5-Setup Coaching Summary</strong><br><br>${reply}`);
  });
}

async function saveBhSetup() {
  const userScore   = parseInt(document.getElementById('bh-user-score').value) || 0;
  const userVerdict = document.getElementById('bh-user-verdict').value;
  const outcome     = document.getElementById('bh-outcome').value;
  const notes       = document.getElementById('bh-notes').value;

  const setup = {
    id:          Date.now(),
    pair:        bhPair,
    date:        today(),
    userScore,
    userVerdict,
    outcome,
    notes,
    screenshot:  bhSession.currentImage,
    aiScore:     null,
    aiVerdict:   null,
    aiNotes:     null,
    createdAt:   new Date().toISOString(),
    updatedAt:   new Date().toISOString(),
    syncStatus:  hasBackendConfig() ? 'pending' : 'local'
  };

  backtests.unshift(setup);
  bhSession.setups.unshift(setup);
  saveBacktests();

  // Update session strip
  const wins = bhSession.setups.filter(s => s.outcome && s.outcome.startsWith('Win'));
  document.getElementById('bh-session-count').textContent = bhSession.setups.length;
  document.getElementById('bh-session-wr').textContent = bhSession.setups.length ? Math.round(wins.length/bhSession.setups.length*100)+'%' : '—';

  showMsg('bh-msg', hasBackendConfig() ? 'Setup saved locally. Syncing...' : 'Setup saved locally.', 'var(--green)');
  setTimeout(() => resetBhForm(), 1500);

  // Refresh pair cards in background
  renderBhPairCards();

  if (!hasBackendConfig()) return;

  try {
    const result = await syncBacktestSetup(setup);
    setup.syncStatus = 'synced';
    setup.syncedAt = result.syncedAt || new Date().toISOString();
    if (result.screenshotUrl) setup.screenshot = result.screenshotUrl;
    saveBacktests();
    showMsg('bh-msg', 'Setup synced to Google Drive/Sheets.', 'var(--green)');
  } catch (error) {
    setup.syncStatus = 'failed';
    setup.syncError = error.message;
    saveBacktests();
    showMsg('bh-msg', 'Setup saved locally. Sync failed.', 'var(--amber)');
  }
}

function endBhSession() {
  if (bhSession.setups.length && !confirm('End session? ' + bhSession.setups.length + ' setups saved.')) return;
  hideAiToggle();
  showBhSelect();
  renderBhPairCards();
  bhPair = null;
}

// Screenshot upload — Backtest Hub
function initBhUpload() {
  const zone  = document.getElementById('bh-upload-zone');
  const input = document.getElementById('bh-file-input');
  if (!zone || !input) return;
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('drag-over'); handleBhFile(e.dataTransfer.files[0]); });
  input.addEventListener('change', () => handleBhFile(input.files[0]));
  // Clipboard paste — Ctrl+V anywhere on the page while backtest session is active
  zone._pasteHandler = e => {
    if (!document.getElementById('bh-session') || document.getElementById('bh-session').style.display === 'none') return;
    const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'));
    if (item) { e.preventDefault(); handleBhFile(item.getAsFile()); }
  };
  document.addEventListener('paste', zone._pasteHandler);
}

function handleBhFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = e => {
    bhSession.currentImage = e.target.result;
    document.getElementById('bh-preview').innerHTML = `<img src="${e.target.result}" alt="chart">`;
    const aiBtn = document.getElementById('bh-ai-btn');
    if (aiBtn) aiBtn.style.display = 'inline-flex';
    if (settings.groqKey) {
      appendAiMsg('ai', 'Chart uploaded. Give me your verdict first — score it /16 and select Valid / Marginal / Invalid above, then hit "Ask AI to Evaluate" when ready.');
    }
  };
  reader.readAsDataURL(file);
}

// ── TRADE NOW — 3-STEP CONVERSATIONAL FLOW ───────────

const TN_SYSTEM = `You are EDGE, a sharp trading mentor for the Stop Hunt + Pattern Confluence strategy. Your job is NOT to evaluate the chart for the trader — it is to make the trader think. You ask first. You challenge. You confirm or correct only after the trader has stated their read. You are direct, concise, and never condescending.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OPENING — when the trader uploads their first chart:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Do NOT start assessing immediately.
First, ask the trader ONE question: "Walk me through what you see — where's your level and why are you looking at it?"
Wait for their answer before you evaluate anything.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE FLOW — one phase per message, always ask first:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

P1 — LOCATION
Ask: "How many times has price touched that level? Does your higher TF agree with it?"
Listen to their answer. Then give your honest read of the chart — agree, challenge, or correct.
If P1 is valid, emit: {"phase":"p1","p1":[SR_within_range, confirmed_2plus_touches, HTF_agrees]}
If P1 fails, say clearly why and ask: "Do you want to find a better level or wait for this one to reset?"

P2 — STOP HUNT
Ask: "Do you see a stop hunt on this level? What type — wick, full candle, or fake break?"
Let them identify it first. Then confirm or challenge based on what you see.
A valid stop hunt: wick or candle body spiked THROUGH the level and CLOSED BACK inside.
Emit: {"phase":"p2","p2":[wick_hunt, full_candle_hunt, fake_breakout]}
If no hunt is visible: "I don't see a confirmed stop hunt yet. Price hasn't been through the level. Worth waiting."

P3 — PATTERN
Ask: "What confirmation pattern do you see forming? Name it and tell me where your entry would be."
One pattern is all that's needed. The trader names it — you validate it.
Valid patterns: pin bar, engulfing, inside bar, double top/bottom, S/R flip retest, flag.
Emit: {"phase":"p3","p3":[true]} if any valid pattern is confirmed, {"phase":"p3","p3":[false]} if not.
Also note the pattern name in your message (e.g. "That's a clean bearish engulfing — confirmed.").

P4 — SESSION & RISK
Ask these two questions together: "Any news in the next 30 minutes? And what's your entry, SL, and TP?"
Calculate R:R yourself from their numbers. Check session from chart timestamps.
Emit: {"phase":"p4","p4":[no_news, london_or_ny_session, rr_gte_1_2, under_2_losses_today]}
For losses today — ask: "How many losses have you taken today?"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FINAL VERDICT — only after all 4 phases complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Frame it as YOUR assessment + the trader's final call.
End with: "P1 ✓ P2 ✓ P3 ✓ P4 ✓ — setup is valid. You've done the work. Your call."
Or: "P2 is not confirmed. Don't force it — a setup without a stop hunt is just a breakout trade, not EDGE."

Emit this JSON on its own line (score = number of true values across all phases, max 13):
{"verdict":"GO","score":12,"direction":"long","sl":"2312.00","rr":"1:2.8","p1":[true,true,true],"p2":[true,false,false],"p3":[true],"p4":[true,true,true,true],"summary":"Strong level, clean wick hunt, pin bar entry confirmed. NY open, R:R 1:2.8."}

Verdict values: "GO" = all phases pass | "MARGINAL" = 1 phase weak but tradeable | "STOP" = fundamental phase missing

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COACHING RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Ask before you tell. Always.
- Never give the verdict before the trader has answered P1 through P4.
- If the trader skips a phase or says "looks good" without substance, push back: "What specifically looks good? Where's your level?"
- Keep messages short — max 4 sentences + JSON + next question.
- If the trader seems uncertain or is forcing a trade, say so plainly: "This looks like you want this trade, not that the setup is there."
- Never say "Great!" or "Good job" — only give specific, honest feedback.
- The trader decides. You inform. Never say "you should take this trade."
- After verdict, if GO/MARGINAL, ask: "What's your invalidation? If price does what, are you wrong?"`;


let tnState = {
  pair: '', tf: '', session: '', bias: 'none',
  charts: [], history: [], analyzing: false, verdict: null
};

function initTnUpload() {
  const zone  = document.getElementById('tn-upload-zone');
  const input = document.getElementById('tn-file-input');
  if (!zone || !input) return;
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('drag-over'); handleTnFirstFile(e.dataTransfer.files[0]); });
  input.addEventListener('change', () => handleTnFirstFile(input.files[0]));
  document.addEventListener('paste', e => {
    const tn = document.getElementById('trade-now');
    if (!tn || !tn.classList.contains('active')) return;
    const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'));
    if (!item) return;
    e.preventDefault();
    const step3 = document.getElementById('tn-step-analysis');
    if (step3 && step3.style.display !== 'none') { handleTnAttach(null, item.getAsFile()); }
    else { handleTnFirstFile(item.getAsFile()); }
  });
}

function handleTnFirstFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = e => {
    tnState.charts = [{ dataUrl: e.target.result, label: '—' }];
    document.getElementById('tn-setup-img').src = e.target.result;
    document.getElementById('tn-step-upload').style.display = 'none';
    document.getElementById('tn-step-setup').style.display  = 'block';
    window.scrollTo(0, 0);
  };
  reader.readAsDataURL(file);
}

function selectTnPair(el, pair) {
  document.querySelectorAll('#tn-pair-grid .tn-pair-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  tnState.pair = pair;
  checkTnSetupReady();
}
function showTnPairCustom() {
  document.getElementById('tn-pair-custom').style.display = 'block';
  document.getElementById('tn-pair-other-btn').style.display = 'none';
  document.getElementById('tn-pair-custom').focus();
}
function setTnPairCustom(val) {
  tnState.pair = val.trim();
  document.querySelectorAll('#tn-pair-grid .tn-pair-btn').forEach(b => b.classList.remove('active'));
  checkTnSetupReady();
}
function selectTnTf(el, tf) {
  document.querySelectorAll('#tn-tf-row .tn-pill').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  tnState.tf = tf;
  if (tnState.charts[0]) tnState.charts[0].label = tf;
  checkTnSetupReady();
}
function selectTnSess(el, sess) {
  const already = el.classList.contains('active');
  document.querySelectorAll('#tn-sess-row .tn-pill').forEach(b => b.classList.remove('active'));
  if (!already) { el.classList.add('active'); tnState.session = sess; }
  else { tnState.session = ''; }
}
function selectTnBias(bias) {
  ['long','short','none'].forEach(b => {
    const el = document.getElementById('tn-bias-' + b);
    if (el) el.classList.toggle('active', b === bias);
  });
  tnState.bias = bias;
}
function checkTnSetupReady() {
  document.getElementById('tn-start-btn').disabled = !(tnState.pair && tnState.tf);
}

function startTnAnalysis() {
  if (!tnState.pair || !tnState.tf) {
    document.getElementById('tn-setup-err').textContent = 'Select a pair and timeframe to continue.';
    return;
  }
  document.getElementById('tn-ctx-pair').textContent  = tnState.pair;
  document.getElementById('tn-ctx-sess').textContent  = tnState.session || '—';
  document.getElementById('tn-ctx-bias').textContent  = tnState.bias === 'none' ? '—' : tnState.bias;
  document.getElementById('tn-ctx-charts').textContent = '1';
  document.getElementById('tn-step-setup').style.display   = 'none';
  document.getElementById('tn-step-analysis').style.display = 'block';
  window.scrollTo(0, 0);
  const dot = document.getElementById('tn-ai-dot');
  if (dot) dot.className = 'ai-dot' + (settings.groqKey ? ' active' : '');
  addTnThumb(tnState.charts[0].dataUrl, tnState.tf);
  const ctx = `Pair: ${tnState.pair} | Timeframe: ${tnState.tf}${tnState.session ? ' | Session: ' + tnState.session : ''}${tnState.bias !== 'none' ? ' | My bias: ' + tnState.bias : ''}.
Analyse this ${tnState.tf} chart against the EDGE strategy. Walk through each phase. Ask for more timeframes if needed.`;
  tnState.history = [{ role: 'user', content: [
    { type: 'text', text: ctx },
    { type: 'image_url', image_url: { url: tnState.charts[0].dataUrl } }
  ]}];
  appendTnMsg('user', `${tnState.pair} · ${tnState.tf}${tnState.session ? ' · ' + tnState.session : ''}${tnState.bias !== 'none' ? ' · ' + tnState.bias : ''}`);
  if (!settings.groqKey) {
    appendTnMsg('ai', 'No Groq API key. Go to <a href="#" onclick="nav(\'settings\',null);return false">Settings</a> to add your key.');
    return;
  }
  appendTnMsg('ai', 'Analysing ' + tnState.pair + ' ' + tnState.tf + ' chart…');
  callTnGroq(reply => { removeTnTyping(); appendTnMsg('ai', reply); processTnAiResponse(reply); });
}

function handleTnAttach(inputEl, fileOverride) {
  const file = fileOverride || (inputEl && inputEl.files[0]);
  if (!file || !file.type.startsWith('image/')) return;
  if (tnState.charts.length >= 4) {
    appendTnMsg('ai', 'Max 4 charts per analysis. Start a new analysis to continue.');
    if (inputEl) inputEl.value = '';
    return;
  }
  if (file.size > 4 * 1024 * 1024 * 1.37) {
    appendTnMsg('ai', 'Image too large (4MB Groq limit). Please compress and try again.');
    if (inputEl) inputEl.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = e => {
    const dataUrl = e.target.result;
    const idx = tnState.charts.length + 1;
    tnState.charts.push({ dataUrl, label: 'Chart ' + idx });
    document.getElementById('tn-ctx-charts').textContent = tnState.charts.length;
    addTnThumb(dataUrl, 'Chart ' + idx);
    appendTnMsgImage(dataUrl);
    // In voice mode, confirm chart received audibly
    if (isVoiceModeEnabled('tn-chat-input')) {
      setVoiceTranscript('Chart ' + idx + ' attached');
      setVoiceStatus('Thinking…', 'thinking');
    }
    tnState.history.push({ role: 'user', content: [
      { type: 'text', text: 'Here is chart ' + idx + '. Please continue your analysis.' },
      { type: 'image_url', image_url: { url: dataUrl } }
    ]});
    if (!settings.groqKey) return;
    appendTnMsg('ai', 'Analysing chart ' + idx + '…');
    callTnGroq(reply => { removeTnTyping(); appendTnMsg('ai', reply); processTnAiResponse(reply); });
  };
  reader.readAsDataURL(file);
  if (inputEl) inputEl.value = '';
}

function sendTnMsg() {
  const input = document.getElementById('tn-chat-input');
  if (!input || !input.value.trim()) return;
  const msg = input.value.trim();
  if (activeRecognition && activeSpeechButton?.id === 'tn-mic-btn') stopSpeechInput();
  input.value = '';
  appendTnMsg('user', msg);
  tnState.history.push({ role: 'user', content: msg });
  if (!settings.groqKey) { appendTnMsg('ai', 'No API key.'); return; }
  appendTnMsg('ai', 'Thinking…');
  callTnGroq(reply => { removeTnTyping(); appendTnMsg('ai', reply); processTnAiResponse(reply); });
}

async function callTnGroq(callback) {
  if (tnState.analyzing) return;
  tnState.analyzing = true;
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + settings.groqKey },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [{ role: 'system', content: TN_SYSTEM }, ...tnState.history],
        max_tokens: 1200
      })
    });
    const data = await res.json();
    if (data.error) { callback('Error: ' + (data.error.message || JSON.stringify(data.error))); return; }
    const reply = data.choices?.[0]?.message?.content || 'No response.';
    tnState.history.push({ role: 'assistant', content: reply });
    callback(reply);
  } catch(e) { callback('Network error: ' + e.message); }
  finally { tnState.analyzing = false; }
}

function preTnChecklist(j) {
  const items = document.querySelectorAll('#tn-chk .mini-item');
  if (!items.length) return;
  // P1[0-2], P2[3-5], P3[6] (single item), P4[7-10]
  const flat = [
    ...(j.p1 || [false,false,false]),
    ...(j.p2 || [false,false,false]),
    [!!(j.p3?.[0])],                          // P3 collapsed to 1
    ...(j.p4 || [false,false,false,false])
  ].flat();
  items.forEach((el, i) => el.classList.toggle('checked', !!flat[i]));
  // Update P3 label with pattern name if provided
  if (j.p3_pattern) {
    const lbl = document.getElementById('tn-p3-label');
    if (lbl) lbl.textContent = j.p3_pattern;
  }
  updateMiniScore('tn');
}

function preTnChecklistPhase(j) {
  const items = [...document.querySelectorAll('#tn-chk .mini-item')];
  // P1→[0,1,2]  P2→[3,4,5]  P3→[6]  P4→[7,8,9,10]
  const map = { p1:[0,1,2], p2:[3,4,5], p3:[6], p4:[7,8,9,10] };
  const key = Object.keys(j).find(k => map[k]);
  if (!key) return;
  map[key].forEach((idx, i) => items[idx]?.classList.toggle('checked', !!j[key][i]));
  // Update P3 label if pattern name provided
  if (key === 'p3' && j.p3_pattern) {
    const lbl = document.getElementById('tn-p3-label');
    if (lbl) lbl.textContent = j.p3_pattern;
  }
  updateMiniScore('tn');
}

function processTnAiResponse(text) {
  // Handle partial phase JSONs emitted one phase at a time
  const partialRe = /\{"phase":"(p[1-4])","p[1-4]":\[[^\]]*\]\}/g;
  let m;
  while ((m = partialRe.exec(text)) !== null) {
    try { preTnChecklistPhase(JSON.parse(m[0])); } catch { /* ignore */ }
  }
  // Handle final verdict
  processTnVerdict(text);
}

function processTnVerdict(text) {
  const match = text.match(/\{[^{}]*"verdict"[^{}]*\}/);
  if (!match) return;
  try {
    const j = JSON.parse(match[0]);
    tnState.verdict = j;
    preTnChecklist(j);
    const vtype = j.verdict === 'GO' ? 'go' : j.verdict === 'STOP' ? 'stop' : 'marginal';
    const icons  = { go: '✅', stop: '🚫', marginal: '⚠️' };
    const dirStr = j.direction ? ' · ' + j.direction.toUpperCase() : '';
    const banner = document.getElementById('tn-verdict-banner');
    banner.className = `verdict-banner ${vtype} show`;
    banner.innerHTML = `<div class="verdict-icon">${icons[vtype]}</div><div><div>${j.verdict}${dirStr} — ${j.score}/11 · SL: ${j.sl || '—'} · R:R: ${j.rr || '—'}</div><div class="verdict-detail">${j.summary || ''}</div></div>`;
    if (vtype !== 'stop') {
      const btn = document.getElementById('tn-push-btn');
      if (btn) { btn.style.display = 'inline-flex'; btn.dataset.score = j.score; btn.dataset.dir = j.direction || ''; }
    }
    banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch { /* not valid JSON, ignore */ }
}

function appendTnMsg(from, text) {
  const msgs = document.getElementById('tn-ai-msgs');
  if (!msgs) return;
  const isAi = from === 'ai';
  const div  = document.createElement('div');
  div.className = 'ai-msg' + (isAi ? '' : ' user');
  div.innerHTML = `<div class="ai-avatar">${isAi ? 'AI' : 'ME'}</div><div class="ai-msg-body"><div class="ai-bubble">${renderAiMessage(text)}</div></div>`;
  maybeAutoSpeakReply(text, isAi, 'tn-chat-input');
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}
function appendTnMsgImage(dataUrl) {
  const msgs = document.getElementById('tn-ai-msgs');
  if (!msgs) return;
  const div = document.createElement('div');
  div.className = 'ai-msg user';
  div.innerHTML = `<div class="ai-avatar">ME</div><div class="ai-bubble"><img src="${dataUrl}" class="chat-chart" alt="chart"></div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}
function removeTnTyping() {
  const msgs = document.getElementById('tn-ai-msgs');
  if (!msgs) return;
  const bubbles = msgs.querySelectorAll('.ai-msg:not(.user) .ai-bubble');
  const last = bubbles[bubbles.length - 1];
  if (last && /^(Analysing|Thinking).*[…]$/.test(last.textContent.trim())) {
    last.closest('.ai-msg').remove();
  }
}
function addTnThumb(dataUrl, label) {
  const container = document.getElementById('tn-thumbs');
  if (!container) return;
  const div = document.createElement('div');
  div.className = 'tn-thumb';
  div.innerHTML = `<img src="${dataUrl}" alt="${label}"><div class="tn-thumb-label">${label}</div>`;
  container.appendChild(div);
}
function resetTnFlow() {
  tnState = { pair: '', tf: '', session: '', bias: 'none', charts: [], history: [], analyzing: false, verdict: null };
  ['tn-step-analysis','tn-step-setup'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
  document.getElementById('tn-step-upload').style.display = 'block';
  document.getElementById('tn-preview').innerHTML = `<div class="upload-icon">📷</div><div class="upload-label">Drop chart here</div><div class="upload-hint">click to browse · <kbd>Ctrl+V</kbd> to paste from TradingView</div>`;
  document.getElementById('tn-file-input').value = '';
  const thumbs = document.getElementById('tn-thumbs');   if (thumbs) thumbs.innerHTML = '';
  const msgs   = document.getElementById('tn-ai-msgs');  if (msgs) msgs.innerHTML = '';
  const banner = document.getElementById('tn-verdict-banner'); if (banner) banner.className = 'verdict-banner';
  document.querySelectorAll('#tn-chk .mini-item').forEach(i => i.classList.remove('checked'));
  const p3lbl = document.getElementById('tn-p3-label'); if (p3lbl) p3lbl.textContent = 'Pattern confirmed';
  updateMiniScore('tn');
  const push   = document.getElementById('tn-push-btn'); if (push) push.style.display = 'none';
  window.scrollTo(0, 0);
}
function pushTnToLog() {
  const dir   = tnState.verdict?.direction || '';
  const score = tnState.verdict?.score || '';
  const lInst = document.getElementById('l-inst');
  const lDir  = document.getElementById('l-dir');
  const lScr  = document.getElementById('l-score');
  if (lInst)  lInst.value  = tnState.pair;
  if (lDir)   lDir.value   = dir === 'long' ? 'Long' : dir === 'short' ? 'Short' : '';
  if (lScr)   lScr.value   = score;
  nav('logger', document.querySelector('[onclick*="logger"]'));
}

// ── AI DRAWER TOGGLE ─────────────────────────────────
function toggleAiDrawer(forceOpen) {
  const panel  = document.getElementById('ai-panel');
  const toggle = document.getElementById('ai-drawer-toggle');
  const badge  = document.getElementById('ai-badge');
  if (!panel) return;
  const shouldOpen = forceOpen !== undefined ? forceOpen : !panel.classList.contains('open');
  panel.classList.toggle('open', shouldOpen);
  if (toggle) toggle.classList.toggle('panel-open', shouldOpen);
  if (badge && shouldOpen) badge.style.display = 'none';
}

function showAiToggle() {
  const toggle = document.getElementById('ai-drawer-toggle');
  if (toggle) toggle.style.display = 'flex';
}

function hideAiToggle() {
  const toggle = document.getElementById('ai-drawer-toggle');
  if (toggle) { toggle.style.display = 'none'; }
  toggleAiDrawer(false); // close drawer when session ends
}

// ── AI PANEL ─────────────────────────────────────────
function renderAiPanel(mode) {
  const panel = document.getElementById('ai-panel');
  if (!panel) return;
  const dot   = panel.querySelector('.ai-dot');
  const modeEl = panel.querySelector('.ai-panel-mode');
  const msgs  = document.getElementById('ai-messages');
  const status = document.getElementById('ai-status');
  const inputWrap = document.getElementById('ai-input-wrap');

  if (dot)    dot.className = 'ai-dot' + (settings.groqKey ? ' active' : '');
  if (modeEl) modeEl.textContent = mode === 'backtest' ? 'BACKTEST COACH' : 'PRE-TRADE CHECKER';

  if (msgs) msgs.innerHTML = '';

  if (!settings.groqKey) {
    if (status) status.innerHTML = 'AI inactive. <a href="#" onclick="nav(\'settings\',null);return false">Add Groq API key in Settings</a> to activate.';
    if (inputWrap) inputWrap.style.display = 'none';
    appendAiMsg('ai', mode === 'backtest'
      ? 'Hi! I\'m your backtest coach. Once you add a Groq API key in Settings, I\'ll evaluate each setup against the full 16-point EDGE checklist and help you build pattern recognition. Upload a chart screenshot to begin.'
      : 'Hi! I\'m your pre-trade checker. Add a Groq API key in Settings to activate live AI analysis. I\'ll block any trade that fails a checklist gate.');
    return;
  }

  if (status) status.innerHTML = '';
  if (inputWrap) inputWrap.style.display = 'flex';
  appendAiMsg('ai', mode === 'backtest'
    ? 'Ready. Upload a chart screenshot and hit "Ask AI to Evaluate" — I\'ll run the full EDGE checklist analysis. The self-assessment checklist will appear after my review so you can tick it while we discuss.'
    : 'Ready. Upload your live chart screenshot, select pair and direction, then hit Analyze. I\'ll run the full 16-point checklist and give you a GO or STOP verdict. The checklist will appear after so you can tick items as you review.');
}

function appendAiMsg(from, text) {
  const msgs = document.getElementById('ai-messages');
  if (!msgs) return;
  const isAi = from === 'ai';
  const div  = document.createElement('div');
  div.className = 'ai-msg' + (isAi ? '' : ' user');
  div.innerHTML = `
    <div class="ai-avatar">${isAi ? 'AI' : 'ME'}</div>
    <div class="ai-msg-body"><div class="ai-bubble">${renderAiMessage(text)}</div></div>`;
  maybeAutoSpeakReply(text, isAi, 'ai-chat-input');
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  // Show red badge on toggle tab when drawer is closed and AI replies
  if (isAi) {
    const panel = document.getElementById('ai-panel');
    const badge = document.getElementById('ai-badge');
    if (panel && !panel.classList.contains('open') && badge) {
      badge.style.display = 'block';
    }
  }
}

function renderAiMessage(text) {
  if (!text) return '';
  if (/<\/?[a-z][\s\S]*>/i.test(text)) return text;
  return renderMarkdown(text);
}

function maybeAutoSpeakReply(rawText, isAi, inputId) {
  if (!isAi || !isVoiceModeEnabled(inputId)) return;
  autoSpeakReply(rawText, inputId);
}

function renderMarkdown(text) {
  const lines = String(text).replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let paragraph = [];
  let listType = null;
  let inCode = false;
  let codeLines = [];

  function flushParagraph() {
    if (!paragraph.length) return;
    html.push('<p>' + renderInlineMarkdown(paragraph.join('<br>')) + '</p>');
    paragraph = [];
  }

  function closeList() {
    if (!listType) return;
    html.push(listType === 'ol' ? '</ol>' : '</ul>');
    listType = null;
  }

  function flushCode() {
    if (!inCode) return;
    html.push('<pre><code>' + escapeHtml(codeLines.join('\n')) + '</code></pre>');
    inCode = false;
    codeLines = [];
  }

  lines.forEach(line => {
    if (line.trim().startsWith('```')) {
      flushParagraph();
      closeList();
      if (inCode) {
        flushCode();
      } else {
        inCode = true;
      }
      return;
    }

    if (inCode) {
      codeLines.push(line);
      return;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      closeList();
      return;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      return;
    }

    const quote = trimmed.match(/^>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      closeList();
      html.push('<blockquote>' + renderInlineMarkdown(quote[1]) + '</blockquote>');
      return;
    }

    const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      if (listType !== 'ol') {
        closeList();
        listType = 'ol';
        html.push('<ol>');
      }
      html.push('<li>' + renderInlineMarkdown(ordered[1]) + '</li>');
      return;
    }

    const unordered = trimmed.match(/^[-*]\s+(.+)$/);
    if (unordered) {
      flushParagraph();
      if (listType !== 'ul') {
        closeList();
        listType = 'ul';
        html.push('<ul>');
      }
      html.push('<li>' + renderInlineMarkdown(unordered[1]) + '</li>');
      return;
    }

    closeList();
    paragraph.push(escapeHtml(trimmed));
  });

  flushParagraph();
  closeList();
  flushCode();
  return html.join('');
}

function renderInlineMarkdown(text) {
  return String(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*]+)\*(?=[\s).,!?:;]|$)/g, '$1<em>$2</em>')
    .replace(/(^|[\s(])_([^_]+)_(?=[\s).,!?:;]|$)/g, '$1<em>$2</em>');
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── VOICE MODE ─────────────────────────────────────────
const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition || null;
let activeRecognition = null;
let activeSpeechButton = null;
let speakingButton = null;
let pendingVoiceResumeInputId = null;
const voiceModeState = {};

// Audio visualizer state
let tnAudioCtx = null, tnAnalyser = null, tnAudioStream = null, tnVisFrame = null;

function isVoiceModeEnabled(inputId) { return !!voiceModeState[inputId]; }

function setVoiceStatus(text, cls) {
  const el = document.getElementById('tn-voice-status');
  if (!el) return;
  el.textContent = text;
  el.className = 'tn-voice-status ' + (cls || '');
}

function setVoiceTranscript(text) {
  const el = document.getElementById('tn-voice-transcript');
  if (el) el.textContent = text || '';
}

function showTnVoiceUi(show) {
  const ui  = document.getElementById('tn-voice-ui');
  const bar = document.getElementById('tn-text-input-bar');
  if (ui)  ui.classList.toggle('active', show);
  if (bar) bar.style.display = show ? 'none' : 'flex';
}

function toggleVoiceMode(inputId, buttonEl) {
  const enable = !isVoiceModeEnabled(inputId);
  voiceModeState[inputId] = enable;
  buttonEl.classList.toggle('voice-mode', enable);
  buttonEl.title = enable ? 'Voice mode on — click to exit' : 'Voice mode';

  if (!enable) {
    stopSpeechInput();
    window.speechSynthesis?.cancel();
    pendingVoiceResumeInputId = null;
    if (inputId === 'tn-chat-input') { showTnVoiceUi(false); stopTnVisualizer(); }
    return;
  }
  if (!SpeechRecognitionCtor) {
    alert('Voice mode requires Chrome or Edge.');
    voiceModeState[inputId] = false;
    buttonEl.classList.remove('voice-mode');
    return;
  }
  if (inputId === 'tn-chat-input') {
    showTnVoiceUi(true);
    startTnVisualizer();
    setVoiceStatus('Listening…', 'listening');
    setVoiceTranscript('');
  }
  if (!activeRecognition) startSpeechInput(inputId, buttonEl);
}

// ── Visualizer ──────────────────────────────────────────
async function startTnVisualizer() {
  try {
    tnAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    tnAudioCtx   = new AudioContext();
    tnAnalyser   = tnAudioCtx.createAnalyser();
    tnAnalyser.fftSize = 64;
    tnAudioCtx.createMediaStreamSource(tnAudioStream).connect(tnAnalyser);
    drawTnVisualizer();
  } catch { /* mic denied — canvas stays dark */ }
}

function drawTnVisualizer() {
  const canvas = document.getElementById('tn-voice-canvas');
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = canvas.offsetWidth  * dpr;
  canvas.height = canvas.offsetHeight * dpr;
  const ctx = canvas.getContext('2d');
  const buf = tnAnalyser ? new Uint8Array(tnAnalyser.frequencyBinCount) : new Uint8Array(16);

  function frame() {
    tnVisFrame = requestAnimationFrame(frame);
    if (tnAnalyser) tnAnalyser.getByteFrequencyData(buf);
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const n = buf.length;
    const gap = 3 * dpr;
    const barW = (W - gap * (n - 1)) / n;
    buf.forEach((v, i) => {
      const ratio = v / 255;
      const h     = Math.max(4 * dpr, ratio * H);
      const y     = (H - h) / 2;
      // Gradient: amber at low volume → gold/green at high
      const hue   = 38 + ratio * 30;
      const alpha = 0.35 + ratio * 0.65;
      ctx.fillStyle = `hsla(${hue}, 90%, 55%, ${alpha})`;
      const r = Math.min(barW / 2, 4 * dpr);
      ctx.beginPath();
      ctx.roundRect(i * (barW + gap), y, barW, h, r);
      ctx.fill();
    });
  }
  frame();
}

function stopTnVisualizer() {
  if (tnVisFrame)   { cancelAnimationFrame(tnVisFrame); tnVisFrame = null; }
  if (tnAnalyser)   { try { tnAnalyser.disconnect(); } catch {} tnAnalyser = null; }
  if (tnAudioStream){ tnAudioStream.getTracks().forEach(t => t.stop()); tnAudioStream = null; }
  if (tnAudioCtx)   { try { tnAudioCtx.close(); } catch {} tnAudioCtx = null; }
}

// ── Speech input ────────────────────────────────────────
const SILENCE_MS = 1600; // ms of no new speech before auto-send

function startSpeechInput(inputId, buttonEl) {
  if (!SpeechRecognitionCtor) return;
  const input = document.getElementById(inputId);
  if (!input) return;

  const recognition = new SpeechRecognitionCtor();
  recognition.lang = 'en-US';
  recognition.interimResults = true;
  recognition.continuous = true; // keep session alive; we own the silence detection

  let finalTranscript = '';
  let silenceTimer    = null;

  activeRecognition  = recognition;
  activeSpeechButton = buttonEl;
  buttonEl.classList.add('listening');
  buttonEl.textContent = '⏹';

  const doSend = () => {
    clearTimeout(silenceTimer);
    silenceTimer = null;
    const val = input.value.trim();
    // Detach handlers then stop — prevents onend restart loop
    recognition.onresult = null;
    recognition.onerror  = null;
    recognition.onend    = null;
    try { recognition.stop(); } catch {}
    activeRecognition  = null;
    activeSpeechButton = null;
    buttonEl.classList.remove('listening');
    buttonEl.textContent = '🎙';
    if (!isVoiceModeEnabled(inputId) || !val) return;
    if (inputId === 'tn-chat-input') {
      setVoiceStatus('Thinking…', 'thinking');
      setVoiceTranscript('');
      sendTnMsg();
    } else {
      sendAiMsg();
    }
  };

  recognition.onresult = event => {
    clearTimeout(silenceTimer);
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const t = event.results[i][0]?.transcript || '';
      if (event.results[i].isFinal) finalTranscript += t + ' ';
      else interim += t;
    }
    const display = (finalTranscript + interim).trim();
    input.value = display;
    if (inputId === 'tn-chat-input') setVoiceTranscript(display);
    // Restart silence timer on every new speech
    if (display && isVoiceModeEnabled(inputId)) {
      silenceTimer = setTimeout(doSend, SILENCE_MS);
    }
  };

  recognition.onerror = e => {
    clearTimeout(silenceTimer);
    stopSpeechInput();
    if (isVoiceModeEnabled(inputId) && !window.speechSynthesis?.speaking) {
      setTimeout(() => {
        if (isVoiceModeEnabled(inputId) && !activeRecognition) startSpeechInput(inputId, buttonEl);
      }, 400);
    }
  };

  // onend only fires here on unexpected stop (network, browser cut-off) — not from doSend
  recognition.onend = () => {
    clearTimeout(silenceTimer);
    stopSpeechInput();
    if (isVoiceModeEnabled(inputId) && !window.speechSynthesis?.speaking) {
      const val = input.value.trim();
      if (val) {
        // Got cut off mid-speech — send what we have
        if (inputId === 'tn-chat-input') { setVoiceStatus('Thinking…', 'thinking'); setVoiceTranscript(''); sendTnMsg(); }
        else sendAiMsg();
      } else {
        setTimeout(() => {
          if (isVoiceModeEnabled(inputId) && !activeRecognition) {
            setVoiceStatus('Listening…', 'listening');
            startSpeechInput(inputId, buttonEl);
          }
        }, 350);
      }
    }
  };

  recognition.start();
}

function stopSpeechInput() {
  stopInterruptListener();
  if (activeRecognition) {
    activeRecognition.onend = null;
    activeRecognition.onerror = null;
    try { activeRecognition.stop(); } catch {}
  }
  if (activeSpeechButton) {
    activeSpeechButton.classList.remove('listening');
    activeSpeechButton.textContent = '🎙';
  }
  activeRecognition  = null;
  activeSpeechButton = null;
}

// ── Speech output ───────────────────────────────────────
function stripMarkdownForSpeech(text) {
  return String(text || '')
    .replace(/\{[\s\S]*?\}/g, '')           // strip JSON blobs
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_#>━]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Interrupt listener — mic running while TTS plays ───
let interruptRecognition = null;

function startInterruptListener(inputId, buttonEl) {
  if (!SpeechRecognitionCtor || interruptRecognition || activeRecognition) return;
  const recognition = new SpeechRecognitionCtor();
  recognition.lang = 'en-US';
  recognition.interimResults = true;
  recognition.continuous = false;
  interruptRecognition = recognition;

  recognition.onresult = event => {
    const t = event.results[0]?.[0]?.transcript?.trim() || '';
    if (!t) return;
    // Barge-in: kill TTS, hand off to main mic
    stopInterruptListener();
    window.speechSynthesis.cancel();
    pendingVoiceResumeInputId = null;
    const input = document.getElementById(inputId);
    if (input) { input.value = t; }
    if (inputId === 'tn-chat-input') { setVoiceTranscript(t); setVoiceStatus('Listening…', 'listening'); }
    startSpeechInput(inputId, buttonEl);
  };
  recognition.onerror = () => stopInterruptListener();
  recognition.onend   = () => { if (interruptRecognition === recognition) interruptRecognition = null; };
  try { recognition.start(); } catch {}
}

function stopInterruptListener() {
  if (!interruptRecognition) return;
  const r = interruptRecognition;
  interruptRecognition = null;
  r.onresult = r.onerror = r.onend = null;
  try { r.stop(); } catch {}
}

function autoSpeakReply(text, inputId) {
  if (!('speechSynthesis' in window)) return;
  const clean = stripMarkdownForSpeech(text);
  if (!clean || /^(Analysing|Analyzing|Thinking)/.test(clean)) return;

  window.speechSynthesis.cancel();
  stopInterruptListener();
  setVoiceStatus('Speaking…', 'speaking');
  setVoiceTranscript('');

  const buttonId = inputId === 'tn-chat-input' ? 'tn-mic-btn' : 'ai-mic-btn';
  const buttonEl = document.getElementById(buttonId);

  pendingVoiceResumeInputId = isVoiceModeEnabled(inputId) ? inputId : null;
  const utt = new SpeechSynthesisUtterance(clean);
  utt.rate  = 1.05;
  utt.pitch = 1;

  utt.onstart = () => {
    // Start interrupt listener as soon as TTS begins playing
    if (isVoiceModeEnabled(inputId) && buttonEl) startInterruptListener(inputId, buttonEl);
  };
  utt.onend = utt.onerror = () => {
    stopInterruptListener();
    setVoiceStatus('Listening…', 'listening');
    maybeResumeVoiceMode();
  };
  window.speechSynthesis.speak(utt);
}

function toggleSpeechOutput(buttonEl, text, inputId) {
  if (!('speechSynthesis' in window)) { alert('TTS not available.'); return; }
  if (window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
    if (speakingButton) { speakingButton.classList.remove('speaking'); speakingButton.textContent = '🔊'; }
    if (speakingButton === buttonEl) { speakingButton = null; pendingVoiceResumeInputId = null; return; }
  }
  pendingVoiceResumeInputId = isVoiceModeEnabled(inputId) ? inputId : null;
  const utt = new SpeechSynthesisUtterance(stripMarkdownForSpeech(text));
  utt.rate = 1; utt.pitch = 1;
  utt.onend = utt.onerror = () => {
    buttonEl.classList.remove('speaking'); buttonEl.textContent = '🔊';
    if (speakingButton === buttonEl) speakingButton = null;
    maybeResumeVoiceMode();
  };
  speakingButton = buttonEl;
  buttonEl.classList.add('speaking'); buttonEl.textContent = '⏹';
  window.speechSynthesis.speak(utt);
}

function maybeResumeVoiceMode() {
  if (!pendingVoiceResumeInputId) return;
  const inputId = pendingVoiceResumeInputId;
  pendingVoiceResumeInputId = null;
  if (!isVoiceModeEnabled(inputId) || activeRecognition) return;
  const buttonId = inputId === 'tn-chat-input' ? 'tn-mic-btn' : 'ai-mic-btn';
  const buttonEl = document.getElementById(buttonId);
  if (buttonEl) startSpeechInput(inputId, buttonEl);
}

function initSpeechUi() {
  if (SpeechRecognitionCtor) return;
  ['ai-mic-btn', 'tn-mic-btn'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) { btn.disabled = true; btn.title = 'Voice requires Chrome or Edge'; }
  });
}

function sendAiMsg() {
  const input = document.getElementById('ai-chat-input');
  if (!input || !input.value.trim()) return;
  const msg = input.value.trim();
  if (activeRecognition && activeSpeechButton?.id === 'ai-mic-btn') stopSpeechInput();
  input.value = '';
  appendAiMsg('user', msg);
  if (!settings.groqKey) {
    appendAiMsg('ai', 'API key not set. Go to Settings to add your Groq API key.');
    return;
  }
  callGroq([{ role: 'user', content: msg }], reply => appendAiMsg('ai', reply));
}



// ── PAIR PERFORMANCE PAGES ───────────────────────────
function renderPairPerf(pair, containerId) {
  const el  = document.getElementById(containerId);
  if (!el) return;
  const ps  = backtests.filter(b => b.pair === pair);
  if (!ps.length) {
    el.innerHTML = `<div class="perf-empty">No backtest sessions for ${pair} yet.<span>Start a session in Backtest Hub to populate this page.</span></div>`;
    return;
  }

  const wins  = ps.filter(b => b.outcome && b.outcome.startsWith('Win'));
  const wr    = Math.round(wins.length / ps.length * 100);
  const totalR = ps.reduce((a,b) => {
    if (!b.outcome) return a;
    if (b.outcome.startsWith('Win')) return a + (b.aiScore ? b.aiScore/16*3 : 2);
    if (b.outcome === 'Loss') return a-1;
    return a+0.5;
  }, 0);
  const aiAcc = ps.filter(b => b.aiScore).length ? Math.round(ps.filter(b => {
    const av = b.aiScore >= 12 ? 'valid' : 'invalid';
    const ov = b.outcome && b.outcome !== 'Loss' ? 'valid' : 'invalid';
    return av === ov;
  }).length / ps.filter(b => b.aiScore).length * 100) : null;

  const sorted = [...ps].sort((a, b) => a.date.localeCompare(b.date));
  const chartId = containerId + '-chart';

  el.innerHTML = `
    <div class="metrics" style="margin-bottom:16px">
      <div class="metric"><div class="metric-label">Sessions</div><div class="metric-val">${ps.length}</div></div>
      <div class="metric"><div class="metric-label">Win rate</div><div class="metric-val ${wr>=65?'pos':wr>=40?'warn':'neg'}">${wr}%</div></div>
      <div class="metric"><div class="metric-label">Est. net R</div><div class="metric-val ${totalR>=0?'pos':'neg'}">${totalR>=0?'+':''}${totalR.toFixed(1)}R</div></div>
      <div class="metric"><div class="metric-label">AI accuracy</div><div class="metric-val" style="color:var(--blue)">${aiAcc !== null ? aiAcc+'%' : '—'}</div></div>
    </div>
    <div class="card" style="margin-bottom:16px">
      <div class="card-title">Score trend <span style="font-size:11px;font-weight:400;color:var(--text3);font-family:var(--mono)">your score vs AI score (/16)</span></div>
      <canvas id="${chartId}" height="150"></canvas>
    </div>
    <div class="card">
      <div class="card-title">Session log</div>
      <div class="session-row session-row-head">
        <span>Date</span><span>Your score</span><span>AI score</span><span>Verdict</span><span>Outcome</span><span>Your read</span><span>Notes</span>
      </div>
      ${ps.map(b => {
        const oc = !b.outcome ? 'var(--text3)' : b.outcome.startsWith('Win') ? 'var(--green)' : b.outcome==='Loss' ? 'var(--red)' : 'var(--amber)';
        return `<div class="session-row">
          <span class="mono" style="color:var(--text3)">${b.date}</span>
          <span class="mono" style="color:${b.userScore>=12?'var(--green)':b.userScore>=10?'var(--amber)':'var(--red)'}">${b.userScore||'—'}/16</span>
          <span class="mono" style="color:var(--blue)">${b.aiScore?b.aiScore+'/16':'—'}</span>
          <span><span class="tag ${b.userVerdict==='valid'?'tg':b.userVerdict==='marginal'?'tw':'tr'}">${b.userVerdict||'—'}</span></span>
          <span style="color:${oc};font-weight:500;font-size:12px">${b.outcome||'—'}</span>
          <span class="tag ${b.userVerdict==='valid'?'tg':'tr'}">${b.userVerdict||'—'}</span>
          <span style="font-size:11px;color:var(--text3)">${b.notes||'—'}</span>
        </div>`;
      }).join('')}
    </div>`;

  // Render score trend chart
  const scoreCanvas = document.getElementById(chartId);
  if (scoreCanvas && typeof Chart !== 'undefined') {
    const labels    = sorted.map(b => b.date.slice(5));
    const userScores = sorted.map(b => b.userScore || 0);
    const aiScores   = sorted.map(b => b.aiScore   || null);
    const chartKey   = '_perfChart_' + containerId;
    if (window[chartKey]) window[chartKey].destroy();
    window[chartKey] = new Chart(scoreCanvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Your score', data: userScores,
            borderColor: 'rgba(251,191,36,.8)', backgroundColor: 'rgba(251,191,36,.06)',
            tension: 0.3, borderWidth: 2, pointRadius: 3, fill: false },
          { label: 'AI score', data: aiScores,
            borderColor: 'rgba(96,165,250,.8)', backgroundColor: 'rgba(96,165,250,.06)',
            tension: 0.3, borderWidth: 2, pointRadius: 3, fill: false,
            spanGaps: true }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { labels: { color: 'rgba(255,255,255,.5)', font: { family: 'DM Sans', size: 11 },
                              boxWidth: 12 } },
          tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + ctx.raw + '/16' } }
        },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,.04)' },
               ticks: { color: 'rgba(255,255,255,.3)', font: { family: 'Space Mono', size: 9 },
                        maxTicksLimit: 10 }},
          y: { min: 0, max: 16,
               grid: { color: 'rgba(255,255,255,.04)' },
               ticks: { color: 'rgba(255,255,255,.35)', font: { family: 'Space Mono', size: 9 },
                        stepSize: 4 }}
        }
      }
    });
  }
}

// ── SIMULATOR ────────────────────────────────────────
function runSim() {
  const bal    = parseFloat(document.getElementById('s-bal').value) || 5000;
  const risk   = parseFloat(document.getElementById('s-risk').value) || 1;
  const trds   = parseInt(document.getElementById('s-trades').value) || 12;
  const wr     = parseInt(document.getElementById('s-wr').value) || 65;
  const rr     = parseInt(document.getElementById('s-rr').value) / 10;

  document.getElementById('sv-trades').textContent = trds;
  document.getElementById('sv-wr').textContent     = wr + '%';
  document.getElementById('sv-rr').textContent     = rr.toFixed(1);

  const winRate = wr / 100;
  const ev      = (winRate * rr) - ((1 - winRate) * 1);
  const riskAmt = bal * (risk / 100);
  const mProfit = ev * riskAmt * trds;
  const mPct    = (mProfit / bal) * 100;
  let b6 = bal, b12 = bal;
  for (let i = 0; i < 6; i++)  b6  *= (1 + mPct/100);
  for (let i = 0; i < 12; i++) b12 *= (1 + mPct/100);

  document.getElementById('sim-metrics').innerHTML = `
    <div class="metric"><div class="metric-label">Monthly return</div><div class="metric-val ${mPct>=0?'pos':'neg'}">${mPct.toFixed(1)}%</div></div>
    <div class="metric"><div class="metric-label">Monthly profit</div><div class="metric-val ${mProfit>=0?'pos':'neg'}">$${Math.round(mProfit).toLocaleString()}</div></div>
    <div class="metric"><div class="metric-label">After 6 months</div><div class="metric-val warn">$${Math.round(b6).toLocaleString()}</div></div>
  `;

  const beWR     = Math.round(1/(1+rr)*100);
  const evColor  = ev>0?'rgba(74,222,128,.08)':'rgba(248,113,113,.08)';
  const evBorder = ev>0?'rgba(74,222,128,.2)':'rgba(248,113,113,.2)';
  const evText   = ev>0?'var(--green)':'var(--red)';
  const evEl     = document.getElementById('ev-block');
  evEl.style.background   = evColor;
  evEl.style.borderColor  = evBorder;
  evEl.innerHTML = `<div style="font-size:12px;font-family:var(--mono);color:${evText}">EV = ${ev.toFixed(2)}R &nbsp;·&nbsp; Break-even WR at ${rr.toFixed(1)}:1 = ${beWR}% &nbsp;·&nbsp; 12 months: <strong>$${Math.round(b12).toLocaleString()}</strong></div>`;

  let chart = `<div style="display:grid;grid-template-columns:46px 1fr 80px;gap:8px;padding:6px 0;border-bottom:1px solid var(--border2);font-size:10px;font-family:var(--mono);color:var(--text3);text-transform:uppercase;letter-spacing:.06em"><span>Month</span><span>Balance</span><span style="text-align:right">Growth</span></div>`;
  let b = bal;
  for (let m = 1; m <= 12; m++) {
    b *= (1 + mPct/100);
    const pct = (b-bal)/bal*100;
    const bw  = Math.min(Math.max(Math.abs(pct)/2,2),100);
    const bc  = pct>=0?'var(--green2)':'var(--red2)';
    chart += `<div style="display:grid;grid-template-columns:46px 1fr 80px;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);align-items:center">
      <span class="mono" style="color:var(--text3)">M${m}</span>
      <div style="display:flex;align-items:center;gap:8px">
        <div style="flex:1;height:6px;background:var(--bg4);border-radius:3px"><div style="width:${bw}%;height:100%;border-radius:3px;background:${bc}"></div></div>
        <span style="font-size:12px">$${Math.round(b).toLocaleString()}</span>
      </div>
      <span class="mono" style="text-align:right;color:${pct>=0?'var(--green)':'var(--red)'}">${pct>=0?'+':''}${pct.toFixed(1)}%</span>
    </div>`;
  }
  document.getElementById('sim-chart').innerHTML = chart;
}

// ── SETTINGS ─────────────────────────────────────────
function loadSettings() {
  const gk = document.getElementById('set-groq-key');
  const su = document.getElementById('set-sheets-url');
  const du = document.getElementById('set-drive-url');
  settings = normalizeSettings(settings);
  if (gk && settings.groqKey)    gk.value = settings.groqKey;
  if (su) su.value = settings.appsScriptUrl || settings.sheetsUrl;
  if (du) du.value = settings.appsScriptUrl || settings.driveUrl;
}

function saveSettingsForm() {
  const gk = document.getElementById('set-groq-key');
  const su = document.getElementById('set-sheets-url');
  const du = document.getElementById('set-drive-url');
  const primaryUrl = su && su.value.trim() ? su.value.trim() : (du ? du.value.trim() : '');
  settings.groqKey   = gk ? gk.value.trim() : '';
  settings.appsScriptUrl = primaryUrl;
  settings.sheetsUrl = su ? su.value.trim() : '';
  settings.driveUrl  = du ? du.value.trim() : '';
  saveSettings();
  showMsg('set-msg', 'Settings saved!', 'var(--green)');
}

// ── GROQ API ─────────────────────────────────────────
function getBackendUrl() {
  settings = normalizeSettings(settings);
  return settings.appsScriptUrl || '';
}

function hasBackendConfig() {
  return !!getBackendUrl();
}

function buildSyncMeta() {
  return {
    client: EDGE_CLIENT_NAME,
    version: EDGE_SYNC_VERSION
  };
}

function sanitizeImagePayload(imageData) {
  if (!imageData || typeof imageData !== 'string') return null;
  const match = imageData.match(/^data:(.+?);base64,/);
  return {
    fileName: 'edge-' + Date.now() + '.png',
    mimeType: match ? match[1] : 'image/png',
    dataUrl: imageData
  };
}

function mapTradeForSync(trade) {
  return {
    id: String(trade.id),
    mode: trade.mode || 'live',
    date: trade.date || today(),
    pair: trade.pair || trade.inst || '',
    direction: trade.direction || trade.dir || '',
    entry: trade.entry ?? null,
    sl: trade.sl ?? null,
    tp: trade.tp ?? null,
    pattern: trade.pattern || trade.pat || '',
    hunt: trade.hunt || '',
    outcome: trade.outcome || trade.out || '',
    score: trade.score ?? null,
    rr: trade.rr ?? null,
    session: trade.session || '',
    notes: trade.notes || '',
    screenshot: trade.screenshot || null,
    aiScore: trade.aiScore ?? null,
    aiVerdict: trade.aiVerdict || null,
    createdAt: trade.createdAt || new Date(Number(trade.id) || Date.now()).toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function mapBacktestForSync(setup) {
  const screenshot = setup.screenshot && typeof setup.screenshot === 'string'
    ? sanitizeImagePayload(setup.screenshot)
    : setup.screenshot || null;

  return {
    id: String(setup.id),
    mode: setup.mode || 'backtest',
    date: setup.date || today(),
    pair: setup.pair || '',
    userScore: setup.userScore ?? null,
    userVerdict: setup.userVerdict || '',
    outcome: setup.outcome || '',
    notes: setup.notes || '',
    aiScore: setup.aiScore ?? null,
    aiVerdict: setup.aiVerdict || null,
    aiNotes: setup.aiNotes || null,
    screenshot,
    createdAt: setup.createdAt || new Date(Number(setup.id) || Date.now()).toISOString(),
    updatedAt: new Date().toISOString()
  };
}

async function callEdgeBackend(action, options = {}) {
  const baseUrl = getBackendUrl();
  if (!baseUrl) throw new Error('Apps Script URL not set.');

  const method = options.method || 'POST';
  const url = new URL(baseUrl);
  url.searchParams.set('action', action);

  const fetchOptions = {
    method,
    headers: {}
  };

  if (method === 'POST') {
    fetchOptions.headers['Content-Type'] = 'text/plain;charset=utf-8';
    fetchOptions.body = JSON.stringify({
      action,
      ...buildSyncMeta(),
      ...(options.body || {})
    });
  }

  const res = await fetch(url.toString(), fetchOptions);
  if (!res.ok) throw new Error('Sync request failed (' + res.status + ').');

  const text = await res.text();
  if (!text) return { ok: true };

  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Sync response was not valid JSON.');
  }
}

async function syncLiveTrade(trade) {
  return callEdgeBackend('logTrade', {
    body: { trade: mapTradeForSync(trade) }
  });
}

async function syncBacktestSetup(setup) {
  return callEdgeBackend('logBacktest', {
    body: { setup: mapBacktestForSync(setup) }
  });
}

async function fetchSyncedData() {
  return callEdgeBackend('getTrades', { method: 'GET' });
}

async function testBackendConnection() {
  return callEdgeBackend('health', { method: 'GET' });
}

async function testMt5Connection() {
  const statusEl = document.getElementById('mt5-conn-status');
  if (!statusEl) return;
  if (!hasBackendConfig()) {
    statusEl.style.color = 'var(--amber)';
    statusEl.textContent = 'No Apps Script URL set. Go to Settings first.';
    return;
  }
  statusEl.style.color = 'var(--text3)';
  statusEl.textContent = 'Pinging…';
  try {
    const res = await testBackendConnection();
    if (res && res.ok !== false) {
      statusEl.style.color = 'var(--green)';
      statusEl.textContent = 'Connected — Apps Script endpoint is live. EA can now log trades.';
    } else {
      statusEl.style.color = 'var(--amber)';
      statusEl.textContent = 'Endpoint responded but returned an error: ' + (res.error || JSON.stringify(res));
    }
  } catch (e) {
    statusEl.style.color = 'var(--red)';
    statusEl.textContent = 'Connection failed: ' + e.message + '. Check URL in Settings.';
  }
}

function normalizeTradeRecord(trade) {
  return {
    ...trade,
    id: trade.id,
    inst: trade.inst || trade.pair || '',
    dir: trade.dir || trade.direction || '',
    pat: trade.pat || trade.pattern || '',
    out: trade.out || trade.outcome || '',
    pair: trade.pair || trade.inst || '',
    direction: trade.direction || trade.dir || '',
    pattern: trade.pattern || trade.pat || '',
    outcome: trade.outcome || trade.out || ''
  };
}

function normalizeBacktestRecord(setup) {
  return {
    ...setup,
    mode: setup.mode || 'backtest'
  };
}

function mergeById(localRecords, remoteRecords, normalizeFn) {
  const merged = new Map();

  localRecords.forEach(record => {
    merged.set(String(record.id), normalizeFn(record));
  });

  remoteRecords.forEach(record => {
    const remote = normalizeFn(record);
    const key = String(remote.id);
    const local = merged.get(key) || {};
    merged.set(key, {
      ...local,
      ...remote,
      syncStatus: 'synced',
      syncedAt: remote.syncedAt || remote.updatedAt || local.syncedAt || new Date().toISOString()
    });
  });

  return [...merged.values()].sort((a, b) => Number(b.id) - Number(a.id));
}

async function hydrateFromBackend() {
  if (!hasBackendConfig()) return;

  try {
    const data = await fetchSyncedData();
    const remoteTrades = Array.isArray(data.liveTrades) ? data.liveTrades : [];
    const remoteBacktests = Array.isArray(data.backtestSessions) ? data.backtestSessions : [];

    trades = mergeById(trades, remoteTrades, normalizeTradeRecord);
    backtests = mergeById(backtests, remoteBacktests, normalizeBacktestRecord);

    saveTrades();
    saveBacktests();
    updateDashboard();
    updateSidebar();
  } catch (error) {
    console.warn('Initial sync failed:', error.message);
  }
}

async function callGroq(messages, callback) {
  if (!settings.groqKey) { callback('No API key set.'); return; }
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + settings.groqKey },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [
          { role: 'system', content: 'You are EDGE AI, a strict trading coach for the Stop Hunt + Pattern Confluence strategy. Be concise, decisive, and always reference the 16-point checklist.' },
          ...messages
        ],
        max_tokens: 600
      })
    });
    const data = await res.json();
    callback(data.choices?.[0]?.message?.content || 'No response.');
  } catch(e) { callback('Error: ' + e.message); }
}

async function callGroqVision(prompt, imageData, callback) {
  if (!settings.groqKey) { callback('No API key.'); return; }
  // Groq base64 limit is 4MB — warn early rather than getting a cryptic 413
  if (imageData && imageData.length > 4 * 1024 * 1024 * 1.37) { // base64 is ~37% larger than raw
    callback('Image too large for Groq (4MB base64 limit). Please compress the screenshot and try again.');
    return;
  }
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + settings.groqKey },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageData } }
          ]
        }],
        max_tokens: 800
      })
    });
    const data = await res.json();
    callback(data.choices?.[0]?.message?.content || 'No response.');
  } catch(e) { callback('Error: ' + e.message); }
}

// ── UTILS ─────────────────────────────────────────────
function today() { return new Date().toISOString().slice(0,10); }
function showMsg(id, text, color) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text; el.style.color = color;
  setTimeout(() => { el.textContent = ''; }, 2800);
}
function download(content, filename, type) {
  const a = document.createElement('a');
  a.href = 'data:'+type+';charset=utf-8,' + encodeURIComponent(content);
  a.download = filename; a.click();
}
function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-'+tab));
}

// ── INIT ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const dateEl = document.getElementById('l-date');
  if (dateEl) dateEl.value = today();

  await loadRuntimeEnv();
  settings = normalizeSettings(settings);
  hydrateSettingsFromEnv();
  initSpeechUi();
  initBhUpload();
  initTnUpload();
  loadSettings();
  await hydrateFromBackend();
  updateDashboard();
  updateSidebar();
  runSim();
  initBacktestHub();
});
