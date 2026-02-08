import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { FileText, BarChart3, Home } from "lucide-react";
import "../App.css";
import FormEditor from "./FormEditor";
import StatsViewer from "./StatsViewer";

const FORM_NAME_TAG_PREFIX = "[gformgen:sangaku]";

export default function App() {
  const [activeTab, setActiveTab] = useState("form");
  const [formId, setFormId] = useState(null);
  const [formUrl, setFormUrl] = useState(null);
  const [forms, setForms] = useState([]);
  const [formsError, setFormsError] = useState(null);

  const handleGoHome = () => {
    // ホームページに戻る処理（ルートを持つ場合は navigate("/") など）
    window.location.href = "/"; // 例: ルート直下に戻る
  };

  const refreshForms = async ({ selectFormId } = {}) => {
    setFormsError(null);
    try {
      const res = await fetch("http://localhost:3000/api/forms/list");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to list forms");

      const list = Array.isArray(data?.forms) ? data.forms : [];
      setForms(list);

      if (selectFormId) {
        await selectFormIdAndFetchInfo(selectFormId);
      } else {
        const stored = window.localStorage.getItem("selectedFormId");
        const candidate =
          stored && list.some((f) => f.formId === stored)
            ? stored
            : !formId && list.length > 0
              ? list[0]?.formId
              : formId;
        if (candidate) await selectFormIdAndFetchInfo(candidate);
      }
    } catch (e) {
      console.error(e);
      setForms([]);
      setFormsError(e?.message || "Failed to list forms");
    }
  };

  const selectFormIdAndFetchInfo = async (nextFormId) => {
    const id = nextFormId || null;
    setFormId(id);
    setFormUrl(null);
    if (!id) {
      window.localStorage.removeItem("selectedFormId");
      return;
    }
    window.localStorage.setItem("selectedFormId", id);

    try {
      const res = await fetch(
        `http://localhost:3000/api/forms/${encodeURIComponent(id)}/info`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to get form info");
      setFormUrl(data?.formUrl || null);
    } catch (e) {
      console.error(e);
      setFormUrl(null);
      // ここは致命ではないので formsError は潰さない（ヘッダーが赤くならないように）
    }
  };

  useEffect(() => {
    void refreshForms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

          {/* フォーム切り替え */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <select
              value={formId || ""}
              onChange={(e) => void selectFormIdAndFetchInfo(e.target.value)}
              style={{
                maxWidth: 320,
                padding: "0.45rem 0.7rem",
                borderRadius: 12,
                border: "1px solid rgba(148,163,184,0.6)",
                background: "#fff",
              }}
              aria-label="フォーム切り替え"
            >
              <option value="">（フォーム未選択）</option>
              {forms.map((f) => (
                <option key={f.formId} value={f.formId}>
                  {(f.title || "").startsWith(FORM_NAME_TAG_PREFIX)
                    ? (f.title || "").replace(`${FORM_NAME_TAG_PREFIX} `, "")
                    : f.title}
                </option>
              ))}
            </select>
            <button className="expand-btn" onClick={() => refreshForms()}>
              更新
            </button>
          </div>

          {/* 右端：ホームボタン */}
          <button className="home-btn" onClick={handleGoHome}>
            <Home size={18} />
            <span>ホーム</span>
          </button>
        </div>
        {formsError && (
          <div style={{ color: "red", fontSize: "0.9rem", paddingTop: "0.25rem" }}>
            {formsError}
          </div>
        )}
      </header>

      {/* ▼ メイン部分 */}
      <main className="content">
        {activeTab === "form" ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <FormEditor
              forms={forms}
              selectedFormId={formId}
              selectedFormUrl={formUrl}
              onSelectFormId={selectFormIdAndFetchInfo}
              onRefreshForms={() => refreshForms()}
              onFormCreated={({ formId: createdFormId, formUrl: createdFormUrl }) => {
                const nextId = createdFormId || null;
                setFormId(nextId);
                setFormUrl(createdFormUrl || null);
                if (createdFormId) void refreshForms({ selectFormId: createdFormId });
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
