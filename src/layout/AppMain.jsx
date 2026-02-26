import { useCallback, useEffect, useState } from "react";

const MOBILE_BREAKPOINT = 720;
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth <= MOBILE_BREAKPOINT
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const fn = () => setIsMobile(mq.matches);
    fn();
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  return isMobile;
}
import { motion } from "framer-motion";
import { Pencil, BarChart3, Settings, LogOut, Lock, BookOpen } from "lucide-react";
import "../App.css";
import FormEditor from "../features/forms/FormEditor";
import StatsViewer from "../features/stats/StatsViewer";
import SettingsPage from "../features/settings/Settings";
import ManualPage from "../features/manual/Manual";
import AuthGate from "../features/auth/AuthGate";

const TAB_TO_PATH = {
  stats: "/stats",
  form: "/create",
  settings: "/settings",
  manual: "/manual",
  userGuide: "/user-guide",
};

function tabFromPath(pathname) {
  const raw = String(pathname || "/").trim();
  const normalized = raw.replace(/\/+$/, "") || "/";
  if (normalized === "/" || normalized === "/stats") return "stats";
  if (normalized === "/create") return "form";
  if (normalized === "/settings") return "settings";
  if (normalized === "/manual") return "manual";
  if (normalized === "/user-guide") return "userGuide";
  return "stats";
}

function pathFromTab(tab) {
  return TAB_TO_PATH[tab] || "/stats";
}

