import { useState, useEffect } from "react";
import Home from "./pages/Home";
import AppMain from "./SangakuComponents/AppMain";
import AnalysisAppMain from "./OtherComponents/AppMain";
import "./App.css";

export default function App() {
  const [selectedApp, setSelectedApp] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // ★ OAuth成功後の判定
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("login") === "success") {
      setIsLoggedIn(true);

      // URLをきれいにする
      window.history.replaceState({}, "", "/");
    }
  }, []);

  // 🏠 ホーム画面
  if (!selectedApp) {
    return (
      <Home
        onSelectApp={setSelectedApp}
        isLoggedIn={isLoggedIn}
        onLogin={() => {
          window.location.href = "http://localhost:3000/auth/google";
        }}
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
