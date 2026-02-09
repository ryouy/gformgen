import { useState } from "react";
import { motion } from "framer-motion";
import { FileText, BarChart3, Settings } from "lucide-react";
import "../App.css";
import FormEditor from "./FormEditor";
import StatsViewer from "./StatsViewer";
import SettingsPage from "./Settings";

export default function App() {
  // デフォルトは「集計結果」タブを開く
  const [activeTab, setActiveTab] = useState("stats");
  const [createdFormId, setCreatedFormId] = useState(null);

  const handleGoHome = () => {
    // ホームページに戻る処理（ルートを持つ場合は navigate("/") など）
    window.location.href = "/"; // 例: ルート直下に戻る
  };

  return (
    <div className="sangaku-shell">
      <aside className="sangaku-sidebar" aria-label="ナビゲーション">
        <button
          type="button"
          className="sangaku-brand"
          onClick={handleGoHome}
          title="ホームへ戻る"
          aria-label="ホームへ戻る"
        >
          <span className="sangaku-brand-text">FCT</span>
        </button>

        <nav className="sangaku-nav" aria-label="ページ切替">
          <button
            type="button"
            className={`sangaku-nav-item ${activeTab === "stats" ? "active" : ""}`}
            onClick={() => setActiveTab("stats")}
            title="集計結果"
            aria-label="集計結果"
          >
            <BarChart3 size={22} />
            <span className="sangaku-nav-label">集計</span>
          </button>
          <button
            type="button"
            className={`sangaku-nav-item ${activeTab === "form" ? "active" : ""}`}
            onClick={() => setActiveTab("form")}
            title="フォーム作成"
            aria-label="フォーム作成"
          >
            <FileText size={22} />
            <span className="sangaku-nav-label">作成</span>
          </button>
          <button
            type="button"
            className={`sangaku-nav-item ${activeTab === "settings" ? "active" : ""}`}
            onClick={() => setActiveTab("settings")}
            title="設定"
            aria-label="設定"
          >
            <Settings size={22} />
            <span className="sangaku-nav-label">設定</span>
          </button>
        </nav>
      </aside>

      <div className="sangaku-main">
        <main className="content">
          {activeTab === "form" ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <FormEditor
                onFormCreated={({ formId: createdFormId, formUrl: createdFormUrl }) => {
                  setCreatedFormId(createdFormId || null);
                }}
              />
            </motion.div>
          ) : activeTab === "settings" ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <SettingsPage />
            </motion.div>
          ) : (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <StatsViewer initialFormId={createdFormId} />
            </motion.div>
          )}
        </main>
      </div>
    </div>
  );
}
