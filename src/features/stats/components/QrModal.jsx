import { QRCodeCanvas } from "qrcode.react";

export default function QrModal({ open, onClose, selectedFormId, formUrl }) {
  if (!open || !selectedFormId || !formUrl) return null;

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
          <button type="button" className="expand-btn" onClick={onClose}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}


