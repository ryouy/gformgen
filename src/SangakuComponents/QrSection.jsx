import { motion } from "framer-motion";
import QRCode from "react-qr-code";

export default function QrSection({ formUrl }) {
  if (!formUrl) return null;

  return (
    <motion.div
      className="qr-section"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      <div className="qr-inner">
        {/* QRコード */}
        <div
          style={{
            background: "white",
            padding: "16px",
            borderRadius: "12px",
          }}
        >
          <QRCode value={formUrl} size={180} />
        </div>

        {/* リンク */}
        <p style={{ marginTop: "1rem" }}>
          <a href={formUrl} target="_blank" rel="noopener noreferrer">
            フォーム確認はこちら
          </a>
        </p>
      </div>
    </motion.div>
  );
}
