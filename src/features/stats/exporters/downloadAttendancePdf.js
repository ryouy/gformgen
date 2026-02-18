import jsPDF from "jspdf";
import "jspdf-autotable";
import { formatPeopleMultiline } from "../utils/formatters";
import { expandParticipantRows } from "../utils/expandParticipantRows";

export function downloadAttendancePdf({ rows, meetingTitle, fontData }) {
  const expanded = expandParticipantRows(rows);
  const attending = (expanded || []).filter((r) => r?.attendance === "出席");
  if (attending.length === 0) {
    alert("出席者データがありません。");
    return;
  }

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  pdf.addFileToVFS("NotoSansJP-Regular.ttf", fontData);
  pdf.addFont("NotoSansJP-Regular.ttf", "NotoSansJP", "normal");
  pdf.setFont("NotoSansJP", "normal");

  pdf.setFontSize(16);
  pdf.text(meetingTitle || "会合名未設定", 14, 18);
  pdf.setFontSize(14);
  pdf.text("出席者一覧", 14, 28);

  const headers = [["No", "事業所名", "役職名", "氏名"]];
  const body = attending.map((p, i) => [
    String(i + 1),
    p.company || "",
    formatPeopleMultiline(p.role, { empty: "ー" }),
    formatPeopleMultiline(p.name, { empty: "" }),
  ]);

  pdf.autoTable({
    startY: 36,
    head: headers,
    body,
    styles: {
      font: "NotoSansJP",
      fontSize: 10.5,
      halign: "center",
      valign: "middle",
      cellPadding: { top: 4, bottom: 4 },
      textColor: [30, 30, 30],
      lineColor: [220, 220, 220],
      lineWidth: 0.25,
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [240, 242, 245],
      textColor: [30, 30, 30],
      fontStyle: "bold",
    },
    columnStyles: {
      0: { halign: "center", cellWidth: 10 },
      1: { halign: "center", cellWidth: 60 },
      2: { halign: "left", cellWidth: 40 },
      3: { halign: "left", cellWidth: 50 },
    },
    theme: "grid",
    margin: { left: 12, right: 12 },
  });

  const attendanceCompanies = new Set(
    attending.map((p) => (p?.company || "").trim()).filter(Boolean)
  ).size;
  const totalAttendance = attending.length;

  const y = pdf.lastAutoTable.finalY + 10;
  pdf.setFontSize(11);
  pdf.text(
    `出席事業所数：${attendanceCompanies} ｜ 合計出席人数：${totalAttendance}`,
    pdf.internal.pageSize.getWidth() / 2,
    y,
    { align: "center" }
  );

  pdf.save(`${meetingTitle || "出席者一覧"}.pdf`);
}


