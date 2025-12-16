// src/components/StatsViewer.jsx
import DataTable from "./DataTable";
import AttendingList from "./AttendingList";
import { partiicipants } from "./participantsData";

export default function StatsViewer() {
  const meetingTitle = "2025年10月 定例会（会津地区経営者協会）";

  return (
    <div className="stats-viewer">
      <DataTable partiicipants={partiicipants} />
      <AttendingList
        partiicipants={partiicipants}
        meetingTitle={meetingTitle}
      />
    </div>
  );
}