export default function App({
  isLoggedIn,
  onLogin,
  onLogout,
  navPosition = "sidebar",
  navLabelMode = "icon",
}) {
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState(() =>
    tabFromPath(typeof window !== "undefined" ? window.location.pathname : "/")
  );
  const [createdFormId, setCreatedFormId] = useState(null);
  const [authPromptFor, setAuthPromptFor] = useState(null); // "stats" | "form" | null

  const navigateToTab = useCallback((tab, { replace = false } = {}) => {
    const nextTab = String(tab || "stats");
    const nextPath = pathFromTab(nextTab);
    setActiveTab(nextTab);
    if (typeof window === "undefined") return;
    if (window.location.pathname === nextPath) return;
    window.history[replace ? "replaceState" : "pushState"]({}, "", nextPath);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // 初回表示時にURLを正規化（例: "/" -> "/stats"）
    const canonical = pathFromTab(tabFromPath(window.location.pathname));
    if (window.location.pathname !== canonical) {
      window.history.replaceState({}, "", canonical);
    }
    const onPopState = () => {
      setActiveTab(tabFromPath(window.location.pathname));
      setAuthPromptFor(null);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (isLoggedIn) setAuthPromptFor(null);
  }, [isLoggedIn]);

  const requestAuth = (tab) => {
    navigateToTab(tab);
    setAuthPromptFor(tab);
  };

  const needsAuth =
    !isLoggedIn && (activeTab === "stats" || activeTab === "form" || activeTab === "settings");
  const isLocked = !isLoggedIn;

  const showIcon = navLabelMode === "icon" || navLabelMode === "both";
  const showLabel = navLabelMode === "text" || navLabelMode === "both";

  const mainNavButtons = (
    <>
      <button
        type="button"
        className={`sangaku-nav-item ${activeTab === "stats" ? "active" : ""} ${
          isLocked ? "is-locked" : ""
        }`}
        onClick={() => (isLoggedIn ? navigateToTab("stats") : requestAuth("stats"))}
        title={isLocked ? "集計（ログインが必要）" : "集計結果"}
        aria-label="集計結果"
        aria-disabled={isLocked}
        data-tooltip={isLocked ? "ログインが必要です" : "回答状況を確認"}
      >
        {isLocked && (
          <span className="sangaku-lock-badge" aria-hidden="true">
            <Lock size={14} />
          </span>
        )}
        {showIcon && <BarChart3 size={22} />}
        {showLabel && <span className="sangaku-nav-label">集計</span>}
      </button>
      <button
        type="button"
        className={`sangaku-nav-item ${activeTab === "form" ? "active" : ""} ${
          isLocked ? "is-locked" : ""
        }`}
        onClick={() => (isLoggedIn ? navigateToTab("form") : requestAuth("form"))}
        title={isLocked ? "作成（ログインが必要）" : "フォーム作成"}
        aria-label="フォーム作成"
        aria-disabled={isLocked}
        data-tooltip={isLocked ? "ログインが必要です" : "フォームを作成"}
      >
        {isLocked && (
          <span className="sangaku-lock-badge" aria-hidden="true">
            <Lock size={14} />
          </span>
        )}
        {showIcon && <Pencil size={22} />}
        {showLabel && <span className="sangaku-nav-label">作成</span>}
      </button>
    </>
  );

  const bottomNavButtons = (
    <>
      {isLoggedIn && (
        <button
          type="button"
          className="sangaku-nav-item sangaku-nav-item--subtle sangaku-nav-item--danger"
          onClick={() => onLogout?.()}
          aria-label="ログアウト"
          data-tooltip="ログアウト"
        >
          {showIcon && <LogOut size={22} />}
          {showLabel && <span className="sangaku-nav-label">ログアウト</span>}
        </button>
      )}
      <button
        type="button"
        className={`sangaku-nav-item sangaku-nav-item--subtle ${
          activeTab === "manual" || activeTab === "userGuide" ? "active" : ""
        }`}
        onClick={() => navigateToTab("manual")}
        aria-label="説明書"
        data-tooltip="説明書"
      >
        {showIcon && <BookOpen size={22} />}
        {showLabel && <span className="sangaku-nav-label">説明書</span>}
      </button>
      <button
        type="button"
        className={`sangaku-nav-item sangaku-nav-item--subtle ${
          activeTab === "settings" ? "active" : ""
        } ${isLocked ? "is-locked" : ""}`}
        onClick={() => (isLoggedIn ? navigateToTab("settings") : requestAuth("settings"))}
        aria-label="設定"
        aria-disabled={isLocked}
        data-tooltip={isLocked ? "ログインが必要です" : "設定"}
      >
        {isLocked && (
          <span className="sangaku-lock-badge" aria-hidden="true">
            <Lock size={14} />
          </span>
        )}
        {showIcon && <Settings size={22} />}
        {showLabel && <span className="sangaku-nav-label">設定</span>}
      </button>
    </>
  );

  return (
    <div
      className={`sangaku-shell sangaku-nav-${navPosition}`}
      data-nav-position={navPosition}
      data-nav-label-mode={navLabelMode}
    >
      {navPosition === "sidebar" && (
        <aside className="sangaku-sidebar" aria-label="ナビゲーション">
          <div className="sangaku-brand" aria-label="アプリ名">
            <img
              src="/beko.png"
              alt="FMT"
              className="sangaku-brand-logo"
              width="44"
              height="44"
            />
          </div>
          <nav className="sangaku-nav" aria-label="ページ切替">
            <div className="sangaku-nav-group" aria-label="メインメニュー">
              {mainNavButtons}
            </div>
          </nav>
          <div className="sangaku-sidebar-bottom" aria-label="情報・設定">
            {bottomNavButtons}
          </div>
        </aside>
      )}

      {(navPosition === "top-left" || navPosition === "bottom-left") && (
        <div
          className={`sangaku-nav-float sangaku-nav-float--${navPosition}`}
          aria-label="ナビゲーション"
        >
          <div className="sangaku-nav-float-brand">
            <img src="/beko.png" alt="FMT" className="sangaku-brand-logo" width="28" height="28" />
          </div>
          <nav className="sangaku-nav-float-row">
            {mainNavButtons}
            {bottomNavButtons}
          </nav>
        </div>
      )}

      <div className="sangaku-main">
        <main
          className="content"
          data-active-tab={activeTab}
        >
          {needsAuth ? (
            <AuthGate
              tab={authPromptFor || activeTab}
              onLogin={onLogin}
              onGoSettings={() => navigateToTab("settings")}
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
              <ManualPage
              onOpenPdf={() => {
                if (isMobile) {
                  window.open("/userGuide.pdf", "_blank", "noopener,noreferrer");
                } else {
                  navigateToTab("userGuide");
                }
              }}
            />
            </motion.div>
          ) : activeTab === "userGuide" ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="user-guide-page"
            >
              <div className="user-guide-page-header">
                <button
                  type="button"
                  className="user-guide-back-btn"
                  onClick={() => navigateToTab("manual")}
                >
                  ← 説明書に戻る
                </button>
              </div>
              {isMobile ? (
                <div className="user-guide-mobile-fallback">
                  <p>スマホではPDFのスクロールがうまくいかないため、新しいタブで開いてください。</p>
                  <a
                    href="/userGuide.pdf"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="user-guide-open-btn"
                  >
                    新しいタブでPDFを開く
                  </a>
                </div>
              ) : (
                <iframe
                  src="/userGuide.pdf#toolbar=0&navpanes=0"
                  title="利用ガイド PDF"
                  className="user-guide-iframe"
                />
              )}
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
