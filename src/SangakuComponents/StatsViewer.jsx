// src/components/StatsViewer.jsx
import { useCallback, useEffect, useState } from "react";
import DataTable from "./DataTable";
import AttendingList from "./AttendingList";
import { Link as LinkIcon, QrCode } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";

const FORM_NAME_TAG_PREFIX = "[gformgen:sangaku]";

function formatDateYMD(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

export default function StatsViewer({ initialFormId }) {
  const meetingTitle = "2025年10月 定例会（会津地区経営者協会）";
  const [forms, setForms] = useState([]);
  const [selectedFormId, setSelectedFormId] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [formsError, setFormsError] = useState(null);
  const [qrOpen, setQrOpen] = useState(false);

  const fetchForms = useCallback(async () => {
    setFormsError(null);
    try {
      const res = await fetch("http://localhost:3000/api/forms/list");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to list forms");
      const list = Array.isArray(data?.forms) ? data.forms : [];
      setForms(list);
      return list;
    } catch (e) {
      console.error(e);
      setForms([]);
      setFormsError(e?.message || "Failed to list forms");
      return [];
    }
  }, []);

  const fetchFormInfo = useCallback(async (formId) => {
    try {
      const res = await fetch(
        `http://localhost:3000/api/forms/${encodeURIComponent(formId)}/info`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to get form info");
      setFormUrl(data?.formUrl || "");
    } catch (e) {
      console.error(e);
      setFormUrl("");
    }
  }, []);

  const fetchRows = useCallback(
    async (formId) => {
      if (!formId) return;

      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `http://localhost:3000/api/forms/${encodeURIComponent(formId)}/responses`
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const message = data?.error || "Failed to fetch responses";
          throw new Error(message);
        }

        const nextRows = data?.rows;
        if (nextRows == null) {
          setRows([]);
          return;
        }
        if (!Array.isArray(nextRows)) {
          throw new Error("Invalid API response: rows is not an array");
        }

        setRows(nextRows);
      } catch (e) {
        console.error(e);
        setRows([]);
        setError(e?.message || "Failed to fetch responses");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    // 集計タブ表示時に一覧取得
    void (async () => {
      const list = await fetchForms();
      const nextId =
        initialFormId && list.some((f) => f.formId === initialFormId)
          ? initialFormId
          : "";
      if (nextId) {
        setSelectedFormId(nextId);
        await fetchFormInfo(nextId);
        await fetchRows(nextId);
      }
    })();
  }, [fetchForms, fetchFormInfo, fetchRows, initialFormId]);

  // フォーム送信後に戻ってきた時に自動更新（ノーリロード）
  useEffect(() => {
    if (!selectedFormId) return;

    const onFocus = () => {
      if (!document.hidden) void fetchRows(selectedFormId);
    };
    const onVisibility = () => {
      if (!document.hidden) void fetchRows(selectedFormId);
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [selectedFormId, fetchRows]);

  return (
    <div className="stats-viewer">
      {/* 上部：既存フォーム選択 + 更新 + 小型リンク/QR */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          flexWrap: "wrap",
          marginBottom: "1rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <select
            value={selectedFormId}
            onChange={(e) => {
              const id = e.target.value;
              setSelectedFormId(id);
              setError(null);
              setFormUrl("");
              if (!id) {
                setRows([]);
                return;
              }
              // await せず並列で走らせて、空表示のチラつきを避ける
              void fetchFormInfo(id);
              void fetchRows(id);
            }}
            style={{
              maxWidth: 380,
              padding: "0.45rem 0.7rem",
              borderRadius: 12,
              border: "1px solid rgba(148,163,184,0.6)",
              background: "#fff",
            }}
            aria-label="既存フォームを選択"
          >
            <option value="">既存フォームを選択</option>
            {forms.map((f) => {
              const title = (f.title || "").startsWith(FORM_NAME_TAG_PREFIX)
                ? (f.title || "").replace(`${FORM_NAME_TAG_PREFIX} `, "")
                : f.title;
              const ymd = formatDateYMD(f.createdTime);
              return (
                <option key={f.formId} value={f.formId}>
                  {title}
                  {ymd ? `（${ymd} 作成）` : ""}
                </option>
              );
            })}
          </select>
        </div>

        {selectedFormId && formUrl ? (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {/* フォームへのリンク */}
          <a
            href={formUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="フォームを開く"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 38,
              height: 38,
              borderRadius: 12,
              border: "1px solid rgba(148,163,184,0.6)",
              background: "#fff",
              color: "inherit", // 必要に応じて指定
            }}
          >
            <LinkIcon size={18} />
          </a>
        
          {/* QRコード表示ボタン */}
          <button
            type="button"
            onClick={() => setQrOpen(true)}
            title="QRを表示"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 38,
              height: 38,
              borderRadius: 12,
              border: "1px solid rgba(148,163,184,0.6)",
              background: "#fff",
              color: "#3b82f6",
              cursor: "pointer",
              padding: 0, // ボタンのデフォルトパディングを消す
            }}
          >
            {/* QRコード用のアイコンがあればそれに変更するのがベター */}
            <QrCode size={18} />
          </button>
        </div>
        ) : null}
      </div>

      {formsError && (
        <p style={{ color: "red", textAlign: "center", marginBottom: "1rem" }}>
          {formsError}
        </p>
      )}

      {!selectedFormId ? (
        <p style={{ textAlign: "center", marginTop: "1rem" }}>
          既存フォームを選択してください
        </p>
      ) : loading ? (
        <p style={{ textAlign: "center", marginTop: "1rem" }}>読み込み中…</p>
      ) : error ? (
        <p style={{ color: "red", textAlign: "center", marginTop: "1rem" }}>
          {error}
        </p>
      ) : (
        <>
          {rows.length === 0 && (
            <div style={{ textAlign: "center", marginTop: "1rem" }}>
              <p>回答はまだありません</p>
            </div>
          )}

          {/* 全体集計テーブル */}
          <DataTable participants={rows} />

          {/* 出席者リスト + PDF出力 */}
          <AttendingList participants={rows} meetingTitle={meetingTitle} />
        </>
      )}

      
{qrOpen && selectedFormId && formUrl && (
  <div
    role="dialog"
    aria-modal="true"
    onClick={() => setQrOpen(false)}
    style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.4)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "1rem",
      zIndex: 2000,
    }}
  >
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        background: "#fff",
        borderRadius: 16,
        padding: "1rem",
        maxWidth: 420,
        width: "100%",
        textAlign: "center",
      }}
    >
      <QRCodeCanvas
        value={formUrl}
        size={280}
        bgColor="#ffffff"
        fgColor="#000000"
        level="Q"
        includeMargin
      />

      <div style={{ marginTop: "0.75rem" }}>
        <button
          type="button"
          className="expand-btn"
          onClick={() => setQrOpen(false)} // ✅ 正解
        >
          閉じる
        </button>
      </div>
    </div>
  </div>
)}

    </div>
  );
}
