import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";

export default function ManualPage() {
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
                作ったフォームを <b>リンクや二次元バーコードで配布</b>できる
              </li>
              <li>
                回答が集まったら <b>出欠状況を一覧で確認</b>できる
              </li>
              <li>
                <b>CSV（Excel用） / PDF（印刷用）</b> で出力できる
              </li>
              <li>
                フォームを <b>締切済み扱い</b> にしたり、<b>削除（ゴミ箱へ）</b>できる
              </li>
              <li>
                備考（自由記述）がある場合は <b>備考だけを一覧で確認</b>できる
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
        title: "3. まずログインする",
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
            <div
              style={{
                color: "color-mix(in srgb, var(--app-text) 65%, transparent)",
                fontWeight: 800,
              }}
            >
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
                <b>リンクをコピー</b> → 回答用URLをコピーできます
              </li>
              <li>
                <b>二次元バーコードを表示</b> → 参加者に見せて配布できます
              </li>
            </ul>
          </>
        ),
      },
      {
        id: "s5",
        title: "5. 回答を集計して見る",
        body: (
          <>
            <p style={{ marginTop: 0 }}>
              左側のメニューから「集計」を押します。フォームを選ぶと、回答が表で表示されます。
            </p>
            <ul style={{ marginTop: 8 }}>
              <li>
                <b>出欠</b>：出席/欠席が確認できます
              </li>
              <li>
                <b>備考</b>：自由記述がある場合は、備考だけをまとめて見られます
              </li>
             
            </ul>
          </>
        ),
      },
      {
        id: "s6",
        title: "6. CSV / PDF で出力する",
        body: (
          <>
            <p style={{ marginTop: 0 }}>
              集計画面のボタンから、Excel用のCSVや印刷用PDFを出力できます。
            </p>
            <ul style={{ marginTop: 8 }}>
              
            </ul>
          </>
        ),
      },
      {
        id: "s7",
        title: "7. 締切・削除（管理）",
        body: (
          <>
            <p style={{ marginTop: 0 }}>
              集計画面の「管理」から、フォームの状態変更や削除ができます。
            </p>
            <ul style={{ marginTop: 8 }}>
              <li>
                <b>締切</b>：「締切済み」にします。
                <div
                  style={{
                    color: "color-mix(in srgb, var(--app-text) 65%, transparent)",
                    fontWeight: 800,
                  }}
                >
                  締切時はタイトルに「（締め切られています）」が付き、回答受付用の設問は非表示になります。
                </div>
              </li>
              <li>
                <b>削除</b>：
                <a
                    href="https://drive.google.com/drive/u/0/trash"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    Google Drive のゴミ箱
                </a>
                に移動します（一定期間はゴミ箱から復元できます）
                </li>

            </ul>
            <div className="manual-note">
              ※ 管理操作はログインした管理者のみ実行できます。
            </div>
          </>
        ),
      },
      {
        id: "s8",
        title: "8. リンク / 二次元バーコードで配布する",
        body: (
          <>
            <p style={{ marginTop: 0 }}>
              フォームを作成したら、集計画面でフォームを選ぶと <b>リンク</b> と <b>バーコード</b> が使えます。
            </p>
            <ul style={{ marginTop: 8 }}>
              <li>
                <b>リンク</b>：回答用フォームを開きます（参加者へURLを共有）
              </li>
              <li>
                <b>バーコード</b>：二次元バーコードを表示します（会場で投影/印刷して配布）
              </li>
            </ul>
          </>
        ),
      },
      {
        id: "s9",
        title: "9. 備考（自由記述）をまとめて見る",
        body: (
          <>
            <p style={{ marginTop: 0 }}>
              回答に備考が含まれる場合、集計画面の操作に <b>備考</b> ボタンが表示されます。
            </p>
            <ul style={{ marginTop: 8 }}>
              <li>備考だけを一覧で確認できます</li>
              <li>コピーして共有・整理しやすい形で表示されます</li>
            </ul>
          </>
        ),
      },
      {
        id: "s10",
        title: "10. よくある質問",
        body: (
          <>
            <ul style={{ marginTop: 8 }}>
              <li>
                <b>ログインが切れる</b>：サーバ更新などで起こることがあります。もう一度ログインしてください。
              </li>
              <li>
                <b>フォームが見つからない</b>：作成に使ったGoogleアカウントでログインしているか確認してください。
              </li>
              <li>
                <b>集計が更新されない</b>：ページを再読み込みしてみてください。
              </li>
              
            </ul>
          </>
        ),
      },
      {
        id: "s10b",
        title: "10. 設定でできること",
        body: (
          <>
            <ul style={{ marginTop: 8 }}>
              <li>
                <b>作成画面の既定値</b>：開催日程（何週間後 + 時刻）と、参加者名の入力人数を変更できます。
              </li>
              <li>
                <b>テーマカラー</b>：アプリ全体のアクセント色（ボタンや選択状態の色）を変更できます。
              </li>
            </ul>
          </>
        ),
      },
      {
        id: "s11",
        title: "11. 開発者について",
        body: (
          <>
            <ul style={{ marginTop: 8 }}>
              <li>
                <b>氏名</b>：松下 稜（会津大学 計算社会学研究室）
              </li>
              <li>
                <b>Mail</b>：
                <a
                  href="mailto:s1300041@u-aizu.ac.jp"
                  style={{
                    color: "var(--accent2)",
                    textUnderlineOffset: 3,
                    marginLeft: 6,
                  }}
                >
                  s1300041@u-aizu.ac.jp
                </a>
              </li>
              <li>
                <b>技術</b>：
                <a
                  href="https://github.com/ryouy/gformgen"
                  style={{
                    color: "var(--accent2)",
                    textUnderlineOffset: 3,
                    marginLeft: 6,
                  }}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  github.com/ryouy/gformgen
                </a>
              </li>
            </ul>
          </>
        ),
      },
    ],
    [],
  );

  const [selectedId, setSelectedId] = useState(sections[0]?.id);
  const selected = sections.find((s) => s.id === selectedId) || sections[0];
  const detailRef = useRef(null);

  useEffect(() => {
    // 章カードを選んだら説明へスクロール（視線誘導）
    if (!detailRef.current) return;
    const el = detailRef.current;
    requestAnimationFrame(() => {
      try {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch {
        // ignore
      }
    });
  }, [selectedId]);

  return (
    <div style={{ maxWidth: 980, margin: "0 auto" }}>
      <h2 style={{ marginTop: 0, color: "var(--app-text)" }}>説明書</h2>

      <div className="manual-grid" role="list" aria-label="説明書の章">
        {sections.map((s) => {
          const active = s.id === selectedId;
          return (
            <button
              key={s.id}
              type="button"
              className={`manual-card ${active ? "is-active" : ""}`}
              onClick={() => setSelectedId(s.id)}
              role="listitem"
              aria-current={active ? "true" : undefined}
            >
              <div className="manual-card-title">{s.title}</div>
              <div className="manual-card-hint">説明を見る</div>
            </button>
          );
        })}
      </div>

      <div ref={detailRef} />
      <motion.div
        key={selected?.id}
        className="manual-detail"
        initial={{ opacity: 0, y: 8, scale: 0.995 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        role="region"
        aria-label={selected?.title || "説明書本文"}
      >
        <div className="manual-bubble-title">{selected?.title}</div>
        <div className="manual-bubble-body">{selected?.body}</div>
      </motion.div>
    </div>
  );
}


