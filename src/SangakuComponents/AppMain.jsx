import { useState } from "react";
import { motion } from "framer-motion";
import { FileText, BarChart3, Home } from "lucide-react";
import "../App.css";
import FormEditor from "./FormEditor";
import StatsViewer from "./StatsViewer";

export default function App() {
  const [activeTab, setActiveTab] = useState("form");
  const [formId, setFormId] = useState(null);

  const handleGoHome = () => {
    // ホームページに戻る処理（ルートを持つ場合は navigate("/") など）
    window.location.href = "/"; // 例: ルート直下に戻る
  };

  return (
    <div className="app-container">
      <header className="header modern-header">
        <div className="header-inner">
          {/* 左：タイトル */}
          <h1 className="app-title">フォーム作成集計ツール</h1>

          {/* 中央右：タブメニュー */}
          <nav className="nav-tabs right-tabs">
            <div
              className={`nav-tab ${activeTab === "form" ? "active" : ""}`}
              onClick={() => setActiveTab("form")}
            >
              <FileText size={16} />
              <span>フォーム作成</span>
            </div>
            <div
              className={`nav-tab ${activeTab === "stats" ? "active" : ""}`}
              onClick={() => setActiveTab("stats")}
            >
              <BarChart3 size={16} />
              <span>集計結果</span>
            </div>
          </nav>

          {/* 右端：ホームボタン */}
          <button className="home-btn" onClick={handleGoHome}>
            <Home size={18} />
            <span>ホーム</span>
          </button>
        </div>
      </header>

      {/* ▼ メイン部分 */}
      <main className="content">
        {activeTab === "form" ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <FormEditor
              onFormCreated={({ formId: createdFormId }) => {
                setFormId(createdFormId || null);
              }}
            />
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <StatsViewer formId={formId} />
          </motion.div>
        )}
      </main>

      <footer className="footer">© 2025 Form Creator Demo</footer>
    </div>
  );
}
