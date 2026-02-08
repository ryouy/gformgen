
---

# gform-gen

A small admin tool to **programmatically create, rediscover, and aggregate Google Forms**.

* **No database**
* **Google Drive / Forms as the single source of truth**
* **Stateless by design**

[Live demo](https://gformgen.vercel.app/)

---

## What it does

* Create meeting-specific Google Forms via API
* Fetch and aggregate **real Google Forms responses**
* Rediscover previously created forms from Google Drive
* Switch between multiple forms without persistence
* Export attendee lists as PDF
* Share forms via link or QR code

---

## Design principles

* **Stateless**

  * No form metadata is stored
  * Google Drive / Forms is the only persistent layer
* **Identifiable forms**

  * Forms are tagged in their titles (e.g. `[gformgen:sangaku]`)
  * Enables Drive-based discovery without a DB
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

# backend/.env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# start servers
cd backend && npm run dev
cd .. && npm run dev
```

---

## Notes

* OAuth tokens are kept **in memory**

  * Backend restart ⇒ re-login required
* Production usage requires:

  * A production OAuth client
  * Proper redirect URI configuration
  * A running backend (frontend is hosted on Vercel)

---

## Philosophy

## Treat Google Drive as the database. Everything else is just a view.