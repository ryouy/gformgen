# FMT（フォーム管理ツール）* [ユーザガイド](https://gfca-aizu.web.app/user-guide)

[Try here](https://gfca-aizu.web.app)

---

## 概要

Google Forms を **作成・再発見・集計**するための軽量管理ツール

* データベースなし
* 永続層は Google Drive / Forms のみ
* アプリケーションはステートレス設計

アプリは状態を持たない。
Google 側が唯一の正。

---

## 設計思想

> Google Drive をデータベースとして扱う
> それ以外はすべてビューである

* フォームのメタデータは保存しない
* 常に再構築可能な構造を保つ
* サーバ再起動や環境切替で整合性が壊れない

---

## 主な機能

### フォーム管理

* API 経由で会議用フォームを生成
* Google Drive 上から過去フォームを再発見
* フォームを「締切」状態へ変更（一覧から分離）
* フォームを Drive のゴミ箱へ移動

### 集計

* 実際のフォーム回答を取得
* 複数フォームを永続化なしで切り替え
* CSV 出力（Excel 対応）

  * 複数人フィールドはセル内改行
* 参加者リストを PDF 出力

### 共有

* フォームリンク生成
* 二次元バーコード（配布用）の表示・ダウンロード

### UI

* モバイル / デスクトップ対応
* アプリ内マニュアル内蔵
* 作成系と集計系を明確に分離（誤操作防止）

---

## 設計原則

### 1. ステートレス

* フォーム情報は保存しない
* 永続層は Google Drive / Forms のみ
* 状態は常に外部にある

### 2. 発見可能性

* Drive 上のタグでフォームを識別
* DB なしで再取得可能

### 3. 関心の分離

| 役割     | コンポーネント       |
| ------ | ------------- |
| フォーム作成 | `FormEditor`  |
| 集計・共有  | `StatsViewer` |

### 4. 安全な導線設計

* 作成フローと集計フローを意図的に分離
* 責務を混在させない

---

## 技術構成

### フロントエンド

* React
* Vite

### バックエンド

* Node.js
* Express

### Google 連携

* OAuth 2.0
* Forms API
* Drive API

### 補助ライブラリ

* PDF: `jspdf`, `jspdf-autotable`
* 二次元バーコード表示: `qrcode.react`

---

## ローカル開発

### セットアップ

```bash
git clone <repo-url>
cd gform-gen

npm install
cd backend && npm install && cd ..
```

### フロント環境

```bash
cp config/env.local.example .env.local
```

### バックエンド環境（backend/.env.local）

※ ローカル専用（コミットしない）

```env
GF_GOOGLE_CLIENT_ID=...
GF_GOOGLE_CLIENT_SECRET=...
GF_FRONTEND_ORIGIN=http://localhost:5173
GF_CORS_ORIGIN=http://localhost:5173
GF_OAUTH_REDIRECT_URI=http://localhost:3000/auth/google/callback
```

### 起動

```bash
cd backend && npm run dev
cd .. && npm run dev
```

---

## セッション管理

* ブラウザ Cookie には短いセッション ID のみを保存
* OAuth トークンはサーバー側セッションストアに保存
* `GF_OAUTH_REDIRECT_URI` は固定値で運用する

---

## デプロイ（Firebase Hosting + Functions）


### 構成

* Hosting → `dist/`
* Functions → `backend/index.js`
* `/api/**` → Functions へリライト

### シークレット設定（推奨）

```bash
firebase functions:secrets:set GF_GOOGLE_CLIENT_ID
firebase functions:secrets:set GF_GOOGLE_CLIENT_SECRET
firebase functions:secrets:set GF_FRONTEND_ORIGIN
firebase functions:secrets:set GF_OAUTH_REDIRECT_URI
firebase functions:secrets:set GF_CORS_ORIGIN
```

### デプロイ

```bash
npm run build
firebase deploy
```

---

## キャッシュ戦略

* `index.html` → no-cache
* `/assets/**` → 長期キャッシュ（immutable）


