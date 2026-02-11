import { Autocomplete, TextField } from "@mui/material";
import {
  Download,
  FileText,
  Link as LinkIcon,
  Lock,
  MessageSquareText,
  QrCode,
  Trash2,
} from "lucide-react";

import { formatDateYMD } from "../utils/formatters";

export default function StatsToolbar({
  storageKey,
  // state
  forms,
  summaries,
  listMode,
  setListMode,
  selectedFormId,
  selectedForm,
  visibleForms,
  acceptingResponses,
  refreshing,
  formUrl,
  remarkRowsLength,
  // actions
  setSelectedFormId,
  setRows,
  setEmptyDelayDone,
  setError,
  setFormUrl,
  setAcceptingResponses,
  setRemarksOpen,
  setQrOpen,
  fetchSummary,
  fetchFormInfo,
  fetchRows,
  // helpers
  normalizeTitle,
  truncate,
  // exports/admin
  handleDownloadCsv,
  handleDownloadPdf,
  handleCloseForm,
  handleTrashForm,
}) {
  return (
    <div className="stats-toolbar">
      <div className="stats-toolbar-row stats-toolbar-row-top">
        <div className="stats-toolbar-top-spacer" aria-hidden="true" />

        <div className="stats-toolbar-center" aria-label="フォーム選択">
          <div className="mini-tabs" role="tablist" aria-label="フォーム一覧切替">
            <button
              type="button"
              className={`mini-tab ${listMode === "open" ? "active" : ""}`}
              onClick={() => {
                setListMode("open");
                if (
                  selectedFormId &&
                  forms.some(
                    (f) => f.formId === selectedFormId && f.acceptingResponses === false
                  )
                ) {
                  setSelectedFormId("");
                  setRows([]);
                  setFormUrl("");
                  setAcceptingResponses(null);
                  setError(null);
                  setEmptyDelayDone(false);
                  window.localStorage.removeItem(storageKey);
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
                  forms.some(
                    (f) => f.formId === selectedFormId && f.acceptingResponses !== false
                  )
                ) {
                  setSelectedFormId("");
                  setRows([]);
                  setFormUrl("");
                  setAcceptingResponses(null);
                  setError(null);
                  setEmptyDelayDone(false);
                  window.localStorage.removeItem(storageKey);
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
                window.localStorage.removeItem(storageKey);
                return;
              }
              window.localStorage.setItem(storageKey, id);
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
                    <div style={{ fontWeight: 700, color: "var(--app-text)" }}>
                      {truncate(title, 18)}
                    </div>
                    <div
                      style={{
                        fontSize: "0.82rem",
                        fontWeight: 800,
                        color: "color-mix(in srgb, var(--app-text) 55%, transparent)",
                      }}
                    >
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
                    background: "var(--panel-bg)",
                    boxShadow: "0 2px 10px rgba(15,23,42,0.06)",
                    fontWeight: 700,
                  },
                  "& .MuiOutlinedInput-notchedOutline": {
                    borderColor: "rgba(148, 163, 184, 0.6)",
                  },
                  "& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline": {
                    borderColor: "rgba(var(--accent-rgb),0.55)",
                  },
                  "& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline": {
                    borderColor: "rgba(var(--accent-rgb),0.8)",
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
            <span
              style={{
                fontSize: "0.85rem",
                fontWeight: 700,
                color:
                  acceptingResponses === false
                    ? "color-mix(in srgb, var(--app-text) 55%, transparent)"
                    : "var(--accent2)",
              }}
            >
              {acceptingResponses === false ? "締切済み" : "集計中"}
            </span>
            {refreshing && (
              <span
                style={{
                  fontSize: "0.78rem",
                  color: "color-mix(in srgb, var(--app-text) 55%, transparent)",
                  fontWeight: 800,
                }}
              >
                更新中…
              </span>
            )}

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
              <span className="tooltip-bubble">{formUrl ? "フォームを開く" : "リンク準備中…"}</span>
            </span>

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
                  color: "var(--accent)",
                  cursor: "pointer",
                  padding: 0,
                  opacity: formUrl ? 1 : 0.55,
                }}
              >
                <QrCode size={18} />
              </button>
              <span className="tooltip-bubble">{formUrl ? "QRを表示" : "QR準備中…"}</span>
            </span>
          </div>
        ) : (
          <div className="stats-toolbar-top-spacer" aria-hidden="true" />
        )}
      </div>

      {selectedFormId ? (
        <div className="stats-toolbar-row stats-toolbar-row-bottom">
          <div className="stats-toolbar-bottom-spacer" />
          <div className="stats-action-groups" aria-label="フォーム操作">
            <div className="stats-action-group" aria-label="出力">
              <button type="button" className="stats-action-chip" onClick={handleDownloadCsv}>
                <Download size={16} />
                <span className="stats-action-chip-label">CSV</span>
              </button>
              <button type="button" className="stats-action-chip" onClick={handleDownloadPdf}>
                <FileText size={16} />
                <span className="stats-action-chip-label">PDF</span>
              </button>
              {remarkRowsLength > 0 && (
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
  );
}


