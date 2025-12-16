import { motion } from "framer-motion";
import "../App.css";

export default function Home({ onSelectApp }) {
  return (
    <div className="home-container">
      <h3>会津地区経営者協会様向け サンプルサイト</h3>

      <div className="app-grid">
        {/* 🟦 産学懇話会ツール */}
        <div className="app-item">
          <div className="app-card" onClick={() => onSelectApp("sangaku")}>
            <h2>産学懇話会用ツール</h2>
          </div>
          <div className="app-info">
            <p>最終更新日：2025年12月18日</p>
            <ul>
              <li>日付選択UIをMUI X Pickerに刷新</li>
              <li>集計リストをPDF出力対応</li>
              <li>デモテーブルデータの修正</li>
            </ul>
          </div>
        </div>

        {/* 🟩 その他会合ツール */}
        <div className="app-item">
          <div className="app-card" onClick={() => onSelectApp("other")}>
            <h2>その他会合用ツール</h2>
          </div>
          <div className="app-info">
            <p>最終更新日：2025年10月18日</p>
            <ul>
              <li>日付選択UIをMUI X Pickerに刷新</li>
              <li>集計リストをPDF出力対応</li>
            </ul>
          </div>
        </div>
      </div>

      {/* 🧑‍💻 フッター署名 */}
      <footer className="home-footer">
        <p>開発：松下 稜（会津大学 コンピュータ理工学部 CSS Lab）</p>
      </footer>
    </div>
  );
}
