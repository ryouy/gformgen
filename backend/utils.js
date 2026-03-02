import {
  APP_PROP_OWNER_SUB_KEY,
  APP_PROP_OWNER_EMAIL_KEY,
  APP_PROP_OWNER_NAME_KEY,
} from "./constants.js";

export function normalizeHexColor(input) {
  const s = String(input || "").trim();
  if (!s) return "";
  const m3 = s.match(/^#([0-9a-fA-F]{3})$/);
  if (m3) {
    const [r, g, b] = m3[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  const m6 = s.match(/^#([0-9a-fA-F]{6})$/);
  if (m6) return `#${m6[1]}`.toLowerCase();
  return "";
}

export function normalizeToHalfWidthDigits(s) {
  return String(s ?? "").replace(/[０-９]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0)
  );
}

export function parseIntInRange(v, { min, max } = {}) {
  const normalized = normalizeToHalfWidthDigits(v);
  const n = Number.parseInt(normalized, 10);
  if (!Number.isFinite(n)) return null;
  if (typeof min === "number" && n < min) return null;
  if (typeof max === "number" && n > max) return null;
  return n;
}

export function mergeAppProperties(current, patch) {
  return {
    ...(current || {}),
    ...(patch || {}),
  };
}

export function buildOwnerAppPropertiesPatch(currentProps, authUser, ownedByMe) {
  if (!ownedByMe) return {};
  const cur = currentProps || {};
  const u = authUser || {};
  /** @type {Record<string, string>} */
  const patch = {};
  if (!String(cur?.[APP_PROP_OWNER_SUB_KEY] || "").trim() && String(u?.sub || "").trim()) {
    patch[APP_PROP_OWNER_SUB_KEY] = String(u.sub).trim();
  }
  if (
    !String(cur?.[APP_PROP_OWNER_EMAIL_KEY] || "").trim() &&
    String(u?.email || "").trim()
  ) {
    patch[APP_PROP_OWNER_EMAIL_KEY] = String(u.email).trim();
  }
  if (
    !String(cur?.[APP_PROP_OWNER_NAME_KEY] || "").trim() &&
    String(u?.name || "").trim()
  ) {
    patch[APP_PROP_OWNER_NAME_KEY] = String(u.name).trim();
  }
  return patch;
}

export function extractGoogleApiError(err) {
  const status =
    err?.response?.status ||
    err?.code ||
    null;
  const message =
    err?.response?.data?.error?.message ||
    err?.message ||
    String(err);
  return {
    status: typeof status === "number" ? status : null,
    message,
  };
}
