import { useLayoutEffect, useRef } from "react";
import Chart from "chart.js/auto";

export default function GraphView({ partiicipants }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  const totalAttendance = partiicipants
    .filter((p) => p.status === "出席")
    .reduce((sum, p) => sum + p.count, 0);
  const totalAbsence = partiicipants
    .filter((p) => p.status === "欠席")
    .reduce((sum, p) => sum + p.count, 0);
  const attendanceCompanies = partiicipants.filter(
    (p) => p.status === "出席"
  ).length;

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
            label: "人数",
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
  }, [partiicipants]);

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
            <th>参加人数</th>
          </tr>
        </thead>
        <tbody>
          {partiicipants.map((p, i) => (
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
            <th>{totalAttendance}</th>
          </tr>
        </tfoot>
      </table>
    </>
  );
}
