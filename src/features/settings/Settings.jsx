export default function SettingsPage() {
  return (
    <div style={{ maxWidth: 980, margin: "0 auto" }}>
      <h2 style={{ marginTop: 0, color: "#0f172a" }}>設定</h2>

      <section style={{ lineHeight: 1.8, color: "#0f172a" }}>
        
        <div>
          <span style={{ color: "#111827", fontWeight: 900, marginRight: 8 }}>開発</span>
          松下 稜（会津大学 計算社会学研究室）
        </div>
        <div>
          <span style={{ color: "#111827", fontWeight: 900, marginRight: 8 }}>Email</span>
          <a
            href="mailto:s1300041@u-aizu.ac.jp"
            style={{
              color: "#1d4ed8",
              textUnderlineOffset: 3,
            }}
          >
            s1300041@u-aizu.ac.jp
          </a>
        </div>
        <div>
          <span style={{ color: "#111827", fontWeight: 900, marginRight: 8 }}>技術</span>
          <a
            href="https://github.com/ryouy/gformgen"
            style={{
              color: "#1d4ed8",
              textUnderlineOffset: 3,
            }}
          >
            github.com
          </a>
        </div>
      </section>
    </div>
  );
}


