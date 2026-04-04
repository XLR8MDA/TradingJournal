# Feature: Per-User Secrets Isolation

## Problem
The journal is currently a single-user app — Groq API key and Apps Script URL are stored
in `localStorage` under generic keys (`edge_settings`). If the app is ever shared or
hosted publicly, anyone who opens it on the same device/browser shares those keys.

More importantly: the `.env` file on the server exposes `EDGE_APPS_SCRIPT_URL` to ALL
visitors (it's fetched via plain HTTP). This means anyone who opens the journal sees your
Apps Script endpoint.

## What "used by others" means for this app
The journal is a static web app. "Multi-user" means different people opening the same
Netlify URL in their own browsers — each person should have their OWN:
- Groq API key
- Apps Script URL (pointing to their own Google Sheet)
- Trade data

## Solution: Namespace by user ID

### Approach
1. On first visit, generate a random `userId` (UUID) stored in `localStorage`
2. All localStorage keys are namespaced: `edge_trades_<userId>`, `edge_settings_<userId>`
3. Settings page shows the userId so the user can note it down / share across devices
4. Optional: password-protect the userId with a PIN (hashed, never sent anywhere)

### .env security
- Move `EDGE_APPS_SCRIPT_URL` out of `.env` (it's not a secret — it's a user-specific URL)
- Each user enters their own Apps Script URL in Settings → saved to their namespaced localStorage
- Server `.env` only used for default fallback during development
- On production (Netlify): do NOT serve `.env` — add to `_redirects`:
  ```
  /.env  /index.html  404
  ```

### Implementation

**app.js changes:**
```js
// On init
if (!localStorage.getItem('edge_userId')) {
  localStorage.setItem('edge_userId', crypto.randomUUID());
}
const USER_ID = localStorage.getItem('edge_userId');

// Namespace all Store keys
const Store = {
  get: (k, def=[]) => { ... localStorage.getItem(k + '_' + USER_ID) ... },
  set: (k, v) => localStorage.setItem(k + '_' + USER_ID, JSON.stringify(v))
};
```

**Settings page:**
- Show current User ID with a "Copy" button
- "Import data from another device" — paste a userId to switch namespace
- Clear data button — removes all keys for current userId

**Netlify `_redirects`:**
```
/.env  /index.html  404
```

## Priority: Medium
Do this before any public sharing of the Netlify URL.

## Owner: Claude (Sprint 2)
