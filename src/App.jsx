import { useState, useEffect } from "react";
import Home from "./pages/Home";
import AppMain from "./SangakuComponents/AppMain";
import "./App.css";
import { authUrl } from "./lib/apiBase";

export default function App() {
  const [selectedApp, setSelectedApp] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [logoutNoticeShown, setLogoutNoticeShown] = useState(false);

  // 🔁 永続化されたログイン状態を読み込み
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("isLoggedIn");
    if (stored === "true") {
      setIsLoggedIn(true);
    }
  }, []);

  // ★ OAuth成功後の判定
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("login") === "success") {
      setIsLoggedIn(true);
      window.localStorage.setItem("isLoggedIn", "true");

      // URLをきれいにする
      window.history.replaceState({}, "", "/");
    }
  }, []);

  const handleLogout = async () => {
    try {
      await fetch(authUrl("/auth/logout"), { method: "POST" });
    } catch (err) {
      console.error("Failed to logout:", err);
    } finally {
      setIsLoggedIn(false);
      setSelectedApp(null);
      window.localStorage.removeItem("isLoggedIn");
      window.localStorage.removeItem("sangaku.selectedFormId");
    }
  };

  // バックエンド再起動などで 401 が出たら、フロントを強制的に未ログインへ戻す
  useEffect(() => {
    if (typeof window === "undefined") return;

    const onUnauthorized = (ev) => {
      // 多重発火（複数APIが同時に401）でアラート連打しない
      const showNotice = !logoutNoticeShown;
      setLogoutNoticeShown(true);

      setIsLoggedIn(false);
      setSelectedApp(null);
      window.localStorage.removeItem("isLoggedIn");
      window.localStorage.removeItem("sangaku.selectedFormId");

      if (showNotice) {
        const msg =
          ev?.detail?.message ||
          "バックエンドが更新/再起動されたため、ログイン状態が切れました。ホーム画面から再ログインしてください。";
        window.alert(msg);
      }
    };

    window.addEventListener("gformgen:unauthorized", onUnauthorized);
    return () => {
      window.removeEventListener("gformgen:unauthorized", onUnauthorized);
    };
  }, [logoutNoticeShown]);

  // 🏠 ホーム画面
  if (!selectedApp) {
    return (
      <Home
        onSelectApp={setSelectedApp}
        isLoggedIn={isLoggedIn}
        onLogin={() => {
          const returnTo =
            typeof window !== "undefined" ? encodeURIComponent(window.location.origin) : "";
          window.location.href = authUrl(`/auth/google?returnTo=${returnTo}`);
        }}
        onLogout={handleLogout}
      />
    );
  }

  // 🧩 アプリ分岐
  if (selectedApp === "sangaku") {
    return <AppMain theme="sangaku" onGoHome={() => setSelectedApp(null)} />;
  }

  // その他会合用は廃止
  return (
    <Home
      onSelectApp={setSelectedApp}
      isLoggedIn={isLoggedIn}
      onLogin={() => {
        const returnTo =
          typeof window !== "undefined" ? encodeURIComponent(window.location.origin) : "";
        window.location.href = authUrl(`/auth/google?returnTo=${returnTo}`);
      }}
      onLogout={handleLogout}
    />
  );
}
