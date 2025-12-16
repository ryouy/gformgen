import { motion } from "framer-motion";
import qrImage from "../assets/qr.png";

export default function QrSection() {
  return (
    <motion.div
      className="qr-section"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      <div className="qr-inner">
        <img src={qrImage} alt="QRコード" />
        <p>
          <a
            href="https://forms.gle/HPK3QR4DMDcm6AQg6"
            target="_blank"
            rel="noopener noreferrer"
          >
            フォーム確認はこちら
          </a>
        </p>
      </div>
    </motion.div>
  );
}
