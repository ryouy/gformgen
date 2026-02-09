import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { FileText, BarChart3, Settings, LogOut, Lock, BookOpen } from "lucide-react";
import "../App.css";
import FormEditor from "./FormEditor";
import StatsViewer from "./StatsViewer";
import SettingsPage from "./Settings";
import ManualPage from "./Manual";
import AuthGate from "./AuthGate";

export default function App({ isLoggedIn, onLogin, onLogout }) {
  // デフォルトは「集計結果」タブを開く
  const [activeTab, setActiveTab] = useState("stats");
  const [createdFormId, setCreatedFormId] = useState(null);
  const [authPromptFor, setAuthPromptFor] = useState(null); // "stats" | "form" | null

  useEffect(() => {
    if (isLoggedIn) setAuthPromptFor(null);
  }, [isLoggedIn]);

  const requestAuth = (tab) => {
    setActiveTab(tab);
    setAuthPromptFor(tab);
  };

  const needsAuth = !isLoggedIn && (activeTab === "stats" || activeTab === "form");
  const isLocked = !isLoggedIn;

  return (
    <div className="sangaku-shell">
      <aside className="sangaku-sidebar" aria-label="ナビゲーション">
        <div className="sangaku-brand" aria-label="アプリ名">
          <span className="sangaku-brand-text">FCT</span>
        </div>

        <nav className="sangaku-nav" aria-label="ページ切替">
          <div className="sangaku-nav-group" aria-label="メインメニュー">
            <button
              type="button"
              className={`sangaku-nav-item ${activeTab === "stats" ? "active" : ""} ${
                isLocked ? "is-locked" : ""
              }`}
              onClick={() => (isLoggedIn ? setActiveTab("stats") : requestAuth("stats"))}
              title={isLocked ? "集計（ログインが必要）" : "集計結果"}
              aria-label="集計結果"
              aria-disabled={isLocked}
              data-tooltip={isLocked ? "ログインが必要です" : undefined}
            >
              {isLocked && (
                <span className="sangaku-lock-badge" aria-hidden="true">
                  <Lock size={14} />
                </span>
              )}
              <BarChart3 size={22} />
              <span className="sangaku-nav-label">集計</span>
            </button>
            <button
              type="button"
              className={`sangaku-nav-item ${activeTab === "form" ? "active" : ""} ${
                isLocked ? "is-locked" : ""
              }`}
              onClick={() => (isLoggedIn ? setActiveTab("form") : requestAuth("form"))}
              title={isLocked ? "作成（ログインが必要）" : "フォーム作成"}
              aria-label="フォーム作成"
              aria-disabled={isLocked}
              data-tooltip={isLocked ? "ログインが必要です" : undefined}
            >
              {isLocked && (
                <span className="sangaku-lock-badge" aria-hidden="true">
                  <Lock size={14} />
                </span>
              )}
              <FileText size={22} />
              <span className="sangaku-nav-label">作成</span>
            </button>
          </div>
        </nav>

        <div className="sangaku-sidebar-bottom" aria-label="情報・設定">
          {isLoggedIn && (
            <button
              type="button"
              className="sangaku-nav-item sangaku-nav-item--subtle sangaku-nav-item--icononly sangaku-nav-item--danger"
              onClick={() => onLogout?.()}
              aria-label="ログアウト"
              data-tooltip="ログアウト"
            >
              <LogOut size={22} />
              <span className="sangaku-nav-label">ログアウト</span>
            </button>
          )}
          <button
            type="button"
            className={`sangaku-nav-item sangaku-nav-item--subtle sangaku-nav-item--icononly ${
              activeTab === "manual" ? "active" : ""
            }`}
            onClick={() => setActiveTab("manual")}
            aria-label="説明書"
            data-tooltip="説明書"
          >
            <BookOpen size={22} />
            <span className="sangaku-nav-label">説明書</span>
          </button>
          <button
            type="button"
            className={`sangaku-nav-item sangaku-nav-item--subtle sangaku-nav-item--icononly ${
              activeTab === "settings" ? "active" : ""
            }`}
            onClick={() => setActiveTab("settings")}
            aria-label="設定"
            data-tooltip="設定"
          >
            <Settings size={22} />
            <span className="sangaku-nav-label">設定</span>
          </button>
        </div>
      </aside>

      <div className="sangaku-main">
        <main className="content">
          {needsAuth ? (
            <AuthGate
              tab={authPromptFor || activeTab}
              onLogin={onLogin}
              onGoSettings={() => setActiveTab("settings")}
            />
          ) : activeTab === "form" ? (
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
          ) : activeTab === "manual" ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <ManualPage />
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
