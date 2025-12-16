import { useState } from "react";
import jsPDF from "jspdf";
import "jspdf-autotable";
import { Download } from "lucide-react";
import fontData from "../assets/fonts/NotoSansJP-Regular.base64.txt?raw";
import "../App.css";

export default function AttendingList({ partiicipants, meetingTitle }) {
  const [expanded, setExpanded] = useState(false);

  // 出席データ抽出
  const attendingList = partiicipants.filter((p) => p.status === "出席");
  const totalAttendance = attendingList.reduce((sum, p) => sum + p.count, 0);
  const attendanceCompanies = attendingList.length;

  const displayedList = expanded ? attendingList : attendingList.slice(0, 10);
  const hasMore = attendingList.length > 10 && !expanded;

  // ✅ PDF生成処理（常に縦向きで美しい出力）
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
      pdf.text("出席企業リスト", 14, 28);

      // 表データ構築
      const headers = [["No", "事業所名", "代表者名", "参加人数"]];
      const rows = attendingList.map((p, i) => [
        (i + 1).toString(),
        p.company,
        p.name,
        p.count.toString(),
      ]);

      // ✅ 表スタイルを完全中央寄せで整える
      pdf.autoTable({
        startY: 36,
        head: headers,
        body: rows,
        styles: {
          font: "NotoSansJP",
          fontSize: 11,
          halign: "center",
          valign: "middle",
          cellPadding: { top: 4, bottom: 4 },
          textColor: [30, 30, 30],
          lineColor: [220, 220, 220],
          lineWidth: 0.25,
        },
        headStyles: {
          fillColor: [243, 244, 246], //rgb(221, 221, 221)（薄グレー）
          textColor: [30, 30, 30],
          fontStyle: "bold",
          halign: "center",
          valign: "middle",
        },
        columnStyles: {
          0: { halign: "center", cellWidth: 15 },
          1: { halign: "center", cellWidth: 70 },
          2: { halign: "center", cellWidth: 60 },
          3: { halign: "center", cellWidth: 25 },
        },
        theme: "grid",
        margin: { left: 12, right: 12 },
        didParseCell: (data) => {
          data.cell.styles.halign = "center";
          data.cell.styles.valign = "middle";
        },
      });

      // ✅ 合計情報を中央配置で記載
      const y = pdf.lastAutoTable.finalY + 10;
      pdf.setFontSize(12);
      pdf.text(
        `出席事業所数：${attendanceCompanies} ｜ 合計出席人数：${totalAttendance}`,
        pdf.internal.pageSize.getWidth() / 2,
        y,
        { align: "center" }
      );

      // PDF保存
      pdf.save(`${meetingTitle || "出席企業リスト"}.pdf`);
    } catch (err) {
      console.error("PDF生成エラー:", err);
      alert(
        "PDF生成中にエラーが発生しました。詳細はコンソールをご確認ください。"
      );
    }
  };

  return (
    <div className="attending-list-table">
      {/* タイトル */}
      <div className="meeting-title-header">
        <h3>会合名：{meetingTitle || "未設定"}</h3>
      </div>

      {/* PDF出力ヘッダー */}
      <div className="pdf-header">
        <h3>出席企業リスト</h3>
        <button className="pdf-btn" onClick={handleGeneratePDF}>
          <Download size={16} /> PDFダウンロード
        </button>
      </div>

      {/* テーブル本体 */}
      <div className="table-scroll-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>No</th>
              <th>事業所名</th>
              <th>代表者名</th>
              <th>参加人数</th>
            </tr>
          </thead>
          <tbody>
            {displayedList.map((p, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>{p.company}</td>
                <td>{p.name}</td>
                <td>{p.count}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan="4" style={{ textAlign: "center" }}>
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

      {/* 展開ボタン */}
      {attendingList.length > 10 && (
        <button className="expand-btn" onClick={() => setExpanded(!expanded)}>
          {expanded ? "閉じる" : "もっと見る"}
        </button>
      )}
    </div>
  );
}
