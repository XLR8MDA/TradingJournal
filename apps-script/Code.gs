const EDGE_VERSION = 1;
const EDGE_LIVE_SHEET = 'live_trades';
const EDGE_BACKTEST_SHEET = 'backtest_sessions';
const EDGE_FOLDER_PATH = 'EDGE/screenshots';

const LIVE_HEADERS = [
  'ID',
  'Created_At',
  'Updated_At',
  'Date',
  'Mode',
  'Pair',
  'Direction',
  'Entry',
  'SL',
  'TP',
  'Pattern',
  'Hunt',
  'Outcome',
  'Score',
  'RR',
  'Session',
  'Notes',
  'Screenshot_URL',
  'AI_Score',
  'AI_Verdict',
  'Synced_At'
];

const BACKTEST_HEADERS = [
  'ID',
  'Created_At',
  'Updated_At',
  'Date',
  'Mode',
  'Pair',
  'User_Score',
  'User_Verdict',
  'Outcome',
  'Notes',
  'Screenshot_URL',
  'AI_Score',
  'AI_Verdict',
  'AI_Notes',
  'Synced_At'
];

function doGet(e) {
  try {
    const action = getAction_(e);

    if (action === 'health') return jsonOutput_(healthResponse_());
    if (action === 'getTrades') return jsonOutput_(getTradesResponse_());

    return jsonOutput_({
      ok: false,
      error: 'Unsupported GET action: ' + action
    });
  } catch (error) {
    return jsonOutput_(errorResponse_(error));
  }
}

function doPost(e) {
  try {
    const payload = parseRequestBody_(e);
    const action = payload.action || getAction_(e);

    if (action === 'logTrade') {
      return jsonOutput_(logTrade_(payload.trade || {}));
    }

    if (action === 'logBacktest') {
      return jsonOutput_(logBacktest_(payload.setup || {}));
    }

    return jsonOutput_({
      ok: false,
      error: 'Unsupported POST action: ' + action
    });
  } catch (error) {
    return jsonOutput_(errorResponse_(error));
  }
}

function logTrade_(trade) {
  if (!trade.id) throw new Error('Trade id is required.');

  const spreadsheet = getSpreadsheet_();
  const sheet = ensureSheet_(spreadsheet, EDGE_LIVE_SHEET, LIVE_HEADERS);
  const syncedAt = nowIso_();
  const screenshotUrl = normalizeScreenshotUrl_(trade.screenshot);

  upsertRow_(
    sheet,
    'ID',
    String(trade.id),
    LIVE_HEADERS,
    [
      String(trade.id),
      trade.createdAt || syncedAt,
      trade.updatedAt || syncedAt,
      trade.date || '',
      trade.mode || 'live',
      trade.pair || '',
      trade.direction || '',
      nullable_(trade.entry),
      nullable_(trade.sl),
      nullable_(trade.tp),
      trade.pattern || '',
      trade.hunt || '',
      trade.outcome || '',
      nullable_(trade.score),
      nullable_(trade.rr),
      trade.session || '',
      trade.notes || '',
      screenshotUrl || '',
      nullable_(trade.aiScore),
      trade.aiVerdict || '',
      syncedAt
    ]
  );

  return {
    ok: true,
    action: 'logTrade',
    id: String(trade.id),
    sheet: EDGE_LIVE_SHEET,
    screenshotUrl: screenshotUrl || null,
    syncedAt: syncedAt
  };
}

