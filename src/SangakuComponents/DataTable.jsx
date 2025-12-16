import { useState } from "react";

export default function DataTable({ participants }) {
  const [expanded, setExpanded] = useState(false);

  const totalAttendance = participants
    .filter((p) => p.status === "出席")
    .reduce((sum, p) => sum + p.count, 0);

  const attendanceCompanies = participants.filter(
    (p) => p.status === "出席"
  ).length;

  const displayedList = expanded ? participants : participants.slice(0, 10);
  const hasMore = participants.length > 10 && !expanded;

  return (
    <div className="data-table-wrapper">
      <h3>全体集計結果</h3>
      <div className="table-scroll-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>事業所名</th>
              <th>役職名</th>
              <th>氏名</th>
              <th>出席/欠席</th>
              <th>人数</th>
            </tr>
          </thead>
          <tbody>
            {displayedList.map((p, i) => {
              const match = p.name.match(/(教授|准教授|講師)/);
              const title = match ? match[0] : "ー";
              const cleanName = p.name.replace(/(教授|准教授|講師)/, "").trim();

              return (
                <tr
                  key={i}
                  className={p.status === "欠席" ? "absent-row" : "present-row"}
                >
                  <td>{p.company}</td>
                  <td>{title}</td>
                  <td>{cleanName}</td>
                  <td>{p.status}</td>
                  <td>{p.count}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan="2">合計</th>
              <th>出席事業所数：{attendanceCompanies}</th>
              <th colSpan="2">出席人数：{totalAttendance}</th>
            </tr>
          </tfoot>
        </table>

        {hasMore && (
          <div className="table-fade-sign">⋯ さらに項目があります</div>
        )}
      </div>

      {participants.length > 10 && (
        <button className="expand-btn" onClick={() => setExpanded(!expanded)}>
          {expanded ? "閉じる" : "もっと見る"}
        </button>
      )}
    </div>
  );
}
