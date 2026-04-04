# EDGE Apps Script Backend

This folder contains the Google Apps Script backend that matches the frontend sync helpers in `app.js`.

## Files

- `Code.gs`: web app backend for Google Sheets + Drive

## What it does

- `GET ?action=health`
- `GET ?action=getTrades`
- `POST action=logTrade`
- `POST action=logBacktest`

It stores:

- live trades in sheet `live_trades`
- backtest setups in sheet `backtest_sessions`
- screenshots in Drive folder `EDGE/screenshots` by default

## Required setup

1. Create a Google Sheet.
2. Open `Extensions -> Apps Script`.
3. Paste in `Code.gs`.
4. In Apps Script, open `Project Settings -> Script properties`.
5. Add:

```text
EDGE_SPREADSHEET_ID=your_google_sheet_id
```

6. Optional: if you want a specific Drive folder instead of auto-creating `EDGE/screenshots`, add:

```text
EDGE_DRIVE_FOLDER_ID=your_drive_folder_id
```

## Deploy

1. Click `Deploy -> New deployment`.
2. Type: `Web app`
3. Execute as: `Me`
4. Who has access: `Anyone`
5. Deploy and copy the web app URL.

Use that web app URL in the journal Settings as the backend endpoint.

## Notes

- The frontend sends JSON as `text/plain`, which Apps Script accepts reliably in `doPost`.
- Rows are upserted by `ID`, so repeated syncs update existing records instead of blindly duplicating them.
- Backtest screenshots are uploaded to Drive only when a `dataUrl` payload is sent.
