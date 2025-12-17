# gform-gen

会津地区経営者協会向けに用意したフォーム作成 / 集計ツールのサンプルプロジェクトです。React + Vite で構築した SPA で、Vercel 上にホスティング済み。トップページから「産学懇話会用」「その他会合用」の 2 アプリを選び、会合向けのフォーム作成と参加者集計・帳票出力を行えます。

[公開サイト](https://gformgen.vercel.app/)

## 主な機能

- **フォーム作成 UI**：MUI および MUI X Date/DateTime Picker を用い、会合名・日時・場所・主催者・本文を入力可能。作成ボタンで QR コードと Google Forms へのリンクが表示されます。
- **Google Forms API 連携**：バックエンド (`backend/index.js`) で Google OAuth 2.0 (googleapis) により認証されたアカウントを使用し、実際の Google フォームを生成します。
- **集計ビュー**：ダミー参加者データをもとに出欠一覧や合計値を表示。産学向けは役職付き、その他向けは企業・代表者単位。
- **PDF 出力**：jspdf + jspdf-autotable + NotoSansJP フォントで、日本語含む出席者リストをワンクリックで PDF ダウンロード。
- **グラフ描画 (準備済み)**：Chart.js による棒グラフ表示コンポーネント (`GraphView.jsx`) を同梱。

## セットアップ

```bash
# 0. リポジトリを取得
git clone <repo-url>
cd gform-gen

# 1. ルート依存関係をインストール
npm install

# 2. バックエンド依存関係
cd backend
npm install
cd ..

# 3. backend/.env を用意
GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxxxxxxxxxxxxxx
```

## ローカル起動

```bash
# Backend サーバーを起動 (http://localhost:3000)
cd backend
npm run dev     # または node index.js

# Frontend を別ターミナルで起動 (http://localhost:5173)
cd ..
npm run dev
```

## 使い方

1. ブラウザで `http://localhost:5173` または Vercel で公開している[公開サイト](https://gformgen.vercel.app/)を開きます。
2. 画面上部の「Google でログイン」をクリックすると、`/auth/google` → `/auth/google/callback` (backend) を経由して Google OAuth へ遷移。承認後は `?login=success` 付きで SPA に戻り、ログイン状態が localStorage に保持されます。
3. 「産学懇話会用ツール」または「その他会合用ツール」を選択。どちらもフォーム作成／集計タブで構成され、右上のホームボタンでトップに戻ってもログイン状態は維持されます。
4. フォーム作成タブで会合情報を入力し「フォームを作成」を押すと、Google Forms API によって実フォームを作成。QR コードとリンクから確認できます。
5. 集計タブでは参加者テーブルや出席者リストを閲覧し、PDF ダウンロードボタンで帳票を取得できます。リストは「もっと見る」で全件展開可。
6. ログアウトはトップのログインバーから実行。`/auth/logout` が保存済みトークンを破棄し、フロント側でも状態をクリアします。

## 注意事項

- Google OAuth のリダイレクト URI は `http://localhost:3000/auth/google/callback` を想定。Vercel で運用する場合は、Vercel の環境変数設定と Google Cloud Console での許可リダイレクト URI 追加を行ってください。
- 公開環境で Google Forms API を利用する際は、デプロイ先のドメインに合わせた OAuth クライアント ID/Secret を別途用意してください。
- 現在 Vercel ではフロントエンドのみホストしており、Google API を動かすにはバックエンドを同じ Origin か、CORS 設定済みのサーバーで稼働させる必要があります。
