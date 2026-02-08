import { useState } from "react";

export default function DataTable({ participants }) {
  const [expanded, setExpanded] = useState(false);

  const formatSubmittedAt = (isoString) => {
    if (!isoString) return "—";
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return "—";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${y}/${m}/${day} ${hh}:${mm}`;
  };

  const isAttending = (p) => p?.attendance === "出席";
  const attending = participants.filter(isAttending);

  const totalAttendance = attending.reduce(
    (sum, p) => {
      const n = Number(p?.count);
      return sum + (Number.isFinite(n) ? n : 0);
    },
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
                  <td>{p.role || "ー"}</td>
                  <td>{p.name || ""}</td>
                  <td>{attendingLabel}</td>
                  <td>{Number.isFinite(Number(p?.count)) ? Number(p?.count) : 0}</td>
                  <td className="submitted-at-cell">
                    {formatSubmittedAt(p?.submittedAt)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan="3">合計</th>
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
