// src/components/StatsViewer.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DataTable from "./DataTable";
import jsPDF from "jspdf";
import "jspdf-autotable";
import fontData from "../assets/fonts/NotoSansJP-Regular.base64.txt?raw";
import { Autocomplete, TextField } from "@mui/material";
import {
  Link as LinkIcon,
  QrCode,
  Download,
  Lock,
  Trash2,
  FileText,
  MessageSquareText,
} from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { apiUrl } from "../lib/apiBase";

const FORM_NAME_TAG_PREFIX = "[gformgen:sangaku]";
const FORM_CLOSED_TAG = "[gformgen:closed]";
const SELECTED_FORM_ID_STORAGE_KEY = "sangaku.selectedFormId";

function notifyUnauthorized(message) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("gformgen:unauthorized", {
      detail: { message },
    })
  );
}

function formatDateYMD(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

function formatDateTimeYMDHM(isoString) {
  if (!isoString) return "—";
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return "—";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}/${m}/${day} ${hh}:${mm}`;
}

function summarizePeople(v, { empty = "" } = {}) {
  const s = String(v ?? "").trim();
  if (!s) return empty;
  const parts = s
    .split("/")
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  if (parts.length <= 1) return parts[0] || empty;
  return `${parts[0]}（他${parts.length - 1}名）`;
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
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [remarksOpen, setRemarksOpen] = useState(false);
  const [formsError, setFormsError] = useState(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [emptyDelayDone, setEmptyDelayDone] = useState(false);

  const autoRefreshTimerRef = useRef(null);
  const lastAutoRefreshAtRef = useRef(0);
  const fetchInFlightRef = useRef(false);

  const fetchForms = useCallback(async () => {
    setFormsError(null);
    try {
      const res = await fetch(apiUrl("/forms/list"), { credentials: "include" });
      if (res.status === 401) {
        notifyUnauthorized();
        throw new Error("Not logged in");
      }
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
      const res = await fetch(apiUrl(`/forms/${encodeURIComponent(formId)}/summary`), {
        credentials: "include",
      });
      if (res.status === 401) {
        notifyUnauthorized();
        throw new Error("Not logged in");
      }
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
      const res = await fetch(apiUrl(`/forms/${encodeURIComponent(formId)}/info`), {
        credentials: "include",
      });
      if (res.status === 401) {
        notifyUnauthorized();
        throw new Error("Not logged in");
      }
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
    async (formId, options = {}) => {
      if (!formId) return;
      const silent = Boolean(options?.silent);

      if (!silent) {
        // 先に「空メッセージ」を引っ込めて、"読み込み中" に一本化
        setEmptyDelayDone(false);
        setLoading(true);
        setError(null);
      } else {
        setRefreshing(true);
      }
      try {
        const res = await fetch(apiUrl(`/forms/${encodeURIComponent(formId)}/responses`), {
          credentials: "include",
        });
        if (res.status === 401) {
          notifyUnauthorized();
          throw new Error("Not logged in");
        }
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
        // タブ復帰時の自動更新では、UIをガクッと変えない（表示は維持）
        if (!silent) {
          setRows([]);
          setError(e?.message || "Failed to fetch responses");
        }
      } finally {
        if (!silent) setLoading(false);
        setRefreshing(false);
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
      setEmptyDelayDone(false);
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

    const schedule = () => {
      if (document.hidden) return;
      if (fetchInFlightRef.current) return;
      const now = Date.now();
      // focus + visibilitychange の二重発火を抑える（最低1.5秒あける）
      if (now - lastAutoRefreshAtRef.current < 1500) return;

      if (autoRefreshTimerRef.current) {
        clearTimeout(autoRefreshTimerRef.current);
      }
      autoRefreshTimerRef.current = setTimeout(async () => {
        // さらに短い間隔の連打を抑える
        const t = Date.now();
        if (t - lastAutoRefreshAtRef.current < 1500) return;
        lastAutoRefreshAtRef.current = t;
        fetchInFlightRef.current = true;
        try {
          await fetchRows(selectedFormId, { silent: true });
        } finally {
          fetchInFlightRef.current = false;
        }
      }, 120);
    };

    window.addEventListener("focus", schedule);
    document.addEventListener("visibilitychange", schedule);
    return () => {
      window.removeEventListener("focus", schedule);
      document.removeEventListener("visibilitychange", schedule);
      if (autoRefreshTimerRef.current) clearTimeout(autoRefreshTimerRef.current);
    };
  }, [selectedFormId, fetchRows]);

  // 初回表示・フォーム切替直後は「回答はまだありません」を少し待ってから出す
  useEffect(() => {
    if (!selectedFormId) {
      setEmptyDelayDone(true);
      return;
    }
    setEmptyDelayDone(false);
    const t = window.setTimeout(() => setEmptyDelayDone(true), 800);
    return () => window.clearTimeout(t);
  }, [selectedFormId]);

  useEffect(() => {
    setRemarksOpen(false);
  }, [selectedFormId]);

  const remarkRows = useMemo(() => {
    return rows
      .filter((r) => String(r?.remarks ?? "").trim().length > 0)
      .slice()
      .sort((a, b) => {
        const ta = new Date(a?.submittedAt || 0).getTime();
        const tb = new Date(b?.submittedAt || 0).getTime();
        return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
      });
  }, [rows]);

  const normalizeTitle = useCallback(
    (t) =>
      String(t || "")
        .replace(FORM_NAME_TAG_PREFIX, "")
        .replace(FORM_CLOSED_TAG, "")
        .replace(/\s+/g, " ")
        .trim(),
    []
  );

  const truncate = useCallback((t, max = 14) => {
    const s = String(t || "");
    if (s.length <= max) return s;
    return `${s.slice(0, max)}…`;
  }, []);

  const openForms = forms.filter((f) => f.acceptingResponses !== false);
  const closedForms = forms.filter((f) => f.acceptingResponses === false);
  const visibleForms = listMode === "closed" ? closedForms : openForms;
  const selectedForm = forms.find((f) => f.formId === selectedFormId) || null;

  const handleDownloadCsv = useCallback(() => {
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
  }, [rows, selectedFormId]);

  const handleDownloadPdf = useCallback(() => {
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
      attending.map((p) => (p?.company || "").trim()).filter(Boolean)
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
  }, [rows, meetingTitle]);

  const handleCloseForm = useCallback(async () => {
    if (!selectedFormId) return;
    if (
      !window.confirm("このフォームを締切済みにします（アプリ上の締切扱い）。よろしいですか？")
    )
      return;
    try {
      const res = await fetch(
        apiUrl(`/forms/${encodeURIComponent(selectedFormId)}/close`),
        { method: "POST", credentials: "include" }
      );
      if (res.status === 401) {
        notifyUnauthorized();
        return;
      }
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
  }, [selectedFormId, fetchForms]);

  const handleTrashForm = useCallback(async () => {
    if (!selectedFormId) return;
    if (!window.confirm("このフォームを削除（Driveのゴミ箱へ移動）します。よろしいですか？"))
      return;
    try {
      const res = await fetch(
        apiUrl(`/forms/${encodeURIComponent(selectedFormId)}/trash`),
        { method: "POST", credentials: "include" }
      );
      if (res.status === 401) {
        notifyUnauthorized();
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data?.error || "Failed to trash form";
        const err = new Error(msg);
        err.status = res.status;
        throw err;
      }

      setSelectedFormId("");
      setRows([]);
      setFormUrl("");
      setAcceptingResponses(null);
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
  }, [selectedFormId, fetchForms]);

  return (
    <div className="stats-viewer">
      {/* 上部：既存フォーム選択 + 操作（リンク/QR/CSV/PDF/締切/削除） */}
      <div className="stats-toolbar">
        <div className="stats-toolbar-row stats-toolbar-row-top">
          <div className="stats-toolbar-left">
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

          <Autocomplete
            value={selectedForm}
            options={visibleForms}
            getOptionLabel={(opt) => normalizeTitle(opt?.title)}
            isOptionEqualToValue={(a, b) => a?.formId === b?.formId}
            onChange={(_, next) => {
              const id = next?.formId || "";
              if (next) setListMode(next.acceptingResponses === false ? "closed" : "open");
              setEmptyDelayDone(false);
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
              void fetchSummary(id);
              void fetchFormInfo(id);
              void fetchRows(id);
            }}
            renderOption={(props, option) => {
              const title = normalizeTitle(option?.title);
              const ymd = formatDateYMD(option?.createdTime);
              const s = summaries?.[option?.formId];
              return (
                <li {...props} key={option.formId} style={{ padding: "10px 12px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ fontWeight: 700, color: "#0f172a" }}>
                      {truncate(title, 18)}
                    </div>
                    <div style={{ fontSize: "0.82rem", fontWeight: 800, color: "#64748b" }}>
                      {`出席:${s ? s.attendeeCount : "…"}人 / 回答:${
                        s ? s.responseCount : "…"
                      }件`}
                      {ymd ? ` ・ ${ymd}` : ""}
                    </div>
                  </div>
                </li>
              );
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                placeholder="既存フォームを選択"
                size="small"
                sx={{
                  width: { xs: "92vw", sm: 420 },
                  minWidth: { xs: 220, sm: 320 },
                  "& .MuiOutlinedInput-root": {
                    borderRadius: "14px",
                    background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
                    boxShadow: "0 2px 10px rgba(15,23,42,0.06)",
                    fontWeight: 700,
                  },
                  "& .MuiOutlinedInput-notchedOutline": {
                    borderColor: "rgba(148, 163, 184, 0.6)",
                  },
                  "& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline": {
                    borderColor: "rgba(59,130,246,0.55)",
                  },
                  "& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline": {
                    borderColor: "rgba(59,130,246,0.8)",
                  },
                }}
              />
            )}
            slotProps={{
              paper: {
                sx: {
                  borderRadius: "16px",
                  border: "1px solid rgba(148,163,184,0.35)",
                  boxShadow: "0 18px 44px rgba(15,23,42,0.18)",
                  overflow: "hidden",
                },
              },
            }}
          />
          </div>

        {selectedFormId ? (
          <div className="stats-toolbar-right">
            {/* 状態 */}
            <span
              style={{
                fontSize: "0.85rem",
                fontWeight: 700,
                color: acceptingResponses === false ? "#64748b" : "#059669",
              }}
            >
              {acceptingResponses === false ? "締切済み" : "集計中"}
            </span>
            {refreshing && (
              <span style={{ fontSize: "0.78rem", color: "#64748b", fontWeight: 800 }}>
                更新中…
              </span>
            )}

            {/* フォームへのリンク */}
            <span className="tooltip-wrap">
              {formUrl ? (
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
              ) : (
                <button
                  type="button"
                  disabled
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
                    opacity: 0.55,
                    cursor: "not-allowed",
                    padding: 0,
                  }}
                >
                  <LinkIcon size={18} />
                </button>
              )}
              <span className="tooltip-bubble">
                {formUrl ? "フォームを開く" : "リンク準備中…"}
              </span>
            </span>

            {/* QRコード表示ボタン */}
            <span className="tooltip-wrap">
              <button
                type="button"
                disabled={!formUrl}
                onClick={() => {
                  if (!formUrl) return;
                  setQrOpen(true);
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
                  color: "#3b82f6",
                  cursor: "pointer",
                  padding: 0,
                  opacity: formUrl ? 1 : 0.55,
                }}
              >
                <QrCode size={18} />
              </button>
              <span className="tooltip-bubble">
                {formUrl ? "QRを表示" : "QR準備中…"}
              </span>
            </span>
          </div>
        ) : null}
        </div>

        {selectedFormId ? (
          <div className="stats-toolbar-row stats-toolbar-row-bottom">
            <div className="stats-toolbar-bottom-spacer" />
            <div className="stats-action-groups" aria-label="フォーム操作">
              <div className="stats-action-group" aria-label="出力">
                <button
                  type="button"
                  className="stats-action-chip"
                  onClick={handleDownloadCsv}
                >
                  <Download size={16} />
                  <span className="stats-action-chip-label">CSV</span>
                </button>
                <button
                  type="button"
                  className="stats-action-chip"
                  onClick={handleDownloadPdf}
                >
                  <FileText size={16} />
                  <span className="stats-action-chip-label">PDF</span>
                </button>
                {remarkRows.length > 0 && (
                  <button
                    type="button"
                    className="stats-action-chip"
                    onClick={() => setRemarksOpen(true)}
                    title="備考を見る"
                    aria-label="備考を見る"
                  >
                    <MessageSquareText size={16} />
                    <span className="stats-action-chip-label">備考</span>
                  </button>
                )}
              </div>

              <div className="stats-action-divider" aria-hidden="true" />

              <div className="stats-action-group" aria-label="管理">
                <button
                  type="button"
                  className="stats-action-chip"
                  disabled={acceptingResponses === false}
                  onClick={handleCloseForm}
                  style={{ opacity: acceptingResponses === false ? 0.55 : 1 }}
                >
                  <Lock size={16} />
                  <span className="stats-action-chip-label">締切</span>
                </button>
                <button
                  type="button"
                  className="stats-action-chip is-danger"
                  onClick={handleTrashForm}
                >
                  <Trash2 size={16} />
                  <span className="stats-action-chip-label">削除</span>
                </button>
              </div>
            </div>
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
      ) : loading && rows.length === 0 ? (
        <p style={{ textAlign: "center", marginTop: "1rem" }}>読み込み中…</p>
      ) : rows.length === 0 && !emptyDelayDone && !error ? (
        <p style={{ textAlign: "center", marginTop: "1rem" }}>読み込み中…</p>
      ) : error ? (
        <p style={{ color: "red", textAlign: "center", marginTop: "1rem" }}>
          {error}
        </p>
      ) : (
        <>
          {rows.length === 0 && emptyDelayDone && (
            <div style={{ textAlign: "center", marginTop: "1rem" }}>
              <p>回答はまだありません</p>
            </div>
          )}

          {/* 全体集計テーブル（常に表示） */}
          <DataTable participants={rows} />
        </>
      )}

      {/* 備考モーダル（備考がある時だけ開ける） */}
      {remarksOpen && selectedFormId && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setRemarksOpen(false)}
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
              maxWidth: 760,
              width: "100%",
              maxHeight: "80vh",
              overflow: "auto",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                marginBottom: 10,
              }}
            >
              <div style={{ fontWeight: 1000, fontSize: "1rem", color: "#0f172a" }}>
                備考一覧（{remarkRows.length}）
              </div>
              <button type="button" className="expand-btn" onClick={() => setRemarksOpen(false)}>
                閉じる
              </button>
            </div>

            {remarkRows.length === 0 ? (
              <div style={{ textAlign: "center", padding: "14px 0", fontWeight: 900 }}>
                備考はまだありません
              </div>
            ) : (
              <div className="remarks-list" role="region" aria-label="備考一覧">
                {remarkRows.map((r, idx) => (
                  <div key={`${r?.submittedAt || ""}-${idx}`} className="remarks-item">
                    <div className="remarks-meta">
                      <div className="remarks-left">
                        <div className="remarks-company">{r?.company || "—"}</div>
                        <div className="remarks-sub">
                          {summarizePeople(r?.name, { empty: "—" })}
                          {r?.attendance ? ` / ${r.attendance}` : ""}
                          {Number.isFinite(Number(r?.count))
                            ? ` / ${Number(r.count)}人`
                            : ""}
                        </div>
                      </div>
                      <div className="remarks-time">{formatDateTimeYMDHM(r?.submittedAt)}</div>
                    </div>
                    <div className="remarks-text">{String(r?.remarks || "").trim()}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
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
