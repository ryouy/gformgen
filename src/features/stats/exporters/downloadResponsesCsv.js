import { formatPeopleMultiline } from "../utils/formatters";
import { expandParticipantRows } from "../utils/expandParticipantRows";

function escapeCsvCell(v) {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toSafeFilenameBase(input, { fallback } = {}) {
  const s = String(input ?? "")
    .replace(/\s+/g, " ")
    .trim();

  // Windows/mac friendly: remove reserved characters and control chars.
  const cleaned = s
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    // Avoid trailing dots/spaces which can be problematic on Windows.
    .replace(/[.\s]+$/g, "")
    .trim();

  return cleaned || String(fallback || "responses");
}

export function downloadResponsesCsv({ rows, selectedFormId, title }) {
  const expanded = expandParticipantRows(rows);
  const header = ["company", "role", "name", "attendance", "count", "remarks", "submittedAt"];
  const lines = [
    header.join(","),
    ...(expanded || []).map((r) =>
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
  const fallback = `responses_${selectedFormId || "unknown"}`;
  const base = toSafeFilenameBase(title, { fallback });
  a.download = `${base}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}


