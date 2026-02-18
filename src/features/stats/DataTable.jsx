import { useState } from "react";
import {
  computeAttendanceSummary,
  formatSubmittedAt,
  isAttending,
  summarizePeopleForTable,
} from "./utils/tableUtils";

export default function DataTable({ participants }) {
  const [expanded, setExpanded] = useState(false);
  const { totalAttendance, attendanceCompanies } = computeAttendanceSummary(participants);

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
              <th>送信日時</th>
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
                  <td>{summarizePeopleForTable(p.role, { empty: "ー", suffix: "名" })}</td>
                  <td>{summarizePeopleForTable(p.name, { empty: "", suffix: "名" })}</td>
                  <td>{attendingLabel}</td>
                  <td className="submitted-at-cell">
                    {formatSubmittedAt(p?.submittedAt)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {hasMore && (
          <div className="table-fade-sign">⋯ さらに項目があります</div>
        )}
      </div>

      <div className="table-summary-bar" aria-label="集計サマリー">
        <div className="table-summary-item">
          <span className="table-summary-label">出席事業所数</span>
          <span className="table-summary-value">{attendanceCompanies}</span>
        </div>
        <div className="table-summary-divider" aria-hidden="true" />
        <div className="table-summary-item">
          <span className="table-summary-label">合計出席人数</span>
          <span className="table-summary-value">{totalAttendance}</span>
        </div>
      </div>

      {participants.length > 10 && (
        <button className="expand-btn" onClick={() => setExpanded(!expanded)}>
          {expanded ? "閉じる" : "もっと見る"}
        </button>
      )}
    </div>
  );
}
