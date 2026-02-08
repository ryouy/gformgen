// src/components/StatsViewer.jsx
import { useCallback, useEffect, useState } from "react";
import DataTable from "./DataTable";
import jsPDF from "jspdf";
import "jspdf-autotable";
import fontData from "../assets/fonts/NotoSansJP-Regular.base64.txt?raw";
import {
  Link as LinkIcon,
  QrCode,
  Download,
  Lock,
  Trash2,
  FileText,
} from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";

const FORM_NAME_TAG_PREFIX = "[gformgen:sangaku]";
const FORM_CLOSED_TAG = "[gformgen:closed]";
const SELECTED_FORM_ID_STORAGE_KEY = "sangaku.selectedFormId";

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
  const [summaries, setSummaries] = useState({}); // { [formId]: { responseCount, attendeeCount } }
  const [selectedFormId, setSelectedFormId] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [acceptingResponses, setAcceptingResponses] = useState(null);
  const [listMode, setListMode] = useState("open"); // "open" | "closed"
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
      // 一覧表示は「リアルタイム集計（キャッシュ不要）」方針なので、都度サマリーは取り直す
      setSummaries({});
      return list;
    } catch (e) {
      console.error(e);
      setForms([]);
      setFormsError(e?.message || "Failed to list forms");
      return [];
    }
  }, []);

  const fetchSummary = useCallback(async (formId) => {
    if (!formId) return null;
    try {
      const res = await fetch(
        `http://localhost:3000/api/forms/${encodeURIComponent(formId)}/summary`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to get summary");
      const responseCount = Number(data?.responseCount);
      const attendeeCount = Number(data?.attendeeCount);
      if (!Number.isFinite(responseCount) || !Number.isFinite(attendeeCount)) {
        throw new Error("Invalid API response: summary is not numeric");
      }
      setSummaries((prev) => ({
        ...prev,
        [formId]: { responseCount, attendeeCount },
      }));
      return { responseCount, attendeeCount };
    } catch (e) {
      console.error(e);
      return null;
    }
  }, []);

  const prefetchSummaries = useCallback(
    async (formIds) => {
      const ids = Array.from(new Set((formIds || []).filter(Boolean)));
      if (ids.length === 0) return;

      const missing = ids.filter((id) => summaries?.[id] == null);
      if (missing.length === 0) return;

      // 軽い並列制限（5件ずつ）
      for (let i = 0; i < missing.length; i += 5) {
        const chunk = missing.slice(i, i + 5);
        await Promise.allSettled(chunk.map((id) => fetchSummary(id)));
      }
    },
    [fetchSummary, summaries]
  );

  const fetchFormInfo = useCallback(async (formId) => {
    try {
      const res = await fetch(
        `http://localhost:3000/api/forms/${encodeURIComponent(formId)}/info`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to get form info");
      setFormUrl(data?.formUrl || "");
      setAcceptingResponses(
        typeof data?.acceptingResponses === "boolean" ? data.acceptingResponses : null
      );
    } catch (e) {
      console.error(e);
      setFormUrl("");
      setAcceptingResponses(null);
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
      const stored = window.localStorage.getItem(SELECTED_FORM_ID_STORAGE_KEY);
      const nextId =
        (stored && list.some((f) => f.formId === stored) && stored) ||
        (initialFormId && list.some((f) => f.formId === initialFormId) && initialFormId) ||
        "";

      if (!nextId) return;
      setSelectedFormId(nextId);
      window.localStorage.setItem(SELECTED_FORM_ID_STORAGE_KEY, nextId);
      // 選択したフォームが締切済みならリストもそちらに寄せる
      const selected = list.find((f) => f.formId === nextId);
      setListMode(selected?.acceptingResponses === false ? "closed" : "open");
      // 一覧にサマリー表示するため、まず選択フォームだけ先に取る
      void fetchSummary(nextId);
      await fetchFormInfo(nextId);
      await fetchRows(nextId);
    })();
  }, [fetchForms, fetchFormInfo, fetchRows, fetchSummary, initialFormId]);

  // listMode/forms 変更に応じて、表示対象リスト分のサマリーを事前取得
  useEffect(() => {
    const open = forms.filter((f) => f.acceptingResponses !== false);
    const closed = forms.filter((f) => f.acceptingResponses === false);
    const list = listMode === "closed" ? closed : open;
    void prefetchSummaries(list.map((f) => f.formId));
  }, [forms, listMode, prefetchSummaries]);

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
      {/* 上部：既存フォーム選択 + 操作（リンク/QR/CSV/PDF/締切/削除） */}
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
          <div className="mini-tabs" role="tablist" aria-label="フォーム一覧切替">
            <button
              type="button"
              className={`mini-tab ${listMode === "open" ? "active" : ""}`}
              onClick={() => {
                setListMode("open");
                if (
                  selectedFormId &&
                  forms.some((f) => f.formId === selectedFormId && f.acceptingResponses === false)
                ) {
                  setSelectedFormId("");
                  setRows([]);
                  setFormUrl("");
                  setAcceptingResponses(null);
                  window.localStorage.removeItem(SELECTED_FORM_ID_STORAGE_KEY);
                }
              }}
            >
              集計中
            </button>
            <button
              type="button"
              className={`mini-tab ${listMode === "closed" ? "active" : ""}`}
              onClick={() => {
                setListMode("closed");
                if (
                  selectedFormId &&
                  forms.some((f) => f.formId === selectedFormId && f.acceptingResponses !== false)
                ) {
                  setSelectedFormId("");
                  setRows([]);
                  setFormUrl("");
                  setAcceptingResponses(null);
                  window.localStorage.removeItem(SELECTED_FORM_ID_STORAGE_KEY);
                }
              }}
            >
              締切済み
            </button>
          </div>

          <select
            value={selectedFormId}
            onChange={(e) => {
              const id = e.target.value;
              // 選択に合わせてリストモードも寄せる
              const f = forms.find((x) => x.formId === id);
              if (f) setListMode(f.acceptingResponses === false ? "closed" : "open");
              setSelectedFormId(id);
              setError(null);
              setFormUrl("");
              setAcceptingResponses(null);
              if (!id) {
                setRows([]);
                window.localStorage.removeItem(SELECTED_FORM_ID_STORAGE_KEY);
                return;
              }
              window.localStorage.setItem(SELECTED_FORM_ID_STORAGE_KEY, id);
              // await せず並列で走らせて、空表示のチラつきを避ける
              void fetchSummary(id);
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
            {(() => {
              const normalizeTitle = (t) =>
                String(t || "")
                  .replace(FORM_NAME_TAG_PREFIX, "")
                  .replace(FORM_CLOSED_TAG, "")
                  .replace(/\s+/g, " ")
                  .trim();

              const truncate = (t, max = 12) => {
                const s = String(t || "");
                if (s.length <= max) return s;
                return `${s.slice(0, max)}…`;
              };

              const open = forms.filter((f) => f.acceptingResponses !== false);
              const closed = forms.filter((f) => f.acceptingResponses === false);
              const list = listMode === "closed" ? closed : open;

              const render = (list) =>
                list.map((f) => {
                  const title = normalizeTitle(f.title);
                  const ymd = formatDateYMD(f.createdTime);
                  const s = summaries?.[f.formId];
                  const summaryText = s
                    ? ` 出席:${s.attendeeCount}人 / 回答:${s.responseCount}件`
                    : " 出席:…人 / 回答:…件";
                  return (
                    <option key={f.formId} value={f.formId}>
                      {truncate(title, 12)}
                      {summaryText}
                      {ymd ? `（${ymd}）` : ""}
                    </option>
                  );
                });

              return render(list);
            })()}
          </select>
        </div>

        {selectedFormId && formUrl ? (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {/* 状態 */}
            <span
              style={{
                fontSize: "0.85rem",
                fontWeight: 700,
                color: acceptingResponses === false ? "#64748b" : "#059669",
              }}
            >
              {acceptingResponses === false ? "締切済み" : "受付中"}
            </span>

            {/* フォームへのリンク */}
            <span className="tooltip-wrap">
              <a
                href={formUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  border: "1px solid rgba(148,163,184,0.6)",
                  background: "#fff",
                  color: "inherit",
                }}
              >
                <LinkIcon size={18} />
              </a>
              <span className="tooltip-bubble">フォームを開く</span>
            </span>

            {/* QRコード表示ボタン */}
            <span className="tooltip-wrap">
              <button
                type="button"
                onClick={() => setQrOpen(true)}
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
                  padding: 0,
                }}
              >
                <QrCode size={18} />
              </button>
              <span className="tooltip-bubble">QRを表示</span>
            </span>

          {/* CSV */}
            <span className="tooltip-wrap">
              <button
                type="button"
                onClick={() => {
                  const escape = (v) => {
                    const s = String(v ?? "");
                    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
                  };
                  const header = [
                    "company",
                    "role",
                    "name",
                    "attendance",
                    "count",
                    "remarks",
                    "submittedAt",
                  ];
                  const lines = [
                    header.join(","),
                    ...rows.map((r) =>
                      [
                        r?.company,
                        r?.role,
                        r?.name,
                        r?.attendance,
                        r?.count,
                        r?.remarks,
                        r?.submittedAt,
                      ]
                        .map(escape)
                        .join(",")
                    ),
                  ];
                  const csv = `\uFEFF${lines.join("\n")}`;
                  const blob = new Blob([csv], {
                    type: "text/csv;charset=utf-8;",
                  });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `responses_${selectedFormId}.csv`;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  URL.revokeObjectURL(url);
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  border: "1px solid rgba(148,163,184,0.6)",
                  background: "#fff",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                <Download size={18} />
              </button>
              <span className="tooltip-bubble">CSVダウンロード</span>
            </span>

            {/* PDF */}
            <span className="tooltip-wrap">
              <button
                type="button"
                onClick={() => {
                  const attending = rows.filter((r) => r?.attendance === "出席");
                  if (attending.length === 0) {
                    alert("出席者データがありません。");
                    return;
                  }

                  const pdf = new jsPDF({
                    orientation: "portrait",
                    unit: "mm",
                    format: "a4",
                  });

                  pdf.addFileToVFS("NotoSansJP-Regular.ttf", fontData);
                  pdf.addFont("NotoSansJP-Regular.ttf", "NotoSansJP", "normal");
                  pdf.setFont("NotoSansJP", "normal");

                  pdf.setFontSize(16);
                  pdf.text(meetingTitle || "会合名未設定", 14, 18);
                  pdf.setFontSize(14);
                  pdf.text("出席者一覧", 14, 28);

                  const headers = [["No", "事業所名", "役職名", "氏名", "人数"]];
                  const body = attending.map((p, i) => [
                    String(i + 1),
                    p.company || "",
                    p.role || "ー",
                    p.name || "",
                    String(Number(p?.count) || 1),
                  ]);

                  pdf.autoTable({
                    startY: 36,
                    head: headers,
                    body,
                    styles: {
                      font: "NotoSansJP",
                      fontSize: 10.5,
                      halign: "center",
                      valign: "middle",
                      cellPadding: { top: 4, bottom: 4 },
                      textColor: [30, 30, 30],
                      lineColor: [220, 220, 220],
                      lineWidth: 0.25,
                    },
                    headStyles: {
                      fillColor: [240, 242, 245],
                      textColor: [30, 30, 30],
                      fontStyle: "bold",
                    },
                    columnStyles: {
                      0: { halign: "center", cellWidth: 10 },
                      1: { halign: "center", cellWidth: 60 },
                      2: { halign: "center", cellWidth: 25 },
                      3: { halign: "center", cellWidth: 35 },
                      4: { halign: "center", cellWidth: 15 },
                    },
                    theme: "grid",
                    margin: { left: 12, right: 12 },
                  });

                  const attendanceCompanies = new Set(
                    attending
                      .map((p) => (p?.company || "").trim())
                      .filter(Boolean)
                  ).size;
                  const totalAttendance = attending.reduce(
                    (sum, p) => sum + (Number(p?.count) || 1),
                    0
                  );

                  const y = pdf.lastAutoTable.finalY + 10;
                  pdf.setFontSize(11);
                  pdf.text(
                    `出席事業所数：${attendanceCompanies} ｜ 合計出席人数：${totalAttendance}`,
                    pdf.internal.pageSize.getWidth() / 2,
                    y,
                    { align: "center" }
                  );

                  pdf.save(`${meetingTitle || "出席者一覧"}.pdf`);
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  border: "1px solid rgba(148,163,184,0.6)",
                  background: "#fff",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                <FileText size={18} />
              </button>
              <span className="tooltip-bubble">PDFダウンロード</span>
            </span>

          {/* 締切 */}
            <span className="tooltip-wrap">
              <button
                type="button"
                disabled={acceptingResponses === false}
                onClick={async () => {
                  if (!selectedFormId) return;
                  if (
                    !window.confirm(
                      "このフォームを締切済みにします（アプリ上の締切扱い）。よろしいですか？"
                    )
                  )
                    return;
                  try {
                    const res = await fetch(
                      `http://localhost:3000/api/forms/${encodeURIComponent(
                        selectedFormId
                      )}/close`,
                      { method: "POST" }
                    );
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) {
                      const msg = data?.error || "Failed to close form";
                      const err = new Error(msg);
                      err.status = res.status;
                      throw err;
                    }
                    setAcceptingResponses(false);
                    setListMode("closed");
                    void fetchForms();
                  } catch (e) {
                    console.error(e);
                    if (e?.status === 401) {
                      alert(
                        "締切に失敗しました（未ログイン）。\nバックエンドを再起動するとログインが切れるため、ホーム画面からGoogleログインし直してください。"
                      );
                    } else {
                      alert(`締切に失敗しました：${e?.message || "unknown error"}`);
                    }
                  }
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  border: "1px solid rgba(148,163,184,0.6)",
                  background: "#fff",
                  cursor: "pointer",
                  padding: 0,
                  opacity: acceptingResponses === false ? 0.5 : 1,
                }}
              >
                <Lock size={18} />
              </button>
              <span className="tooltip-bubble">締切</span>
            </span>

          {/* 削除（ゴミ箱） */}
            <span className="tooltip-wrap">
              <button
                type="button"
                onClick={async () => {
                  if (!selectedFormId) return;
                  if (
                    !window.confirm(
                      "このフォームを削除（Driveのゴミ箱へ移動）します。よろしいですか？"
                    )
                  )
                    return;
                  try {
                    const res = await fetch(
                      `http://localhost:3000/api/forms/${encodeURIComponent(
                        selectedFormId
                      )}/trash`,
                      { method: "POST" }
                    );
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) {
                      const msg = data?.error || "Failed to trash form";
                      const err = new Error(msg);
                      err.status = res.status;
                      throw err;
                    }
                    // 選択解除＆再discover
                    setSelectedFormId("");
                    setFormUrl("");
                    setAcceptingResponses(null);
                    setRows([]);
                    window.localStorage.removeItem(SELECTED_FORM_ID_STORAGE_KEY);
                    void fetchForms();
                  } catch (e) {
                    console.error(e);
                    if (e?.status === 401) {
                      alert(
                        "削除に失敗しました（未ログイン）。\nバックエンドを再起動するとログインが切れるため、ホーム画面からGoogleログインし直してください。"
                      );
                    } else {
                      alert(`削除に失敗しました：${e?.message || "unknown error"}`);
                    }
                  }
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  border: "1px solid rgba(148,163,184,0.6)",
                  background: "#fff",
                  cursor: "pointer",
                  padding: 0,
                  color: "#ef4444",
                }}
              >
                <Trash2 size={18} />
              </button>
              <span className="tooltip-bubble">削除</span>
            </span>
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
