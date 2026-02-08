import { useState } from "react";

export default function DataTable({ participants }) {
  const [expanded, setExpanded] = useState(false);

  const isAttending = (p) => p?.attendance === "出席";
  const attending = participants.filter(isAttending);

  const totalAttendance = attending.reduce(
    (sum, p) => sum + (Number(p?.count) || 1),
    0
  );

  const attendanceCompanies = new Set(
    attending.map((p) => (p?.company || "").trim()).filter(Boolean)
  ).size;

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
              const attendingLabel = isAttending(p) ? "出席" : "欠席";
              return (
                <tr
                  key={i}
                  className={attendingLabel === "欠席" ? "absent-row" : "present-row"}
                >
                  <td>{p.company || ""}</td>
                  <td>{p.role || "ー"}</td>
                  <td>{p.name || ""}</td>
                  <td>{attendingLabel}</td>
                  <td>{Number(p?.count) || 1}</td>
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
