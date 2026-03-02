import { MenuItem, TextField } from "@mui/material";
import {
  Download,
  Eye,
  Lock,
  MessageSquareText,
  Pencil,
  QrCode,
  Trash2,
} from "lucide-react";

export default function StatsToolbar({
  storageKey,
  forms,
  selectedFormId,
  visibleForms,
  acceptingResponses,
  formUrl,
  editUrl,
  remarkRowsLength,
  setSelectedFormId,
  rememberRecentFormId,
  setRows,
  setPostCloseSubmissionCount,
  setEmptyDelayDone,
  setError,
  setFormUrl,
  setEditUrl,
  setAcceptingResponses,
  setRemarksOpen,
  setQrOpen,
  fetchSummary,
  fetchFormInfo,
  fetchRows,
  normalizeTitle,
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
          <TextField
            select
            disabled={visibleForms.length === 0}
            value={selectedFormId}
            onChange={(e) => {
              const id = String(e?.target?.value || "");
              setEmptyDelayDone(false);
              setPostCloseSubmissionCount(0);
              setSelectedFormId(id);
              if (id) rememberRecentFormId?.(id);
              setError(null);
              setFormUrl("");
              setEditUrl("");
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
            size="small"
            SelectProps={{
              displayEmpty: true,
              renderValue: (value) => {
                if (visibleForms.length === 0) {
                  return (
                    <span style={{ color: "rgba(100,116,139,0.95)", fontWeight: 600 }}>
                      フォームがまだありません
                    </span>
                  );
                }
                if (!value) {
                  return (
                    <span style={{ color: "rgba(100,116,139,0.95)", fontWeight: 600 }}>
                      フォームを選択してください
                    </span>
                  );
                }
                const selected = visibleForms.find((f) => f.formId === value);
                const isClosed = selected?.acceptingResponses === false;
                const statusText = isClosed ? "〆切済み" : "集計中";
                return (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      minWidth: 0,
                    }}
                  >
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        borderRadius: 9999,
                        padding: "2px 8px",
                        fontSize: "0.72rem",
                        fontWeight: 900,
                        whiteSpace: "nowrap",
                        color: isClosed
                          ? "color-mix(in srgb, var(--app-text) 70%, transparent)"
                          : "var(--accent2)",
                        background: isClosed
                          ? "rgba(148,163,184,0.16)"
                          : "rgba(var(--accent-rgb),0.14)",
                        border: isClosed
                          ? "1px solid rgba(148,163,184,0.36)"
                          : "1px solid rgba(var(--accent-rgb),0.28)",
                      }}
                    >
                      {statusText}
                    </span>
                    <span
                      style={{
                        minWidth: 0,
                        fontWeight: 700,
                        color: "var(--app-text)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        display: "inline-block",
                        maxWidth: "100%",
                      }}
                    >
                      {normalizeTitle(selected?.title || "")}
                    </span>
                  </span>
                );
              },
            }}
            sx={{
              width: { xs: "100%", sm: 630 },
              minWidth: { xs: 0, sm: 480 },
              maxWidth: "100%",
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
          >
            {visibleForms.map((option) => {
              const statusText = option?.acceptingResponses === false ? "〆切済み" : "集計中";
              const title = normalizeTitle(option?.title);
              const isClosed = option?.acceptingResponses === false;
              return (
                <MenuItem key={option.formId} value={option.formId}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      minWidth: 0,
                    }}
                  >
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        borderRadius: 9999,
                        padding: "2px 8px",
                        fontSize: "0.72rem",
                        fontWeight: 900,
                        whiteSpace: "nowrap",
                        color: isClosed
                          ? "color-mix(in srgb, var(--app-text) 70%, transparent)"
                          : "var(--accent2)",
                        background: isClosed
                          ? "rgba(148,163,184,0.16)"
                          : "rgba(var(--accent-rgb),0.14)",
                        border: isClosed
                          ? "1px solid rgba(148,163,184,0.36)"
                          : "1px solid rgba(var(--accent-rgb),0.28)",
                      }}
                    >
                      {statusText}
                    </span>
                    <span
                      style={{
                        fontWeight: 700,
                        color: "var(--app-text)",
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        display: "inline-block",
                        maxWidth: "100%",
                      }}
                    >
                      {title}
                    </span>
                  </span>
                </MenuItem>
              );
            })}
          </TextField>
        </div>

        {selectedFormId ? (
          <div className="stats-toolbar-right">
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
                  <Eye size={18} />
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
                  <Eye size={18} />
                </button>
              )}
              <span className="tooltip-bubble">{formUrl ? "フォームを確認" : "リンク準備中…"}</span>
            </span>

            <span className="tooltip-wrap">
              {editUrl ? (
                <a
                  href={editUrl}
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
                  <Pencil size={18} />
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
                  <Pencil size={18} />
                </button>
              )}
              <span className="tooltip-bubble">{editUrl ? "フォームを編集" : "編集準備中…"}</span>
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
              <span className="tooltip-bubble">{formUrl ? "二次元バーコードを表示" : "QR準備中…"}</span>
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
                <Download size={16} />
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
                <span className="stats-action-chip-label">〆切</span>
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


