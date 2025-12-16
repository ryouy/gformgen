import { useState } from "react";
import Home from "./pages/Home";
import AppMain from "./SangakuComponents/AppMain";
import AnalysisAppMain from "./OtherComponents/AppMain"; // 👈 新しいアプリ用ページ
import "./App.css";

export default function App() {
  const [selectedApp, setSelectedApp] = useState(null);

  // 🏠 ホーム画面（ツール選択）
  if (!selectedApp) {
    return <Home onSelectApp={setSelectedApp} />;
  }

  // 🧩 選択されたアプリごとに分岐
  if (selectedApp === "sangaku") {
    return <AppMain theme="sangaku" />;
  } else {
    return <AnalysisAppMain theme={selectedApp} />;
  }
}
