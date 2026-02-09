
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

## local / prod 切替（Vercelで localhost に戻らないようにする）

このフロントは **`VITE_RUNTIME`** で local / prod を切替します。API/認証のURLは `src/lib/apiBase.ts` に集約済みです。

### フロント（Vite）の環境変数

- **local**
  - `VITE_RUNTIME=local`
  - `VITE_LOCAL_API_BASE=http://localhost:3000`
- **prod**
  - `VITE_RUNTIME=prod`
  - `VITE_PROD_API_BASE=/api`（Vercel同居に見せる）または `https://<backend-host>`（backend別ホスト）

`.env.*` をコミットできないため、以下のサンプルを用意しています（ローカルではコピーして利用）。

- `config/env.local.example` → `.env.local`
- `config/env.production.example` → `.env.production`

例:

```bash
cp config/env.local.example .env.local
```

### バックエンド（Express）の環境変数（重要）

- **`OAUTH_REDIRECT_URI`**（任意）: redirect URI を固定したい場合のみ指定
- **`FRONTEND_ORIGIN`**（任意）: OAuth完了後に戻すフロント origin を固定したい場合に指定
- **`CORS_ORIGIN`**（任意）: 許可する origin（`,`区切り可、`*` も可）

### A. backend別ホスト運用（推奨・簡単）

1) backend をどこかにデプロイ（例: Render/Fly/Cloud Run 等）
2) Vercel（Production）の env を以下に設定:

- `VITE_RUNTIME=prod`
- `VITE_PROD_API_BASE=https://<backend-host>`（または `https://<backend-host>/api`）

3) Google Cloud Console（OAuthクライアント）に redirect URI を追加:

- backendが `/api/auth/google/callback` を使う場合: `https://<backend-host>/api/auth/google/callback`
- backendが `/auth/google/callback` を使う場合: `https://<backend-host>/auth/google/callback`

※この構成だと Vercel 側の rewrite は不要です。

### B. Vercel同居 `/api` 運用（同一ドメインに見せたい）

フロントは `VITE_PROD_API_BASE=/api` を向くので、**Vercel側で `/api/*` を backend にプロキシ**する必要があります。

#### Vercel Dashboard で Rewrite を追加（推奨）

Vercel → Project → Settings → Rewrites に以下を追加:

- Source: `/api/(.*)`
- Destination: `https://<backend-host>/api/$1`

また、過去のデプロイ/キャッシュ等でフロントが誤って `/auth/*` に飛ぶ場合があるので、保険として以下も追加推奨です:

- Source: `/auth/(.*)`
- Destination: `/api/auth/$1`

（`vercel.json.example` にも同内容のテンプレを置いてあります。ホスト固定できるなら `vercel.json` として利用可能。）

#### OAuth（この構成の重要ポイント）

Google Cloud Console の redirect URI は **Vercel側のURL** を登録:

- `https://<vercel-domain>/api/auth/google/callback`

必要なら backend 側で明示的に:

- `OAUTH_REDIRECT_URI=https://<vercel-domain>/api/auth/google/callback`
- `FRONTEND_ORIGIN=https://<vercel-domain>`

を設定すると確実です。

### トラブルシュート（Cannot GET）

Vercel上で以下を直接開いて確認できます:

- `https://<vercel-domain>/api/auth/google`
  - 期待: Googleへの 302
  - Cannot GET: Vercelの rewrite が無い/間違い

## Notes

* OAuth tokens are kept **in memory**

  * Backend restart ⇒ re-login required
* Production usage requires:

  * A production OAuth client
  * Proper redirect URI configuration
  * A running backend (frontend is hosted on Vercel)

---

## Firebase Hosting + Functions で運用する場合（/api同居）

このリポジトリは Firebase 用の最低限の設定も入っています（`firebase.json`）。構成は:

- Hosting: Vite の `dist/` を配信
- Functions: `backend/index.js` の Express を `api` 関数として公開
- Rewrites: `/api/**` と `/auth/**` を Functions に転送

### デプロイ手順（概要）

1) フロントをビルド

```bash
npm run build
```

2) backend 側の env を Firebase Functions の **Secrets** に設定（推奨・簡単）

この backend は `process.env` も見ますが、Firebase 本番は Secrets を使うのが確実です。

重要: `backend/.env` に `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` が入っていると、
firebase-tools がそれらを **non-secret 環境変数**として読み込み、Secrets と衝突して
以下のエラーでデプロイが落ちます:

- `Secret environment variable overlaps non secret environment variable: GOOGLE_CLIENT_ID`

対処:

- `backend/.env` から上記キーを削除する、または `backend/.env` を **`backend/.env.local` にリネーム**してください
  - ローカル開発は `.env.local` を読むようにしています

```bash
# 先にプロジェクトを指定（このリポジトリの default が違う場合があるので明示推奨）
firebase use gfca-aizu

# NOTE: backend/.env が firebase-tools により自動ロードされても衝突しないよう、Secrets は GF_* 名を使います
firebase functions:secrets:set GF_GOOGLE_CLIENT_ID
firebase functions:secrets:set GF_GOOGLE_CLIENT_SECRET
firebase functions:secrets:set GF_FRONTEND_ORIGIN
firebase functions:secrets:set GF_OAUTH_REDIRECT_URI

# 任意: CORS を絞りたい場合（既定は "*"）
firebase functions:secrets:set GF_CORS_ORIGIN
```

設定値の例:

- `GF_FRONTEND_ORIGIN=https://<your-hosting-domain>`
- `GF_OAUTH_REDIRECT_URI=https://<your-hosting-domain>/api/auth/google/callback`
- `GF_CORS_ORIGIN=https://<your-hosting-domain>`

3) Firebase deploy

```bash
firebase deploy
```

開発で「毎回 build → deploy が面倒」な場合は、まとめコマンドも用意しています:

```bash
npm run deploy:firebase
```

### OAuth Redirect URI（Google Cloud Console）

Authorized redirect URIs にこれを追加:

- `https://<your-hosting-domain>/api/auth/google/callback`

---

## Philosophy

Treat Google Drive as the database.
Everything else is just a view.