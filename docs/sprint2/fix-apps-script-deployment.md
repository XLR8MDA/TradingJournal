# Fix: Apps Script Deployment Access

## Problem
The Apps Script endpoint at `EDGE_APPS_SCRIPT_URL` currently redirects to Google
sign-in when called without authentication. This means:
- `testBackendConnection()` will fail in the browser
- The MT5 EA's `WebRequest()` calls will fail
- `hydrateFromBackend()` on app load will silently fail and fall back to localStorage only

## Root Cause
The Apps Script web app was deployed with **"Execute as: Me"** but **"Who has access: Anyone
with Google account"** (or stricter). It must be **"Anyone"** (including anonymous).

## Fix Steps (5 minutes)
1. Open [script.google.com](https://script.google.com)
2. Open the EDGE Journal project
3. Click **Deploy → Manage deployments**
4. Click the pencil (edit) on the active deployment
5. Under **"Who has access"** → change to **Anyone**
6. Click **Deploy** → copy the new URL if it changed
7. Update `D:\TradeJournal\.env` → `EDGE_APPS_SCRIPT_URL=<new url>`

## Verify
After redeployment, run in browser console:
```js
fetch('YOUR_URL?action=health').then(r => r.json()).then(console.log)
```
Should return `{ ok: true, version: 1, ... }` — not a Google sign-in page.

## Impact
Blocks: live sync, MT5 EA logging, Settings connection test, cross-device data sync.
