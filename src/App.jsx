import { useState, useEffect } from "react";
import Home from "./pages/Home";
import AppMain from "./SangakuComponents/AppMain";
import "./App.css";
import { authUrl } from "./lib/apiBase";

export default function App() {
  const [selectedApp, setSelectedApp] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [logoutNoticeShown, setLogoutNoticeShown] = useState(false);

  const syncLoginStateFromServer = async () => {
    try {
      const res = await fetch(authUrl("/auth/me"), { credentials: "include" });
      if (!res.ok) throw new Error("me_failed");
      const data = await res.json().catch(() => ({}));
      const loggedIn = Boolean(data?.loggedIn);
      setIsLoggedIn(loggedIn);

      if (typeof window !== "undefined") {
        if (loggedIn) window.localStorage.setItem("isLoggedIn", "true");
        else window.localStorage.removeItem("isLoggedIn");
      }
    } catch {
      // If backend is unreachable, treat as logged out on UI to avoid stale state.
      setIsLoggedIn(false);
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("isLoggedIn");
      }
    }
  };

  // 🔁 起動時にサーバ基準でログイン状態を同期
  useEffect(() => {
    void syncLoginStateFromServer();
  }, []);

  // ★ OAuth成功後の判定
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("login") === "success") {
      // サーバ側にセッションが作られている前提なので、サーバ基準で同期する
      void syncLoginStateFromServer();

      // URLをきれいにする
      window.history.replaceState({}, "", "/");
    }
  }, []);

  const handleLogout = async () => {
    try {
      await fetch(authUrl("/auth/logout"), { method: "POST", credentials: "include" });
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

      const wasLoggedIn =
        typeof window !== "undefined" && window.localStorage.getItem("isLoggedIn") === "true";

      setIsLoggedIn(false);
      setSelectedApp(null);
      window.localStorage.removeItem("isLoggedIn");
      window.localStorage.removeItem("sangaku.selectedFormId");

      if (showNotice) {
        const fallback = wasLoggedIn
          ? "ログイン状態が切れました。ホーム画面から再ログインしてください。"
          : "ログインが必要です。ホーム画面からログインしてください。";
        const msg = ev?.detail?.message || fallback;
        window.alert(msg);
      }
    };

    window.addEventListener("gformgen:unauthorized", onUnauthorized);
    return () => {
      window.removeEventListener("gformgen:unauthorized", onUnauthorized);
    };
  }, [logoutNoticeShown]);

  // タブ復帰時にサーバ基準で再同期（cookie切れ/関数再デプロイ等に追従）
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onFocus = () => {
      void syncLoginStateFromServer();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

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
