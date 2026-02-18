import jsPDF from "jspdf";
import "jspdf-autotable";
import { formatDateTimeYMDHM, formatPeopleMultiline } from "../utils/formatters";
import { expandParticipantRows } from "../utils/expandParticipantRows";
import { buildExportFilename } from "./fileNaming";

export function downloadAttendancePdf({ rows, selectedFormId, title, fontData }) {
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
  pdf.text(title || "会合名未設定", 14, 18);
  pdf.setFontSize(14);
  pdf.text("出席者一覧", 14, 28);

  const headers = [["No", "事業所名", "役職名", "氏名", "送信日時"]];
  const body = attending.map((p, i) => [
    String(i + 1),
    p.company || "",
    formatPeopleMultiline(p.role, { empty: "ー" }),
    formatPeopleMultiline(p.name, { empty: "" }),
    formatDateTimeYMDHM(p?.submittedAt),
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
      1: { halign: "center", cellWidth: 54 },
      2: { halign: "center", cellWidth: 30 },
      3: { halign: "center", cellWidth: 42 },
      4: { halign: "center", cellWidth: 40 },
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

  // 備考は本表とは分けて、事業所ごとの一覧として見やすく配置
  const remarkSource = (expanded || [])
    .filter((r) => String(r?.remarks || "").trim().length > 0)
    .map((r) => ({
      company: String(r?.company || "").trim() || "—",
      remarks: String(r?.remarks || "").trim(),
    }));

  if (remarkSource.length > 0) {
    /** @type {Record<string, Array<{remarks: string, submittedAt: string}>>} */
    const byCompany = {};
    for (const r of remarkSource) {
      if (!byCompany[r.company]) byCompany[r.company] = [];
      byCompany[r.company].push({ remarks: r.remarks });
    }

    const remarkRows = Object.entries(byCompany).map(([company, list]) => {
      const text = (list || []).map((x) => x.remarks).join("\n");
      return [company, text];
    });

    const remarksStartY = pdf.lastAutoTable.finalY + 18;
    pdf.setFontSize(12);
    pdf.text("備考一覧", 14, remarksStartY - 4);

    pdf.autoTable({
      startY: remarksStartY,
      head: [["事業所名", "備考"]],
      body: remarkRows,
      styles: {
        font: "NotoSansJP",
        fontSize: 10,
        halign: "left",
        valign: "top",
        cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
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
        0: { cellWidth: 44, halign: "center", valign: "middle" },
        1: { cellWidth: 146, halign: "left" },
      },
      theme: "grid",
      margin: { left: 12, right: 12 },
    });
  }

  pdf.save(
    buildExportFilename({
      title,
      selectedFormId,
      kind: "pdf",
      ext: "pdf",
    })
  );
}


