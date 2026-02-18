export function toSafeFilenameBase(input, { fallback } = {}) {
  const s = String(input ?? "")
    .replace(/\s+/g, " ")
    .trim();

  const cleaned = s
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.\s]+$/g, "")
    .trim();

  return cleaned || String(fallback || "responses");
}

export function buildExportFilename({ title, selectedFormId, kind, ext }) {
  const fallback = `responses_${selectedFormId || "unknown"}`;
  const base = toSafeFilenameBase(title, { fallback });
  const k = String(kind || ext || "file").toLowerCase();
  const e = String(ext || "txt").toLowerCase();
  return `${base}_${k}.${e}`;
}


