import crypto from "node:crypto";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const SESSION_COLLECTION = "gformgen_sessions";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

function sessionPrefix(sessionId) {
  return String(sessionId || "").slice(0, 8);
}

function nowMs() {
  return Date.now();
}

function nextExpiryMs() {
  return nowMs() + SESSION_TTL_MS;
}

function ensureAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  return initializeApp();
}

function getSessionsCollection() {
  ensureAdminApp();
  return getFirestore().collection(SESSION_COLLECTION);
}

function asPlainObject(value) {
  return value && typeof value === "object" ? value : {};
}

export function createSessionId() {
  return crypto.randomBytes(32).toString("hex");
}

export function sanitizeTokens(tokens, previousTokens = null) {
  const current = asPlainObject(tokens);
  const previous = asPlainObject(previousTokens);
  const expiryDateRaw = current.expiry_date ?? previous.expiry_date ?? null;
  const expiryDate = Number.isFinite(Number(expiryDateRaw)) ? Number(expiryDateRaw) : null;

  const out = {
    access_token: String(current.access_token || previous.access_token || "").trim() || null,
    refresh_token: String(current.refresh_token || previous.refresh_token || "").trim() || null,
    expiry_date: expiryDate,
    scope: String(current.scope || previous.scope || "").trim() || null,
    token_type: String(current.token_type || previous.token_type || "").trim() || null,
  };

  return out;
}

function normalizeUser(user) {
  const src = asPlainObject(user);
  const sub = String(src.sub || "").trim();
  if (!sub) return null;
  return {
    sub,
    email: String(src.email || "").trim(),
    name: String(src.name || "").trim(),
  };
}

function normalizeSession(sessionId, data) {
  if (!sessionId || !data || typeof data !== "object") return null;
  const tokens = sanitizeTokens(data.tokens);
  const user = normalizeUser(data.user);
  return {
    sessionId,
    user,
    tokens,
    createdAtMs: Number(data.createdAtMs) || nowMs(),
    updatedAtMs: Number(data.updatedAtMs) || nowMs(),
    expiresAtMs: Number(data.expiresAtMs) || nextExpiryMs(),
  };
}

function isExpired(session) {
  return !session || Number(session.expiresAtMs || 0) <= nowMs();
}

async function writeSession(session) {
  if (!session?.sessionId) return;
  console.log("[session] write start", {
    sessionId: sessionPrefix(session.sessionId),
    hasUser: Boolean(session?.user?.sub),
    hasRefreshToken: Boolean(session?.tokens?.refresh_token),
    hasAccessToken: Boolean(session?.tokens?.access_token),
  });
  await getSessionsCollection().doc(session.sessionId).set(session);
  console.log("[session] write ok firestore", {
    sessionId: sessionPrefix(session.sessionId),
  });
}

export async function createSession({ user, tokens }) {
  const sessionId = createSessionId();
  const session = {
    sessionId,
    user: normalizeUser(user),
    tokens: sanitizeTokens(tokens),
    createdAtMs: nowMs(),
    updatedAtMs: nowMs(),
    expiresAtMs: nextExpiryMs(),
  };
  console.log("[session] create", {
    sessionId: sessionPrefix(sessionId),
    hasUser: Boolean(session?.user?.sub),
    hasRefreshToken: Boolean(session?.tokens?.refresh_token),
    hasAccessToken: Boolean(session?.tokens?.access_token),
  });
  await writeSession(session);
  return session;
}

export async function getSession(sessionId) {
  const id = String(sessionId || "").trim();
  if (!id) return null;
  console.log("[session] read start", {
    sessionId: sessionPrefix(id),
  });

  const snap = await getSessionsCollection().doc(id).get();
  if (!snap.exists) {
    console.log("[session] read miss firestore", { sessionId: sessionPrefix(id) });
    return null;
  }
  const session = normalizeSession(id, snap.data());
  if (isExpired(session)) {
    await deleteSession(id);
    console.log("[session] read miss firestore expired", { sessionId: sessionPrefix(id) });
    return null;
  }
  console.log("[session] read result firestore", {
    sessionId: sessionPrefix(id),
    found: true,
    hasUser: Boolean(session?.user?.sub),
    hasRefreshToken: Boolean(session?.tokens?.refresh_token),
    hasAccessToken: Boolean(session?.tokens?.access_token),
  });
  return session;
}

export async function updateSession(sessionId, patch = {}) {
  const current = await getSession(sessionId);
  if (!current) {
    console.log("[session] update skipped missing", { sessionId: sessionPrefix(sessionId) });
    return null;
  }

  const next = {
    ...current,
    ...patch,
    user: patch.user ? normalizeUser(patch.user) : current.user,
    tokens: patch.tokens ? sanitizeTokens(patch.tokens, current.tokens) : current.tokens,
    updatedAtMs: nowMs(),
    expiresAtMs: nextExpiryMs(),
  };

  await writeSession(next);
  console.log("[session] update ok", {
    sessionId: sessionPrefix(sessionId),
    patchedUser: Boolean(patch?.user),
    patchedTokens: Boolean(patch?.tokens),
  });
  return next;
}

export async function deleteSession(sessionId) {
  const id = String(sessionId || "").trim();
  if (!id) return;
  console.log("[session] delete", {
    sessionId: sessionPrefix(id),
  });
  await getSessionsCollection().doc(id).delete();
}
