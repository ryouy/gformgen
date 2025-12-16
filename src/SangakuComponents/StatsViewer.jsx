// src/components/StatsViewer.jsx
import DataTable from "./DataTable";
import AttendingList from "./AttendingList";
import { participants } from "./participantsData";

export default function StatsViewer() {
  const meetingTitle = "2025年10月 定例会（会津地区経営者協会）";

  return (
    <div className="stats-viewer">
      {/* 全体集計テーブル */}
      <DataTable participants={participants} />

      {/* 出席者リスト + PDF出力 */}
      <AttendingList participants={participants} meetingTitle={meetingTitle} />
    </div>
  );
}
