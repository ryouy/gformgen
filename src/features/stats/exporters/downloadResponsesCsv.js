import { formatDateTimeYMDHM, formatPeopleMultiline } from "../utils/formatters";
import { expandParticipantRows } from "../utils/expandParticipantRows";
import { buildExportFilename } from "./fileNaming";

function escapeCsvCell(v) {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadResponsesCsv({ rows, selectedFormId, title }) {
  const expanded = expandParticipantRows(rows);
  const header = ["No", "事業所名", "役職名", "氏名", "出席/欠席", "備考", "送信日時"];
  const lines = [
    header.join(","),
    ...(expanded || []).map((r, i) =>
      [
        i + 1,
        r?.company,
        formatPeopleMultiline(r?.role, { empty: "" }),
        formatPeopleMultiline(r?.name, { empty: "" }),
        r?.attendance,
        r?.remarks,
        formatDateTimeYMDHM(r?.submittedAt),
      ]
        .map(escapeCsvCell)
        .join(",")
    ),
  ];

  // Excel-friendly: include UTF-8 BOM.
  const csv = `\uFEFF${lines.join("\n")}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = buildExportFilename({
    title,
    selectedFormId,
    kind: "csv",
    ext: "csv",
  });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}


