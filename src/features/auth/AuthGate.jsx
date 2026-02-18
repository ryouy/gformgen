import { motion } from "framer-motion";
import { Lock, LogIn } from "lucide-react";

export default function AuthGate({ onLogin, onGoSettings }) {
  return (
    <div className="auth-gate" role="region" aria-label="ログインが必要です">
      <motion.div
        className="auth-gate-card"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
      >
        <div className="auth-gate-icon" aria-hidden="true">
          <Lock size={22} />
        </div>
        <h2 className="auth-gate-title">ログインが必要です</h2>

        <div className="auth-gate-actions">
          <button
            type="button"
            className="auth-gate-btn auth-gate-btn-primary"
            onClick={() => onLogin?.()}
          >
            <LogIn size={18} />
            ログインする
          </button>
          {onGoSettings && (
            <button
              type="button"
              className="auth-gate-btn auth-gate-btn-secondary"
              onClick={() => onGoSettings?.()}
            >
              設定を見る
            </button>
          )}
        </div>

        
      </motion.div>
    </div>
  );
}


