import { useLayoutEffect, useRef } from "react";
import Chart from "chart.js/auto";

export default function GraphView({ participants, partiicipants }) {
  const list = Array.isArray(participants)
    ? participants
    : Array.isArray(partiicipants)
      ? partiicipants
      : [];
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  const getStatus = (p) => p?.attendance || p?.status || "";
  const totalAttendance = list.filter((p) => getStatus(p) === "出席").length;
  const totalAbsence = list.filter((p) => getStatus(p) === "欠席").length;
  const attendanceCompanies = list.filter((p) => getStatus(p) === "出席").length;

  useLayoutEffect(() => {
    const ctx = canvasRef.current;
    if (!ctx) return;

    // 既にチャートが存在していれば破棄
    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    // Chart.js が内部で同じ canvas を使っていないかチェック
    const existingChart = Chart.getChart(ctx);
    if (existingChart) {
      existingChart.destroy();
    }

    // 新しいチャートを作成
    chartRef.current = new Chart(ctx, {
      type: "bar",
      data: {
        labels: ["出席", "欠席"],
        datasets: [
          {
            label: "件数",
            data: [totalAttendance, totalAbsence],
            backgroundColor: ["#4f46e5", "#f87171"],
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, precision: 0 } },
      },
    });

    // コンポーネントがアンマウントされたときに破棄
    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [list]);

  return (
    <>
      <div className="chart-wrapper" style={{ height: "400px" }}>
        <canvas ref={canvasRef}></canvas>
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th>事業所名</th>
            <th>代表者名</th>
            <th>出席/欠席</th>
          </tr>
        </thead>
        <tbody>
          {list.map((p, i) => (
            <tr
              key={i}
              className={getStatus(p) === "欠席" ? "absent-row" : "present-row"}
            >
              <td>{p.company}</td>
              <td>{p.name}</td>
              <td>{getStatus(p)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th colSpan="2">合計</th>
            <th>出席事業所数：{attendanceCompanies}</th>
            <th>{totalAttendance}</th>
          </tr>
        </tfoot>
      </table>
    </>
  );
}
