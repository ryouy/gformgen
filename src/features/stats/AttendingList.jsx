import { useState } from "react";
import jsPDF from "jspdf";
import "jspdf-autotable";
import { Download } from "lucide-react";
import fontData from "../../assets/fonts/NotoSansJP-Regular.base64.txt?raw";
import "../../App.css";

export default function AttendingList({ participants, meetingTitle }) {
  const [expanded, setExpanded] = useState(false);

  // 出席データ抽出
  const isAttending = (p) => p?.attendance === "出席";
  const attendingList = participants.filter(isAttending);
  const totalAttendance = attendingList.reduce(
    (sum, p) => sum + (Number(p?.count) || 1),
    0
  );
  const attendanceCompanies = new Set(
    attendingList.map((p) => (p?.company || "").trim()).filter(Boolean)
  ).size;

  const displayedList = expanded ? attendingList : attendingList.slice(0, 10);
  const hasMore = attendingList.length > 10 && !expanded;

  // ✅ PDF生成処理
  const handleGeneratePDF = () => {
    try {
      if (attendingList.length === 0) {
        alert("出席者データがありません。");
        return;
      }

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      // フォント設定（日本語対応）
      pdf.addFileToVFS("NotoSansJP-Regular.ttf", fontData);
      pdf.addFont("NotoSansJP-Regular.ttf", "NotoSansJP", "normal");
      pdf.setFont("NotoSansJP", "normal");

      // タイトル
      pdf.setFontSize(16);
      pdf.text(meetingTitle || "会合名未設定", 14, 18);
      pdf.setFontSize(14);
      pdf.text("出席者一覧", 14, 28);

      // 表データ構築
      const headers = [["No", "事業所名", "役職名", "氏名", "人数"]];
      const rows = attendingList.map((p, i) => [
        (i + 1).toString(),
        p.company || "",
        p.role || "ー",
        p.name || "",
        String(Number(p?.count) || 1),
      ]);

      // ✅ 表スタイル調整
      pdf.autoTable({
        startY: 36,
        head: headers,
        body: rows,
        styles: {
          font: "NotoSansJP",
          fontSize: 10.5,
          halign: "center",
          valign: "middle",
          cellPadding: { top: 4, bottom: 4 },
          textColor: [30, 30, 30],
          lineColor: [220, 220, 220],
          lineWidth: 0.25,
        },
        headStyles: {
          fillColor: [240, 242, 245],
          textColor: [30, 30, 30],
          fontStyle: "bold",
        },
        columnStyles: {
          0: { halign: "center", cellWidth: 10 },
          1: { halign: "center", cellWidth: 60 },
          2: { halign: "center", cellWidth: 25 },
          3: { halign: "center", cellWidth: 35 },
          4: { halign: "center", cellWidth: 15 },
        },
        theme: "grid",
        margin: { left: 12, right: 12 },
      });

      // ✅ 合計行
      const y = pdf.lastAutoTable.finalY + 10;
      pdf.setFontSize(11);
      pdf.text(
        `出席事業所数：${attendanceCompanies} ｜ 合計出席人数：${totalAttendance}`,
        pdf.internal.pageSize.getWidth() / 2,
        y,
        { align: "center" }
      );

      pdf.save(`${meetingTitle || "出席者一覧"}.pdf`);
    } catch (err) {
      console.error("PDF生成エラー:", err);
      alert(
        "PDF生成中にエラーが発生しました。詳細はコンソールをご確認ください。"
      );
    }
  };

  return (
    <div className="attending-list-table">
      <div className="meeting-title-header">
        <h3>会合名：{meetingTitle || "未設定"}</h3>
      </div>

      <div className="pdf-header">
        <h3>出席者一覧</h3>
        <button
          className="pdf-btn"
          onClick={handleGeneratePDF}
          disabled={attendingList.length === 0}
        >
          <Download size={16} /> PDFダウンロード
        </button>
      </div>

      <div className="table-scroll-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>No</th>
              <th>事業所名</th>
              <th>役職名</th>
              <th>氏名</th>
              <th>人数</th>
            </tr>
          </thead>
          <tbody>
            {displayedList.map((p, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>{p.company || ""}</td>
                <td>{p.role || "ー"}</td>
                <td>{p.name || ""}</td>
                <td>{Number(p?.count) || 1}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan="5" style={{ textAlign: "center" }}>
                出席事業所数：{attendanceCompanies}　｜　合計出席人数：
                {totalAttendance}
              </th>
            </tr>
          </tfoot>
        </table>
        {hasMore && (
          <div className="table-fade-sign">⋯ さらに項目があります</div>
        )}
      </div>

      {attendingList.length > 10 && (
        <button className="expand-btn" onClick={() => setExpanded(!expanded)}>
          {expanded ? "閉じる" : "もっと見る"}
        </button>
      )}
    </div>
  );
}