function logBacktest_(setup) {
  if (!setup.id) throw new Error('Backtest setup id is required.');

  const spreadsheet = getSpreadsheet_();
  const sheet = ensureSheet_(spreadsheet, EDGE_BACKTEST_SHEET, BACKTEST_HEADERS);
  const syncedAt = nowIso_();
  const upload = uploadScreenshotIfNeeded_(setup.screenshot, setup.pair, setup.date, String(setup.id));
  const screenshotUrl = upload ? upload.url : normalizeScreenshotUrl_(setup.screenshot);

  upsertRow_(
    sheet,
    'ID',
    String(setup.id),
    BACKTEST_HEADERS,
    [
      String(setup.id),
      setup.createdAt || syncedAt,
      setup.updatedAt || syncedAt,
      setup.date || '',
      setup.mode || 'backtest',
      setup.pair || '',
      nullable_(setup.userScore),
      setup.userVerdict || '',
      setup.outcome || '',
      setup.notes || '',
      screenshotUrl || '',
      nullable_(setup.aiScore),
      setup.aiVerdict || '',
      setup.aiNotes || '',
      syncedAt
    ]
  );

  return {
    ok: true,
    action: 'logBacktest',
    id: String(setup.id),
    sheet: EDGE_BACKTEST_SHEET,
    screenshotUrl: screenshotUrl || null,
    driveFileId: upload ? upload.id : null,
    syncedAt: syncedAt
  };
}

function getTradesResponse_() {
  const spreadsheet = getSpreadsheet_();
  const liveSheet = ensureSheet_(spreadsheet, EDGE_LIVE_SHEET, LIVE_HEADERS);
  const backtestSheet = ensureSheet_(spreadsheet, EDGE_BACKTEST_SHEET, BACKTEST_HEADERS);

  return {
    ok: true,
    liveTrades: readLiveTrades_(liveSheet),
    backtestSessions: readBacktests_(backtestSheet),
    syncedAt: nowIso_()
  };
}

function healthResponse_() {
  const spreadsheet = getSpreadsheet_();
  ensureSheet_(spreadsheet, EDGE_LIVE_SHEET, LIVE_HEADERS);
  ensureSheet_(spreadsheet, EDGE_BACKTEST_SHEET, BACKTEST_HEADERS);

  return {
    ok: true,
    service: 'EDGE Apps Script',
    version: EDGE_VERSION,
    spreadsheetId: spreadsheet.getId(),
    sheets: [EDGE_LIVE_SHEET, EDGE_BACKTEST_SHEET],
    driveFolderReady: !!getScreenshotFolder_(false),
    syncedAt: nowIso_()
  };
}

function readLiveTrades_(sheet) {
  return readSheetObjects_(sheet).map(function(row) {
    return {
      id: row.ID,
      mode: row.Mode || 'live',
      date: row.Date || '',
      pair: row.Pair || '',
      direction: row.Direction || '',
      entry: numberOrNull_(row.Entry),
      sl: numberOrNull_(row.SL),
      tp: numberOrNull_(row.TP),
      pattern: row.Pattern || '',
      hunt: row.Hunt || '',
      outcome: row.Outcome || '',
      score: numberOrNull_(row.Score),
      rr: numberOrNull_(row.RR),
      session: row.Session || '',
      notes: row.Notes || '',
      screenshot: row.Screenshot_URL || '',
      aiScore: numberOrNull_(row.AI_Score),
      aiVerdict: row.AI_Verdict || '',
      createdAt: row.Created_At || '',
      updatedAt: row.Updated_At || '',
      syncedAt: row.Synced_At || ''
    };
  });
}

function readBacktests_(sheet) {
  return readSheetObjects_(sheet).map(function(row) {
    return {
      id: row.ID,
      mode: row.Mode || 'backtest',
      date: row.Date || '',
      pair: row.Pair || '',
      userScore: numberOrNull_(row.User_Score),
      userVerdict: row.User_Verdict || '',
      outcome: row.Outcome || '',
      notes: row.Notes || '',
      screenshot: row.Screenshot_URL || '',
      aiScore: numberOrNull_(row.AI_Score),
      aiVerdict: row.AI_Verdict || '',
      aiNotes: row.AI_Notes || '',
      createdAt: row.Created_At || '',
      updatedAt: row.Updated_At || '',
      syncedAt: row.Synced_At || ''
    };
  });
}

