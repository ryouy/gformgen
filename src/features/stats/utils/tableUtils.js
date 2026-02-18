export function formatSubmittedAt(isoString) {
  if (!isoString) return "—";
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return "—";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}/${m}/${day} ${hh}:${mm}`;
}

export function summarizePeopleForTable(v, { empty = "", suffix = "名" } = {}) {
  const s = String(v ?? "").trim();
  if (!s) return empty;
  const parts = s
    .split("/")
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  if (parts.length <= 1) return parts[0] || empty;
  return `${parts[0]}（他${parts.length - 1}${suffix}）`;
}

export function isAttending(p) {
  return p?.attendance === "出席";
}

export function computeAttendanceSummary(participants) {
  const attending = (participants || []).filter(isAttending);
  // 1人=1レコード運用のため、合計出席人数は行数で数える
  const totalAttendance = attending.length;
  const attendanceCompanies = new Set(
    attending.map((p) => (p?.company || "").trim()).filter(Boolean)
  ).size;
  return { attending, totalAttendance, attendanceCompanies };
}


