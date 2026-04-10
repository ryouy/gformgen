import { useEffect, useRef, useState } from "react";
import { Button, TextField } from "@mui/material";
import { QRCodeCanvas } from "qrcode.react";
import {
  buildQrCanvasStyle,
  buildQrDownloadFileName,
  downloadQrCanvasAsPng,
  QR_DARK_COLOR,
  QR_LIGHT_COLOR,
  QR_MARGIN_SIZE,
  QR_PNG_SIZE,
} from "../../../lib/qrCode";
import { copyTextToClipboard } from "../../../lib/clipboard";

export default function QrModal({ open, onClose, selectedFormId, formUrl, qrLevel }) {
  const qrCanvasRef = useRef(null);
  const [copyNotice, setCopyNotice] = useState("");

  useEffect(() => {
    setCopyNotice("");
  }, [formUrl, qrLevel]);

  if (!open || !selectedFormId || !formUrl) return null;

  const handleDownload = () => {
    downloadQrCanvasAsPng(
      qrCanvasRef.current,
      buildQrDownloadFileName(`${selectedFormId}-qr`)
    );
  };

  const handleCopy = async () => {
    try {
      await copyTextToClipboard(formUrl);
      setCopyNotice("短縮リンクをコピーしました");
    } catch (err) {
      console.error(err);
      setCopyNotice("コピーに失敗しました");
    }
  };

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
          borderRadius: 20,
          padding: "1.5rem",
          maxWidth: 440,
          width: "100%",
          textAlign: "center",
          boxShadow: "0 18px 48px rgba(15,23,42,0.18)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            padding: "0.75rem",
            borderRadius: 16,
            background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
            border: "1px solid rgba(148,163,184,0.18)",
          }}
        >
          <QRCodeCanvas
            ref={qrCanvasRef}
            value={formUrl}
            size={QR_PNG_SIZE}
            bgColor={QR_LIGHT_COLOR}
            fgColor={QR_DARK_COLOR}
            level={qrLevel}
            marginSize={QR_MARGIN_SIZE}
            style={buildQrCanvasStyle(280)}
          />
        </div>

       

        <div
          style={{
            marginTop: "1rem",
            padding: "0.9rem",
            borderRadius: 14,
            border: "1px solid rgba(148,163,184,0.18)",
            background: "rgba(248,250,252,0.8)",
            textAlign: "left",
          }}
        >
          <div
            style={{
              marginBottom: "0.65rem",
              color: "#334155",
              fontWeight: 800,
            }}
          >
            短縮リンク
          </div>
          <div
            style={{
              display: "flex",
              gap: "0.6rem",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <TextField
              value={formUrl}
              size="small"
              fullWidth
              InputProps={{ readOnly: true }}
              sx={{ flex: "1 1 230px" }}
            />
            <Button variant="outlined" onClick={handleCopy} sx={{ minWidth: 100 }}>
              コピー
            </Button>
          </div>
          {copyNotice ? (
            <p style={{ margin: "0.65rem 0 0", color: "#475569", fontWeight: 700 }}>
              {copyNotice}
            </p>
          ) : null}
        </div>

        <div
          style={{
            marginTop: "1rem",
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: "0.75rem",
            maxWidth: 360,
            marginInline: "auto",
          }}
        >
          <button
            type="button"
            className="expand-btn"
            onClick={handleDownload}
            style={{ margin: 0, minWidth: 0, width: "100%", paddingInline: "1rem" }}
          >
            PNGダウンロード
          </button>
          <button
            type="button"
            className="expand-btn"
            onClick={onClose}
            style={{ margin: 0, minWidth: 0, width: "100%", paddingInline: "1rem" }}
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}


