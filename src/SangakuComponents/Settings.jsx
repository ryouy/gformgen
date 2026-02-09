import { useMemo, useState } from "react";
import { motion } from "framer-motion";

export default function SettingsPage() {
  const sections = useMemo(
    () => [
      {
        id: "s1",
        title: "1. このツールでできること",
        body: (
          <>
            <p style={{ marginTop: 0 }}>
              このツールでは、会合や会議の <b>出欠確認</b> を簡単に行えます。
            </p>
            <ul style={{ marginTop: 8 }}>
              <li>
                <b>出欠確認フォームを自動で作る</b>（Googleフォーム）
              </li>
              <li>
                作ったフォームを <b>リンクやQRコードで配布</b>できる
              </li>
              <li>
                回答が集まったら <b>出欠状況を一覧で確認</b>できる
              </li>
              <li>
                <b>CSV（Excel用） / PDF（印刷用）</b> で出力できる
              </li>
              <li>
                フォームを <b>締切済み扱い</b> にしたり、<b>削除（ゴミ箱へ）</b>{" "}
                できる
              </li>
              <li>
                備考（自由記述）がある場合は <b>備考だけを一覧で確認</b>{" "}
                できる
              </li>
            </ul>
          </>
        ),
      },
      {
        id: "s2",
        title: "2. 事前に必要なもの",
        body: (
          <>
            <p style={{ marginTop: 0 }}>使う前に、次のものをご用意ください。</p>
            <ul style={{ marginTop: 8 }}>
              <li>
                <b>Googleアカウント（Gmail）</b>
              </li>
              <li>インターネットに接続できる環境</li>
              <li>
                推奨ブラウザ：<b>Google Chrome</b>
              </li>
            </ul>
            <div className="manual-note">
              ※ Googleアカウントは「ログイン」と「フォーム作成・保存」に使います。
            </div>
          </>
        ),
      },
      {
        id: "s3",
        title: "3. まずログインする（最初に必ずやります）",
        body: (
          <>
            <ol style={{ marginTop: 8 }}>
              <li>Webサイトを開きます</li>
              <li>画面の「ログイン」ボタンを押します</li>
              <li>Googleの画面が出たら、使用するアカウントを選び「許可」します</li>
              <li>
                元の画面に戻ったら、左メニュー上部が「ログアウト」表示になっていれば成功です
              </li>
            </ol>
            <h5 style={{ margin: "12px 0 6px" }}>うまくいかないとき</h5>
            <ul style={{ marginTop: 8 }}>
              <li>
                <b>真っ白な画面になった</b> → 画面を閉じて、もう一度サイトを開き直してください
              </li>
              <li>
                <b>「ログイン状態が切れました」と表示された</b> → 再度「ログイン」を押してください（サーバ更新時などに起こることがあります）
              </li>
            </ul>
          </>
        ),
      },
      {
        id: "s4",
        title: "4. 出欠フォームを作る",
        body: (
          <>
            <p style={{ marginTop: 0 }}>左側のメニューから「作成」を押します。</p>
            <h5 style={{ margin: "12px 0 6px" }}>入力する項目</h5>
            <ul style={{ marginTop: 8 }}>
              <li>
                <b>会合名</b>（例：「産学懇話会 10月定例会」）
              </li>
              <li>
                <b>開催日時</b>（会合の日時を入力します）
              </li>
              <li>
                <b>締切日時</b>（自動で入ります。必要があれば変更できます）
              </li>
              <li>
                <b>場所</b>
              </li>
              <li>
                <b>主催者名</b>
              </li>
              <li>
                <b>参加者名の入力人数（1回答あたり）</b>
                <div style={{ color: "rgba(15,23,42,0.78)", fontWeight: 800 }}>
                  例：1社から複数名出席する可能性がある場合は「2〜5」などにします
                </div>
              </li>
            </ul>
            <p style={{ marginTop: 10 }}>入力が終わったら「フォームを作成」を押します。</p>
            <h5 style={{ margin: "12px 0 6px" }}>作成後にできること</h5>
            <ul style={{ marginTop: 8 }}>
              <li>
                <b>フォームを確認</b> → 実際のGoogleフォームを別タブで開きます
              </li>
              <li>
                <b>QRコード表示</b> → 作成したフォームのQRコードが表示されます（フォーム作成前は「ここにQRが表示されます」と表示されます）
              </li>
            </ul>
          </>
        ),
      },
      {
        id: "s5",
        title: "5. フォームを配布する（リンク / QRコード）",
        body: (
          <>
            <p style={{ marginTop: 0 }}>左のメニューから「集計」を押します。</p>
            <ol style={{ marginTop: 8 }}>
              <li>画面上部の「既存フォームを選択」から、会合名を選びます</li>
              <li>
                右側のアイコンから次が使えます
                <ul style={{ marginTop: 8 }}>
                  <li>
                    <b>リンク</b>：フォームを開く
                  </li>
                  <li>
                    <b>QR</b>：QRコードを表示
                  </li>
                </ul>
              </li>
            </ol>
            <p style={{ marginTop: 10 }}>
              このリンクやQRコードを、<b>メール・LINE・紙に印刷</b> などして参加者に配布してください。
            </p>
          </>
        ),
      },
      {
        id: "s6",
        title: "6. 集計結果を見る",
        body: (
          <>
            <p style={{ marginTop: 0 }}>
              「集計」画面でフォームを選ぶと、下に一覧が表示されます。
            </p>
            <p style={{ margin: "10px 0 6px", fontWeight: 900 }}>一覧には次の情報が並びます：</p>
            <ul style={{ marginTop: 8 }}>
              <li>事業所名</li>
              <li>役職名</li>
              <li>氏名</li>
              <li>出席・欠席</li>
              <li>人数</li>
              <li>送信日時</li>
            </ul>
            <h5 style={{ margin: "12px 0 6px" }}>複数人入力がある場合</h5>
            <ul style={{ marginTop: 8 }}>
              <li>氏名・役職は「最初の1人＋他N名」の形で表示されます</li>
            </ul>
          </>
        ),
      },
      {
        id: "s7",
        title: "7. 備考を見る（備考がある時のみ）",
        body: (
          <>
            <p style={{ marginTop: 0 }}>
              回答に「備考」が入力されている場合のみ、画面に「備考」ボタンが表示されます。
            </p>
            <ul style={{ marginTop: 8 }}>
              <li>「備考」を押すと備考一覧が開きます</li>
              <li>すべての備考をまとめて確認できます</li>
            </ul>
          </>
        ),
      },
      {
        id: "s8",
        title: "8. 出力する（CSV / PDF）",
        body: (
          <>
            <p style={{ marginTop: 0 }}>「集計」画面のボタンから出力できます。</p>
            <ul style={{ marginTop: 8 }}>
              <li>
                <b>CSV</b> → Excelで開いて編集・保存したい場合
              </li>
              <li>
                <b>PDF</b> → 出席者一覧を印刷・配布したい場合
              </li>
            </ul>
          </>
        ),
      },
      {
        id: "s9",
        title: "9. 締切・削除（管理者操作）",
        body: (
          <>
            <p style={{ marginTop: 0 }}>「集計」画面の管理ボタンから操作できます。</p>
            <ul style={{ marginTop: 8 }}>
              <li>
                <b>締切</b>
                <ul style={{ marginTop: 6 }}>
                  <li>フォームを「締切済み扱い」にします</li>
                  <li>※ Googleフォーム自体の受付停止ではありません</li>
                </ul>
              </li>
              <li>
                <b>削除</b>
                <ul style={{ marginTop: 6 }}>
                  <li>Google Drive のゴミ箱に移動します</li>
                  <li>
                    一定期間は
                    <a href="https://drive.google.com/drive/u/0/trash" target="_blank" rel="noopener noreferrer">
                        このページ
                    </a>
                    から元に戻せます
                    </li>
                </ul>
              </li>
            </ul>
          </>
        ),
      },
      {
        id: "s10",
        title: "10. よくある質問（困った時）",
        body: (
          <>
            <div style={{ marginTop: 8 }}>
              <div style={{ fontWeight: 1000 }}>Q. ログインできていたのに、急にログアウトした</div>
              <div style={{ marginTop: 4 }}>
                A. サーバ更新時などに起こることがあります。もう一度「ログイン」を押してください。
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 1000 }}>Q. フォームが一覧に出てこない</div>
              <div style={{ marginTop: 4 }}>
                A. <b>そのGoogleアカウントで作成したフォームのみ</b> が表示されます。別のアカウントでログインしていないか確認してください。
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 1000 }}>Q. QRコードが表示されない</div>
              <div style={{ marginTop: 4 }}>
                A. フォームを作成していない場合は表示されません。先に「フォームを作成」を押してください。
              </div>
            </div>
          </>
        ),
      },
      {
        id: "s11",
        title: "11. お問い合わせ先",
        body: (
          <>
            <p style={{ marginTop: 0 }}>左メニューの「設定」から開発者情報を確認できます。</p>
            <ul style={{ marginTop: 8 }}>
              <li>開発：松下 稜（会津大学 コンピュータ理工学部 CSS Lab）</li>
              <li>
                メール：
                <a
                  href="mailto:s1300041@u-aizu.ac.jp"
                  style={{
                    marginLeft: 6,
                    color: "#1d4ed8",
                    textDecoration: "underline",
                    textUnderlineOffset: 3,
                    fontWeight: 900,
                  }}
                >
                  s1300041@u-aizu.ac.jp
                </a>
              </li>
            </ul>
          </>
        ),
      },
    ],
    []
  );

  const [selectedId, setSelectedId] = useState("s1");
  const selected = sections.find((s) => s.id === selectedId) || sections[0];

  return (
    <div style={{ maxWidth: 980, margin: "0 auto" }}>
      <h2 style={{ marginTop: 0, color: "#0f172a" }}>設定</h2>

      <section style={{ lineHeight: 1.8, color: "#0f172a" }}>
        <h3 style={{ margin: "18px 0 10px", color: "#0f172a" }}>開発者情報</h3>
        <div>
          <span style={{ color: "#111827", fontWeight: 900, marginRight: 8 }}>開発</span>
          松下 稜（会津大学 コンピュータ理工学部 CSS Lab）
        </div>
        <div>
          <span style={{ color: "#111827", fontWeight: 900, marginRight: 8 }}>Email</span>
          <a
            href="mailto:s1300041@u-aizu.ac.jp"
            style={{
              color: "#1d4ed8",
              textDecoration: "underline",
              textUnderlineOffset: 3,
            }}
          >
            s1300041@u-aizu.ac.jp
          </a>
        </div>
      </section>

      <hr style={{ margin: "22px 0", border: 0, borderTop: "1px solid rgba(15,23,42,0.08)" }} />

      <section style={{ lineHeight: 1.85, color: "#0f172a" }}>
        <h3 style={{ margin: "0 0 8px", color: "#0f172a" }}>説明書</h3>
        

        <div className="manual-shell">
          <div className="manual-list" role="tablist" aria-label="説明書の章一覧">
            {sections.map((s) => {
              const active = s.id === selectedId;
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`manual-item ${active ? "is-active" : ""}`}
                  onClick={() => setSelectedId(s.id)}
                  role="tab"
                  aria-selected={active}
                >
                  {s.title}
                </button>
              );
            })}
          </div>

          <motion.div
            key={selected?.id}
            className="manual-bubble"
            initial={{ opacity: 0, x: 10, scale: 0.995 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            role="tabpanel"
            aria-label={selected?.title || "説明書本文"}
          >
            <div className="manual-bubble-title">{selected?.title}</div>
            <div className="manual-bubble-body">{selected?.body}</div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}


