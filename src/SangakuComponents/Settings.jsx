export default function SettingsPage() {
  return (
    <div style={{ maxWidth: 980, margin: "0 auto" }}>
      <h2 style={{ marginTop: 0, color: "#0f172a" }}>設定</h2>

      <section style={{ lineHeight: 1.8, color: "#0f172a" }}>
        <h3 style={{ margin: "18px 0 10px", color: "#0f172a" }}>開発者情報</h3>
        <div>
          <span style={{ color: "#111827", fontWeight: 900, marginRight: 8 }}>開発</span>
          松下 稜（会津大学 コンピュータ理工学部 CSS Lab）
        </div>
        <div>
          <span style={{ color: "#111827", fontWeight: 900, marginRight: 8 }}>Email</span>
          <a
            href="mailto:s1300041@u-aizu.ac.jp"
            style={{
              color: "#1d4ed8",
              textDecoration: "underline",
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


