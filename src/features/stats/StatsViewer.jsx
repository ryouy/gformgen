// src/components/StatsViewer.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DataTable from "./DataTable";
import fontData from "../../assets/fonts/NotoSansJP-Regular.base64.txt?raw";
import { apiUrl } from "../../lib/apiBase";
import { downloadResponsesCsv } from "./exporters/downloadResponsesCsv";
import { downloadAttendancePdf } from "./exporters/downloadAttendancePdf";
import StatsToolbar from "./components/StatsToolbar";
import RemarksModal from "./components/RemarksModal";
import QrModal from "./components/QrModal";
import {
  formatDateYMD,
  formatPeopleMultiline,
} from "./utils/formatters";
import { expandParticipantRows } from "./utils/expandParticipantRows";

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

  // 1回答に複数名が入っている場合、表示/CSV/PDFは「1名=1レコード」に展開する
  const expandedRows = useMemo(() => expandParticipantRows(rows), [rows]);

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
    downloadResponsesCsv({
      rows: expandedRows,
      selectedFormId,
      title: normalizeTitle(selectedForm?.title),
    });
  }, [expandedRows, selectedFormId, normalizeTitle, selectedForm]);

  const handleDownloadPdf = useCallback(() => {
    downloadAttendancePdf({ rows: expandedRows, meetingTitle, fontData });
  }, [expandedRows, meetingTitle]);

  const handleCloseForm = useCallback(async () => {
    if (!selectedFormId) return;
    if (
      !window.confirm("このフォームを締切済みにします。よろしいですか？")
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
      <StatsToolbar
        storageKey={SELECTED_FORM_ID_STORAGE_KEY}
        forms={forms}
        summaries={summaries}
        listMode={listMode}
        setListMode={setListMode}
        selectedFormId={selectedFormId}
        selectedForm={selectedForm}
        visibleForms={visibleForms}
        acceptingResponses={acceptingResponses}
        refreshing={refreshing}
        formUrl={formUrl}
        remarkRowsLength={remarkRows.length}
        setSelectedFormId={setSelectedFormId}
        setRows={setRows}
        setEmptyDelayDone={setEmptyDelayDone}
        setError={setError}
        setFormUrl={setFormUrl}
        setAcceptingResponses={setAcceptingResponses}
        setRemarksOpen={setRemarksOpen}
        setQrOpen={setQrOpen}
        fetchSummary={fetchSummary}
        fetchFormInfo={fetchFormInfo}
        fetchRows={fetchRows}
        normalizeTitle={normalizeTitle}
        truncate={truncate}
        handleDownloadCsv={handleDownloadCsv}
        handleDownloadPdf={handleDownloadPdf}
        handleCloseForm={handleCloseForm}
        handleTrashForm={handleTrashForm}
      />

      {formsError && (
        <p style={{ color: "red", textAlign: "center", marginBottom: "1rem" }}>
          {formsError}
        </p>
      )}

      {!selectedFormId ? null : loading && rows.length === 0 ? (
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
          <DataTable participants={expandedRows} />
        </>
      )}

      <RemarksModal
        open={remarksOpen}
        onClose={() => setRemarksOpen(false)}
        remarkRows={remarkRows}
        selectedFormId={selectedFormId}
      />

      <QrModal
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        selectedFormId={selectedFormId}
        formUrl={formUrl}
      />

    </div>
  );
}
