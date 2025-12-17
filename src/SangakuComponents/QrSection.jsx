// src/SangakuComponents/QrSection.jsx
import { motion } from "framer-motion";
import { QRCodeCanvas } from "qrcode.react";

export default function QrSection({ formUrl }) {
  if (!formUrl) return null;

  return (
    <motion.div
      className="qr-section"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div style={{ textAlign: "center" }}>
        <QRCodeCanvas value={formUrl} size={180} />
        <p style={{ marginTop: "1rem" }}>
          <a href={formUrl} target="_blank" rel="noopener noreferrer">
            フォームを確認
          </a>
        </p>
      </div>
    </motion.div>
  );
}
