import crypto from "node:crypto";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
  FRONTEND_ORIGIN_SECRET,
  readLegacyAwareSecret,
} from "./config.js";

const SHORT_LINKS_COLLECTION = "gformgen_short_links";
const SHORT_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DEFAULT_SHORT_CODE_LENGTH = 7;
const MAX_CREATE_ATTEMPTS = 12;

function ensureAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  return initializeApp();
}

function getShortLinksCollection() {
  ensureAdminApp();
  return getFirestore().collection(SHORT_LINKS_COLLECTION);
}

function normalizeOrigin(input) {
  return String(input || "").trim().replace(/\/+$/, "");
}

function canonicalizeOriginForQr(input) {
  return normalizeOrigin(input).toUpperCase();
}

function buildOriginFromRequest(req) {
  const explicitOrigin = normalizeOrigin(req.get("origin"));
  if (explicitOrigin) return explicitOrigin;

  const referer = String(req.get("referer") || "").trim();
  if (referer) {
    try {
      return normalizeOrigin(new URL(referer).origin);
    } catch {
      // ignore invalid referer
    }
  }

  const host = String(req.get("x-forwarded-host") || req.get("host") || "").trim();
  const proto = String(req.get("x-forwarded-proto") || req.protocol || "https").trim();
  if (!host) return "";
  return normalizeOrigin(`${proto}://${host}`);
}

function getPublicOrigin(req) {
  const configuredOrigin = normalizeOrigin(
    readLegacyAwareSecret("GF_FRONTEND_ORIGIN", "FRONTEND_ORIGIN", FRONTEND_ORIGIN_SECRET)
  );
  return configuredOrigin || buildOriginFromRequest(req);
}

export function normalizeShortCode(input) {
  return String(input || "")
    .trim()
    .replace(/[^A-Za-z0-9]/g, "");
}

function generateShortCode(length = DEFAULT_SHORT_CODE_LENGTH) {
  const bytes = crypto.randomBytes(length);
  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += SHORT_CODE_ALPHABET[bytes[i] % SHORT_CODE_ALPHABET.length];
  }
  return code;
}

export function buildShortUrl(req, code) {
  const normalizedCode = normalizeShortCode(code);
  if (!normalizedCode) return "";

  const origin = canonicalizeOriginForQr(getPublicOrigin(req));
  const upperCode = normalizedCode.toUpperCase();
  if (!origin) return `/R/${encodeURIComponent(upperCode)}`;

  return `${origin}/R/${encodeURIComponent(upperCode)}`;
}

export async function getShortLink(code) {
  const normalizedCode = normalizeShortCode(code);
  if (!normalizedCode) return null;

  const candidates = Array.from(
    new Set([
      normalizedCode,
      normalizedCode.toUpperCase(),
      normalizedCode.toLowerCase(),
    ])
  );

  for (const candidate of candidates) {
    const snap = await getShortLinksCollection().doc(candidate).get();
    if (!snap.exists) continue;

    const data = snap.data() || {};
    return {
      code: String(data.code || candidate).trim(),
      formId: String(data.formId || "").trim(),
      targetUrl: String(data.targetUrl || "").trim(),
      createdAtMs: Number(data.createdAtMs) || 0,
      updatedAtMs: Number(data.updatedAtMs) || 0,
    };
  }

  return null;
}

export async function upsertShortLink(code, { formId, targetUrl }) {
  const normalizedCode = normalizeShortCode(code).toUpperCase();
  const normalizedFormId = String(formId || "").trim();
  const normalizedTargetUrl = String(targetUrl || "").trim();
  if (!normalizedCode || !normalizedFormId || !normalizedTargetUrl) return null;

  const now = Date.now();
  await getShortLinksCollection().doc(normalizedCode).set(
    {
      code: normalizedCode,
      formId: normalizedFormId,
      targetUrl: normalizedTargetUrl,
      updatedAtMs: now,
      createdAtMs: now,
    },
    { merge: true }
  );
  return normalizedCode;
}

export async function createShortLink({ formId, targetUrl }) {
  const normalizedFormId = String(formId || "").trim();
  const normalizedTargetUrl = String(targetUrl || "").trim();
  if (!normalizedFormId || !normalizedTargetUrl) {
    throw new Error("Short link requires formId and targetUrl");
  }

  const collection = getShortLinksCollection();
  for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt += 1) {
    const code = generateShortCode();
    const now = Date.now();
    try {
      await collection.doc(code).create({
        code,
        formId: normalizedFormId,
        targetUrl: normalizedTargetUrl,
        createdAtMs: now,
        updatedAtMs: now,
      });
      return code;
    } catch (err) {
      if (String(err?.code || "").toLowerCase() === "6") continue;
      if (String(err?.code || "").toLowerCase() === "already-exists") continue;
      throw err;
    }
  }

  throw new Error("Failed to allocate unique short code");
}
