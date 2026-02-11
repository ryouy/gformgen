import { formatPeopleMultiline } from "../utils/formatters";

function escapeCsvCell(v) {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadResponsesCsv({ rows, selectedFormId }) {
  const header = ["company", "role", "name", "attendance", "count", "remarks", "submittedAt"];
  const lines = [
    header.join(","),
    ...(rows || []).map((r) =>
      [
        r?.company,
        formatPeopleMultiline(r?.role, { empty: "" }),
        formatPeopleMultiline(r?.name, { empty: "" }),
        r?.attendance,
        r?.count,
        r?.remarks,
        r?.submittedAt,
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
  a.download = `responses_${selectedFormId || "unknown"}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}


