import { useMemo, useState } from "react";
import { Box, MenuItem, TextField } from "@mui/material";

export default function ManualPage({ onOpenPdf }) {
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
                集計画面から <b>フォーム確認（目） / フォーム編集（ペン）</b> を直接開ける
              </li>
              <li>
                <b>CSV（Excel用） / PDF（印刷用）</b> で出力できる
              </li>
              <li>
                フォームを <b>〆切済み扱い</b> にしたり、<b>削除（ゴミ箱へ）</b>できる
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
                元の画面に戻ったら、左メニュー下部の <b>ログアウトアイコン</b> が有効になっていれば成功です
              </li>
            </ol>
            <div className="manual-note" style={{ marginTop: 10 }}>
              ※ ログイン状態はブラウザに保存されます。同じブラウザで続けて使う場合は、一度ログインすればしばらくは再ログイン不要です。
              サーバ側の更新やセキュリティの都合で、まれに再度ログインを求められることがあります。
            </div>
            <div className="manual-note" style={{ marginTop: 8 }}>
              ※ Googleでログインした直後にログイン状態にならない場合は、ページを一度再読み込み（更新）してみてください。
            </div>
            <div className="manual-note" style={{ marginTop: 8 }}>
              ※ 別のGoogleアカウントと使い分けたいときは、ブラウザのプロファイルを分けるか、別のブラウザを使うと混ざりにくくなります。
            </div>
            <h5 style={{ margin: "12px 0 6px" }}>うまくいかないとき</h5>
            <ul style={{ marginTop: 8 }}>
              <li>
                <b>真っ白な画面になった</b> → 画面を閉じて、もう一度サイトを開き直してください
              </li>
              <li>
                <b>「ログイン状態が切れました」と表示された</b> → 再度「ログイン」を押してください（サーバ更新時などに起こることがあります）
              </li>
              <li>
                <b>Googleで許可したのにログインできない</b> → ページを再読み込みするか、しばらく時間をおいてから再度お試しください
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
            <p style={{ marginTop: 0 }}>
              左側メニューの <b>ペンアイコン（作成）</b> からフォーム作成画面を開きます。
            </p>
            <h5 style={{ margin: "12px 0 6px" }}>入力する項目</h5>
            <ul style={{ marginTop: 8 }}>
              <li>
                <b>会合名</b>（例：「産学懇話会 10月定例会」）
              </li>
              <li>
                <b>開催日時（開始）</b>（会合の開始日時を入力します）
              </li>
              <li>
                <b>終了時刻</b>（終了は時刻のみ指定します）
              </li>
              <li>
                <b>〆切日</b>（開催日から何日前かの設定をもとに自動入力されます）
              </li>
              <li>
                <b>場所</b>
              </li>
              <li>
                <b>主催者名</b>
              </li>
              <li>
                <b>参加費（1人あたり）</b>（円で入力）
                <div
                  style={{
                    color: "color-mix(in srgb, var(--app-text) 65%, transparent)",
                    fontWeight: 800,
                  }}
                >
                  0を入力すると「無料」として扱われます
                </div>
              </li>
              <li>
                <b>参加者の上限入力人数（1回答あたり）</b>
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
            <div className="manual-note" style={{ marginTop: 10 }}>
              ※ 作成画面で設定する「〆切日」は案内上の目安です。回答受付は自動では止まりません。<br />
              運用時は、集計画面の管理操作にある <b>「〆切」</b> を手動で実行してください。
            </div>
            <div className="manual-note" style={{ marginTop: 10 }}>
              ※ 入力時に、<b>終了時刻は開始日時より後</b>、かつ <b>〆切日は開催日より前</b> でないと作成できません。
            </div>
            <h5 style={{ margin: "12px 0 6px" }}>作成後にできること（右側のパネル）</h5>
            <ul style={{ marginTop: 8 }}>
              <li>
                <b>フォームを確認</b> → 実際のGoogleフォームを別タブで開きます
              </li>
              <li>
                <b>二次元バーコードの仕上がり</b>（プルダウン）→{" "}
                <b>シンプル</b>は模様をできるだけ単純にし、<b>安定</b>は読み取りやすさを少し重視します。投影や印刷の見え方に合わせて選べます
              </li>
              <li>
                <b>PNGダウンロード</b> → 二次元バーコードを画像ファイルとして保存し、資料や掲示に貼り付けられます
              </li>
              <li>
                <b>短縮リンク</b> → フォーム作成後に表示されるURLです。<b>コピー</b>ボタンでクリップボードにコピーでき、メールやチャットで参加者に送れます
              </li>
            </ul>
            <div className="manual-note" style={{ marginTop: 10 }}>
              ※ 作成画面と集計画面では、二次元バーコードの「仕上がり」設定は同じ値が引き継がれます（ブラウザに記憶されます）。
            </div>
          </>
        ),
      },
      {
        id: "s5",
        title: "5. 回答を集計して見る",
        body: (
          <>
            <p style={{ marginTop: 0 }}>
              左側メニューの <b>グラフアイコン（集計）</b> を押します。上部でフォームを選択すると、
              「集計結果」に回答一覧が表示されます。
            </p>
            <h5 style={{ margin: "12px 0 6px" }}>基本の流れ</h5>
            <ul style={{ marginTop: 8 }}>
              <li>
                まずプルダウンから <b>フォームを選択</b> します
              </li>
              <li>
                フォーム名の左側に <b>「集計中 / 〆切済み」</b> の状態表示が出ます
              </li>
              <li>
                一覧テーブルで <b>事業所 / 役職 / 氏名 / 出欠 / 送信日時</b> を確認できます
              </li>
              <li>
                下部のサマリーで <b>出席事業所数</b> と <b>合計出席人数</b> を確認できます
              </li>
              <li>
                行が多い場合は <b>「もっと見る」</b> で全件表示に切り替えできます
              </li>
            </ul>
            <h5 style={{ margin: "12px 0 6px" }}>右側アイコンでできること</h5>
            <ul style={{ marginTop: 8 }}>
              <li>
                <b>目アイコン</b>：回答用フォームを開いて内容を確認します
              </li>
              <li>
                <b>ペンアイコン</b>：Googleフォーム編集画面を開きます
              </li>
              <li>
                <b>二次元バーコードアイコン</b>：大きめの二次元バーコードを表示する画面が開きます。作成画面と同様に、<b>短縮リンクのコピー</b>と
                <b>PNGダウンロード</b>ができます（会場で投影したり、紙に印刷して配布したりする用途向け）
              </li>
              <li>
                <b>備考ボタン</b>（表示時のみ）：自由記述を一覧表示します
              </li>
            </ul>
            <div className="manual-note" style={{ marginTop: 10 }}>
              ※ 集計画面のツールバーでは、フォームのURLがまだ読み込まれていないときは「リンク準備中…」と表示されることがあります。フォームを選択し直すか、少し待ってから再度お試しください。
            </div>
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
              <li>
                まず集計画面で <b>フォームを選択</b> すると、CSV/PDFボタンが表示されます
              </li>
              <li>
                <b>CSV</b>：一覧データをExcel等で加工しやすい形式で保存します
              </li>
              <li>
                <b>PDF</b>：配布・印刷向けの見やすい帳票形式で保存します
              </li>
              <li>
                <b>備考</b> はPDF上で事業所ごとに1回だけ表示されます
              </li>
            </ul>
          </>
        ),
      },
      {
        id: "s7",
        title: "7. 〆切・削除（管理）",
        body: (
          <>
            <p style={{ marginTop: 0 }}>
              集計画面の「管理」から、フォームの状態変更や削除ができます。
            </p>
            <ul style={{ marginTop: 8 }}>
              <li>
                <b>〆切</b>：「〆切済み」にします。
                <div
                  style={{
                    color: "color-mix(in srgb, var(--app-text) 65%, transparent)",
                    fontWeight: 800,
                  }}
                >
                  〆切時はタイトルに「（締め切られています）」が付き、回答受付用の設問は削除されます。
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
            <div className="manual-note" style={{ marginTop: 10 }}>
              ※ 作成されたフォームや設定ファイルは、Google Drive の「フォーム管理ツール」フォルダ内で管理されます。
            </div>
          </>
        ),
      },
      {
        id: "s8",
        title: "8. 集計画面のアイコン（確認 / 編集 / 配布）",
        body: (
          <>
            <p style={{ marginTop: 0 }}>
              フォームを作成したら、<b>集計</b>画面で対象フォームを選択します。右側のアイコンから
              参加者への案内に必要な表示を開けます。
            </p>
            <ul style={{ marginTop: 8 }}>
              <li>
                <b>目アイコン（フォームを確認）</b>：回答用フォームを開きます（参加者に共有するURLの確認用）
              </li>
              <li>
                <b>ペンアイコン（フォームを編集）</b>：Googleフォームの編集画面を開きます（設問の修正時に使用）
              </li>
              <li>
                <b>二次元バーコードアイコン</b>：二次元バーコードを表示します。モーダル内で短縮リンクのコピーやPNG保存もできます（会場で投影・印刷して配布）
              </li>
            </ul>
          </>
        ),
      },
      {
        id: "s9",
        title: "9. Googleフォームを編集する",
        body: (
          <>
            <p style={{ marginTop: 0 }}>
              作成済みのGoogleフォームは、集計画面の編集ボタンから編集できます。
            </p>
            <h5 style={{ margin: "12px 0 6px" }}>編集画面でできること</h5>
            <ul style={{ marginTop: 8 }}>
              <li>フォームのタイトル変更</li>
              <li>説明文の修正</li>
              <li>質問項目の追加</li>
              <li>既存質問の編集（文言変更・必須設定の切り替えなど）</li>
              <li>質問の削除</li>
              <li>選択肢の追加／修正</li>
              <li>回答形式の変更（記述式・ラジオボタン・チェックボックスなど）</li>
              <li>セクションの追加</li>
              <li>質問の並び替え（ドラッグで移動可能）</li>
            </ul>
            <h5 style={{ margin: "12px 0 6px" }}>編集後の保存について</h5>
            <p style={{ marginTop: 0 }}>
              Googleフォームは自動保存されます。編集後に特別な保存操作は不要です。
            </p>
            <div className="manual-note">
              ※ 公開中のフォームを編集すると、既に回答済みのデータに影響が出る場合があるため注意してください。
            </div>
            <h5 style={{ margin: "12px 0 6px" }}>参考リンク</h5>
            <ul style={{ marginTop: 8 }}>

            <li>
                <a
                  href="https://www.makeleaps.com/resources/articles/google-form-usage/#sec3"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Googleフォームの画面の見方と基本操作
                </a>
              </li>
              <li>
                <a
                  href="https://www.youtube.com/watch?v=LCz4bHc8Was"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Googleフォームの基本操作（動画）
                </a>
              </li>  
              <li>
                <a
                  href="https://www.g-workspace.jp/googleworkspace-reference/forms/not-accept/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  フォームの回答受付を締切る方法
                </a>
              </li>
              <li>
                <a
                  href="https://support.google.com/docs/topic/6063584?hl=ja&sjid=9074137316317041802-NC"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Google公式ヘルプ：フォームの編集方法
                </a>
              </li>
              <li>
                <a
                  href="https://support.google.com/docs/topic/6063592?hl=ja&sjid=9074137316317041802-NC"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Google公式ヘルプ：回答の確認方法
                </a>
              </li>
              
              
            </ul>
          </>
        ),
      },
      {
        id: "s9b",
        title: "10. 備考（自由記述）をまとめて見る",
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
        title: "11. よくある質問",
        body: (
          <>
            <ul style={{ marginTop: 8 }}>
              <li>
                <b>ログインが切れる</b>：サーバ更新などで起こることがあります。もう一度ログインしてください。
              </li>
              <li>
                <b>Googleでログインした直後にログイン状態にならない</b>：ページを再読み込みするか、しばらく時間をおいてから再度お試しください。
              </li>
              <li>
                <b>フォームが見つからない</b>：作成に使ったGoogleアカウントでログインしているか確認してください。
              </li>
              <li>
                <b>集計が更新されない</b>：ページを再読み込みしてみてください。
              </li>
              <li>
                <b>二次元バーコードが読み取りづらい</b>：画面の明るさを上げるか、表示サイズを大きくして再表示してください。
              </li>
              <li>
                <b>〆切日を過ぎたのに回答が止まらない</b>：作成画面の〆切日は案内用です。回答受付を止めるには集計画面の <b>〆切</b> を押してください。
              </li>
              <li>
                <b>会合情報の内容を後から直したい</b>：集計画面の <b>ペンアイコン</b> からGoogleフォーム編集画面を開いて修正できます。
              </li>
              <li>
                <b>フォーム確認と編集の違いは？</b>：<b>目アイコン</b> は回答画面、<b>ペンアイコン</b> は編集画面を開きます。
              </li>
              <li>
                <b>備考ボタンが表示されない</b>：備考欄に入力が1件もない場合は表示されません。入力があると自動表示されます。
              </li>
              <li>
                <b>削除したフォームを戻したい</b>：削除はGoogle Driveのゴミ箱に移動です。一定期間内であればDrive側で復元できます。
              </li>
            </ul>
          </>
        ),
      },
      {
        id: "s10b",
        title: "12. 設定でできること",
        body: (
          <>
            <ul style={{ marginTop: 8 }}>
              <li>
                <b>作成画面の既定値</b>：会合名 / 開催日（本日+何週間後） / 開始時刻 / 終了時刻 /
                〆切日（開催日-何日前） / 場所 / 主催者名 / 参加者上限人数 / 参加費 を設定できます。
                <div
                  style={{
                    color: "color-mix(in srgb, var(--app-text) 65%, transparent)",
                    fontWeight: 800,
                  }}
                >
                  既定参加費を0にすると、作成画面の初期表示は「無料」になります
                </div>
              </li>
              <li>
                <b>テーマカラー</b>：アプリ全体のアクセント色（ボタンや選択状態の色）を変更できます。
              </li>
              <li>
                <b>タブの配置</b>：ナビゲーションの表示位置を選べます。
                <ul style={{ marginTop: 4, marginBottom: 0 }}>
                  <li>左サイドバー（標準）</li>
                  <li>左上にまとめて表示</li>
                  <li>左下にまとめて表示</li>
                </ul>
              </li>
              <li>
                <b>タブの表示</b>：各タブのアイコン・文字の表示を切り替えられます。
                <ul style={{ marginTop: 4, marginBottom: 0 }}>
                  <li>アイコンのみ</li>
                  <li>文字のみ</li>
                  <li>アイコン＋文字</li>
                </ul>
              </li>
              <li>
                <b>URLで直接移動</b>：`/create` / `/stats` / `/settings` / `/manual` で各ページを直接開けます。
              </li>
            </ul>
          </>
        ),
      },
      {
        id: "s11",
        title: "13. 開発者について",
        body: (
          <>
            <ul style={{ marginTop: 8 }}>
              <li>
                <b>氏名</b>：松下 稜（会津大学 計算社会科学研究室）
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

  const [selectedId, setSelectedId] = useState(sections[0]?.id || "");
  const selected = sections.find((s) => s.id === selectedId) || sections[0];

  return (
    <div className="manual-page" style={{ maxWidth: 980, margin: "0 auto", width: "100%" }}>
      <h2 style={{ marginTop: 0, color: "var(--app-text)" }}>説明書</h2>
      <p style={{ margin: "0 0 12px", fontSize: "0.95rem" }}>
        <button
          type="button"
          onClick={() => onOpenPdf?.()}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            color: "var(--accent2)",
            fontWeight: 800,
            textDecoration: "underline",
            textUnderlineOffset: 3,
            cursor: "pointer",
            font: "inherit",
          }}
        >
          利用ガイド兼仕様書を別ページで閲覧
        </button>
      </p>
      <Box sx={{ mb: 2 }}>
        <TextField
          select
          fullWidth
          value={selectedId}
          onChange={(e) => setSelectedId(String(e.target.value || ""))}
          SelectProps={{
            displayEmpty: true,
            renderValue: (v) => {
              if (!v) {
                return (
                  <span style={{ color: "#64748b", fontWeight: 600 }}>
                    項目を選択してください
                  </span>
                );
              }
              const cur = sections.find((s) => s.id === v);
              return cur?.title || "";
            },
          }}
        >
          {sections.map((s) => (
            <MenuItem key={s.id} value={s.id}>
              {s.title}
            </MenuItem>
          ))}
        </TextField>
      </Box>

      <div className="manual-detail" role="region" aria-label={selected?.title || "説明書本文"}>
        <div className="manual-bubble-body">{selected?.body}</div>
      </div>
    </div>
  );
}


