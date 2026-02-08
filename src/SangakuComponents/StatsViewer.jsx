// src/components/StatsViewer.jsx
import { useEffect, useState } from "react";
import DataTable from "./DataTable";
import AttendingList from "./AttendingList";

export default function StatsViewer({ formId }) {
  const meetingTitle = "2025年10月 定例会（会津地区経営者協会）";
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!formId) return;

    let cancelled = false;
    const run = async () => {
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
          if (!cancelled) setRows([]);
          return;
        }
        if (!Array.isArray(nextRows)) {
          throw new Error("Invalid API response: rows is not an array");
        }

        if (!cancelled) setRows(nextRows);
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setRows([]);
          setError(e?.message || "Failed to fetch responses");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [formId]);

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
      ) : rows.length === 0 ? (
        <p style={{ textAlign: "center", marginTop: "1rem" }}>
          回答はまだありません
        </p>
      ) : (
        <>
          {/* 全体集計テーブル */}
          <DataTable participants={rows} />

          {/* 出席者リスト + PDF出力 */}
          <AttendingList participants={rows} meetingTitle={meetingTitle} />
        </>
      )}
    </div>
  );
}
