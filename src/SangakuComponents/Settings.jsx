export default function SettingsPage() {
  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      <h2 style={{ marginTop: 0, color: "#f8fafc" }}>設定</h2>

      <h3 style={{ margin: "12px 0 8px", fontSize: 16, color: "#e2e8f0" }}>
        開発者情報
      </h3>

      <div style={{ lineHeight: 1.8, color: "#f1f5f9" }}>
        <div>
          <span style={{ color: "#cbd5e1", fontWeight: 800, marginRight: 8 }}>
            開発
          </span>
          松下 稜（会津大学 コンピュータ理工学部 CSS Lab）
        </div>
        <div>
          <span style={{ color: "#cbd5e1", fontWeight: 800, marginRight: 8 }}>
            メアド
          </span>
          <a
            href="mailto:s1300041@u-aizu.ac.jp"
            style={{
              color: "#93c5fd",
              textDecoration: "underline",
              textUnderlineOffset: 3,
            }}
          >
            s1300041@u-aizu.ac.jp
          </a>
        </div>
      </div>
    </div>
  );
}


