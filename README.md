# FMT [Form Management Tool]

A small admin tool to **programmatically create, rediscover, and aggregate Google Forms**.

* **No database**
* **Google Drive / Forms as the single source of truth**
* **Stateless by design**

###　(Live demo)[https://gfca-aizu.web.app]
---


## Philosophy

Treat Google Drive as the database. Everything else is just a view.

---

## What it does

* Create meeting-specific Google Forms via API
* Fetch and aggregate **real Google Forms responses**
* Rediscover previously created forms from Google Drive
* Switch between multiple forms without persistence
* Export attendee lists as **PDF**
* Export responses as **CSV** (Excel-friendly; multi-person fields use **cell-internal newlines**)
* Share forms via **link** or **QR code**
* “Close” forms at the **app level** (moves to a closed list)
* “Trash” forms (moves to Google Drive trash)
* Responsive UI (mobile / desktop)
* In-app manual page (`説明書`) is available in the UI

---

## Design principles

* **Stateless**
  * No form metadata is stored
  * Google Drive / Forms is the only persistent layer
* **Identifiable forms**
  * Forms are tagged/identified to enable Drive-based discovery without a DB
* **Clear separation of concerns**
  * Form creation: `FormEditor`
  * Aggregation & sharing: `StatsViewer`
* **Safe UX**
  * Creation and aggregation flows are intentionally separated

---

## Tech stack

* Frontend: React + Vite
* Backend: Node.js + Express
* Google APIs:
  * OAuth 2.0
  * Forms API
  * Drive API
* PDF: `jspdf`, `jspdf-autotable`
* QR: `qrcode.react`

---

## Running locally

```bash
git clone <repo-url>
cd gform-gen

npm install
cd backend && npm install && cd ..
```

Frontend env (Vite):

```bash
cp config/env.local.example .env.local
```

Backend env (local dev):

* Local dev reads `backend/.env.local` (not committed)

```bash
# backend/.env.local
GF_GOOGLE_CLIENT_ID=...
GF_GOOGLE_CLIENT_SECRET=...
GF_FRONTEND_ORIGIN=http://localhost:5173
GF_CORS_ORIGIN=http://localhost:5173
GF_SESSION_PASSWORD=please_set_a_long_random_string_here_32chars_min
```

Start servers:

```bash
cd backend && npm run dev
cd .. && npm run dev
```

---

## Notes

* “Close” is **app-level** and does **not** toggle Google Forms’ “Stop accepting responses”
  * If you need hard close, implement it via Forms API + additional scopes
* Session model
  * Recommended: set `GF_SESSION_PASSWORD` to enable encrypted HttpOnly cookie persistence (serverless-friendly)
  * Fallback: tokens may be kept in memory (cold start / instance swap ⇒ re-login required)

---

## Firebase Hosting + Functions (co-located `/api`)

This repo includes Firebase configuration (`firebase.json`):

* Hosting: serves Vite `dist/`
* Functions: exposes `backend/index.js` as `api`
* Rewrites: `/api/**` and `/auth/**` → Functions

Secrets (recommended):

```bash
firebase functions:secrets:set GF_GOOGLE_CLIENT_ID
firebase functions:secrets:set GF_GOOGLE_CLIENT_SECRET
firebase functions:secrets:set GF_FRONTEND_ORIGIN
firebase functions:secrets:set GF_OAUTH_REDIRECT_URI
firebase functions:secrets:set GF_CORS_ORIGIN
firebase functions:secrets:set GF_SESSION_PASSWORD
```

Deploy:

```bash
npm run build
firebase deploy
```

Caching:

* `index.html` is served with **no-cache**
* `/assets/**` is long-term cached (immutable)
