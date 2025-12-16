import { useState } from "react";

export default function DataTable({ partiicipants, meetingTitle }) {
  const [expanded, setExpanded] = useState(false);

  const totalAttendance = partiicipants
    .filter((p) => p.status === "出席")
    .reduce((sum, p) => sum + p.count, 0);

  const attendanceCompanies = partiicipants.filter(
    (p) => p.status === "出席"
  ).length;

  const displayedList = expanded ? partiicipants : partiicipants.slice(0, 10);
  const hasMore = partiicipants.length > 10 && !expanded;

  return (
    <div className="data-table-wrapper">
      {/* ✅ 会合名（上に追加） */}

      <h3>全体集計結果</h3>

      <div className="table-scroll-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>事業所名</th>
              <th>代表者名</th>
              <th>出席/欠席</th>
              <th>参加人数</th>
            </tr>
          </thead>
          <tbody>
            {displayedList.map((p, i) => (
              <tr
                key={i}
                className={p.status === "欠席" ? "absent-row" : "present-row"}
              >
                <td>{p.company}</td>
                <td>{p.name}</td>
                <td>{p.status}</td>
                <td>{p.status === "出席" ? p.count : 0}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan="2">合計</th>
              <th>出席事業所数：{attendanceCompanies}</th>
              <th>出席人数{totalAttendance}</th>
            </tr>
          </tfoot>
        </table>

        {/* ▼ フェードサイン */}
        {hasMore && (
          <div className="table-fade-sign">⋯ さらに項目があります</div>
        )}
      </div>

      {partiicipants.length > 10 && (
        <button className="expand-btn" onClick={() => setExpanded(!expanded)}>
          {expanded ? "閉じる" : "もっと見る"}
        </button>
      )}
    </div>
  );
}
