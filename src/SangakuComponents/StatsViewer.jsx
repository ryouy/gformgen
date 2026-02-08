// src/components/StatsViewer.jsx
import { useCallback, useEffect, useState } from "react";
import DataTable from "./DataTable";
import AttendingList from "./AttendingList";

export default function StatsViewer({ formId }) {
  const meetingTitle = "2025年10月 定例会（会津地区経営者協会）";
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchRows = useCallback(async () => {
    if (!formId) return;

    setLoading(true);
    setError(null);
    console.log("StatsViewer formId:", formId);
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
  }, [formId]);

  useEffect(() => {
    if (!formId) return;
    void fetchRows();
  }, [formId, fetchRows]);

  // フォーム送信後に戻ってきた時に自動更新（ノーリロード）
  useEffect(() => {
    if (!formId) return;

    const onFocus = () => {
      if (!document.hidden) void fetchRows();
    };
    const onVisibility = () => {
      if (!document.hidden) void fetchRows();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [formId, fetchRows]);

  return (
    <div className="stats-viewer">
      {!formId ? (
        <p style={{ textAlign: "center", marginTop: "1rem" }}>
          フォームを先に作成してください
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
              <button className="expand-btn" onClick={fetchRows}>
                更新
              </button>
            </div>
          )}

          {/* 全体集計テーブル */}
          <DataTable participants={rows} />

          {/* 出席者リスト + PDF出力 */}
          <AttendingList participants={rows} meetingTitle={meetingTitle} />
        </>
      )}
    </div>
  );
}
