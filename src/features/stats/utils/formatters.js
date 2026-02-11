export function formatDateYMD(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

export function formatDateTimeYMDHM(isoString) {
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

export function summarizePeople(v, { empty = "" } = {}) {
  const s = String(v ?? "").trim();
  if (!s) return empty;
  const parts = s
    .split("/")
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  if (parts.length <= 1) return parts[0] || empty;
  return `${parts[0]}（他${parts.length - 1}名）`;
}

export function formatPeopleMultiline(v, { empty = "" } = {}) {
  const s = String(v ?? "").trim();
  if (!s) return empty;
  const parts = s
    .split(/[\/／]/g)
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  if (parts.length <= 1) return parts[0] || empty;
  return parts.join("\n");
}


