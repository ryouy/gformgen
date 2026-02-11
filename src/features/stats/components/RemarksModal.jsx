import { formatDateTimeYMDHM, summarizePeople } from "../utils/formatters";

export default function RemarksModal({ open, onClose, remarkRows, selectedFormId }) {
  if (!open || !selectedFormId) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
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
          <button type="button" className="expand-btn" onClick={onClose}>
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
                      {Number.isFinite(Number(r?.count)) ? ` / ${Number(r.count)}人` : ""}
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
  );
}