function ensureSheet_(spreadsheet, sheetName, headers) {
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) sheet = spreadsheet.insertSheet(sheetName);

  const currentHeaders = sheet.getLastColumn()
    ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    : [];

  const needsHeaders = headers.some(function(header, index) {
    return currentHeaders[index] !== header;
  });

  if (needsHeaders) {
    sheet.clear();
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function upsertRow_(sheet, keyHeader, keyValue, headers, values) {
  const records = readSheetObjects_(sheet);
  const rowIndex = records.findIndex(function(record) {
    return String(record[keyHeader]) === String(keyValue);
  });

  if (rowIndex >= 0) {
    sheet.getRange(rowIndex + 2, 1, 1, headers.length).setValues([values]);
    return rowIndex + 2;
  }

  sheet.appendRow(values);
  return sheet.getLastRow();
}

function readSheetObjects_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];

  const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = values[0];

  return values.slice(1).filter(function(row) {
    return row.some(function(cell) { return cell !== ''; });
  }).map(function(row) {
    const record = {};
    headers.forEach(function(header, index) {
      record[header] = row[index];
    });
    return record;
  });
}

function uploadScreenshotIfNeeded_(screenshot, pair, date, id) {
  if (!screenshot) return null;
  if (typeof screenshot === 'string') {
    const normalizedUrl = normalizeScreenshotUrl_(screenshot);
    return normalizedUrl ? { id: null, url: normalizedUrl } : null;
  }

  if (!screenshot.dataUrl) return null;

  const match = screenshot.dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!match) throw new Error('Invalid screenshot data URL.');

  const mimeType = screenshot.mimeType || match[1] || 'image/png';
  const bytes = Utilities.base64Decode(match[2]);
  const extension = extensionForMime_(mimeType);
  const safePair = String(pair || 'setup').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const safeDate = String(date || nowIso_().slice(0, 10));
  const fileName = screenshot.fileName || [safePair || 'setup', safeDate, id].join('-') + '.' + extension;
  const blob = Utilities.newBlob(bytes, mimeType, fileName);
  const folder = getScreenshotFolder_(true);
  const file = folder.createFile(blob);

  return {
    id: file.getId(),
    url: file.getUrl()
  };
}

function getScreenshotFolder_(createIfMissing) {
  const props = PropertiesService.getScriptProperties();
  const configuredId = props.getProperty('EDGE_DRIVE_FOLDER_ID');
  if (configuredId) {
    try {
      return DriveApp.getFolderById(configuredId);
    } catch (error) {
      if (!createIfMissing) return null;
      throw new Error('Configured EDGE_DRIVE_FOLDER_ID is invalid.');
    }
  }

  const rootName = EDGE_FOLDER_PATH.split('/')[0];
  const childName = EDGE_FOLDER_PATH.split('/')[1];
  let rootFolder = getOrCreateFolderByName_(DriveApp.getRootFolder(), rootName, createIfMissing);
  if (!rootFolder) return null;
  return getOrCreateFolderByName_(rootFolder, childName, createIfMissing);
}

function getOrCreateFolderByName_(parent, name, createIfMissing) {
  const folders = parent.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return createIfMissing ? parent.createFolder(name) : null;
}

function getSpreadsheet_() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty('EDGE_SPREADSHEET_ID');
  if (spreadsheetId) return SpreadsheetApp.openById(spreadsheetId);
  return SpreadsheetApp.getActiveSpreadsheet();
}

function parseRequestBody_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  return JSON.parse(e.postData.contents);
}

function getAction_(e) {
  return (e && e.parameter && e.parameter.action) || '';
}

function jsonOutput_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function errorResponse_(error) {
  return {
    ok: false,
    error: error && error.message ? error.message : String(error),
    syncedAt: nowIso_()
  };
}

function normalizeScreenshotUrl_(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    return value.indexOf('http') === 0 ? value : null;
  }
  if (value.url && String(value.url).indexOf('http') === 0) return value.url;
  return null;
}

function extensionForMime_(mimeType) {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/gif') return 'gif';
  return 'png';
}

function nullable_(value) {
  return value === null || typeof value === 'undefined' ? '' : value;
}

function numberOrNull_(value) {
  if (value === '' || value === null || typeof value === 'undefined') return null;
  const num = Number(value);
  return isNaN(num) ? null : num;
}

function nowIso_() {
  return new Date().toISOString();
}
