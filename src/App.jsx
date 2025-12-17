import { useState, useEffect } from "react";
import Home from "./pages/Home";
import AppMain from "./SangakuComponents/AppMain";
import AnalysisAppMain from "./OtherComponents/AppMain";
import "./App.css";

export default function App() {
  const [selectedApp, setSelectedApp] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

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
      await fetch("http://localhost:3000/auth/logout", { method: "POST" });
    } catch (err) {
      console.error("Failed to logout:", err);
    } finally {
      setIsLoggedIn(false);
      setSelectedApp(null);
      window.localStorage.removeItem("isLoggedIn");
    }
  };

  // 🏠 ホーム画面
  if (!selectedApp) {
    return (
      <Home
        onSelectApp={setSelectedApp}
        isLoggedIn={isLoggedIn}
        onLogin={() => {
          window.location.href = "http://localhost:3000/auth/google";
        }}
        onLogout={handleLogout}
      />
    );
  }

  // 🧩 アプリ分岐
  if (selectedApp === "sangaku") {
    return <AppMain theme="sangaku" onGoHome={() => setSelectedApp(null)} />;
  } else {
    return (
      <AnalysisAppMain
        theme={selectedApp}
        onGoHome={() => setSelectedApp(null)}
      />
    );
  }
}
