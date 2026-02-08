import { useState } from "react";
import { motion } from "framer-motion";
import { FileText, BarChart3 } from "lucide-react";
import "../App.css";
import FormEditor from "./FormEditor";
import StatsViewer from "./StatsViewer";

export default function App() {
  const [activeTab, setActiveTab] = useState("form");
  const [createdFormId, setCreatedFormId] = useState(null);

  const handleGoHome = () => {
    // ホームページに戻る処理（ルートを持つ場合は navigate("/") など）
    window.location.href = "/"; // 例: ルート直下に戻る
  };

  return (
    <div className="app-container">
      <header className="header modern-header">
        <div className="header-inner">
          {/* 左：タイトル */}
          <h1
            className="app-title"
            onClick={handleGoHome}
            style={{ cursor: "pointer" }}
            title="ホームへ戻る"
          >
            フォーム作成集計ツール
          </h1>

          {/* 中央右：タブメニュー */}
          <nav className="nav-tabs right-tabs">
            <div
              className={`nav-tab ${activeTab === "stats" ? "active" : ""}`}
              onClick={() => setActiveTab("stats")}
            >
              <BarChart3 size={16} />
              <span>集計結果</span>
            </div>
            <div
              className={`nav-tab ${activeTab === "form" ? "active" : ""}`}
              onClick={() => setActiveTab("form")}
            >
              <FileText size={16} />
              <span>フォーム作成</span>
            </div>
          </nav>
        </div>
      </header>

      {/* ▼ メイン部分 */}
      <main className="content">
        {activeTab === "form" ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <FormEditor
              onFormCreated={({ formId: createdFormId, formUrl: createdFormUrl }) => {
                setCreatedFormId(createdFormId || null);
              }}
            />
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <StatsViewer initialFormId={createdFormId} />
          </motion.div>
        )}
      </main>

      <footer className="footer">© 2025 Form Creator Demo</footer>
    </div>
  );
}
