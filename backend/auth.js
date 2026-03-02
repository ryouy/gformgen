import { google } from "googleapis";
import crypto from "node:crypto";
import {
  IS_FIREBASE,
  readLegacyAwareSecret,
  GOOGLE_CLIENT_ID_SECRET,
  GOOGLE_CLIENT_SECRET_SECRET,
  OAUTH_REDIRECT_URI_SECRET,
  SESSION_PASSWORD_SECRET,
  FRONTEND_ORIGIN_SECRET,
} from "./config.js";
import { APP_PROP_APP_KEY, APP_PROP_APP_VALUE, APP_PROP_OWNER_SUB_KEY } from "./constants.js";
import { mergeAppProperties, buildOwnerAppPropertiesPatch } from "./utils.js";

const FALLBACK_OAUTH_REDIRECT_URI =
  readLegacyAwareSecret(
    "GF_OAUTH_REDIRECT_URI",
    "OAUTH_REDIRECT_URI",
    OAUTH_REDIRECT_URI_SECRET
  ) ||
  "https://example.invalid/oauth2/callback";

let savedTokens = null;
let warnedMissingSessionPassword = false;
let savedUser = null;

function getAuthCallbackPathFromRequest(req) {
  const u = String(req?.originalUrl || req?.url || "");
  return u.startsWith("/api/") ? "/api/auth/google/callback" : "/auth/google/callback";
}

function buildRedirectUriFromRequest(req) {
  const proto = String(req?.headers?.["x-forwarded-proto"] || req?.protocol || "http")
    .split(",")[0]
    .trim();
  const host = String(req?.headers?.["x-forwarded-host"] || req?.get?.("host") || "").trim();
  if (!host) return FALLBACK_OAUTH_REDIRECT_URI;
  return `${proto}://${host}${getAuthCallbackPathFromRequest(req)}`;
}

export function makeOAuthClient(redirectUri) {
  return new google.auth.OAuth2(
    readLegacyAwareSecret(
      "GF_GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_ID",
      GOOGLE_CLIENT_ID_SECRET
    ),
    readLegacyAwareSecret(
      "GF_GOOGLE_CLIENT_SECRET",
      "GOOGLE_CLIENT_SECRET",
      GOOGLE_CLIENT_SECRET_SECRET
    ),
    redirectUri || FALLBACK_OAUTH_REDIRECT_URI
  );
}

function base64UrlEncode(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(s) {
  const b64 = String(s).replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  return Buffer.from(b64 + pad, "base64");
}

function getSessionSecret() {
  const v = readLegacyAwareSecret(
    "GF_SESSION_PASSWORD",
    "SESSION_PASSWORD",
    SESSION_PASSWORD_SECRET
  );
  return String(v || "").trim() || "";
}

function encryptTokens(tokens, secret) {
  const key = crypto.createHash("sha256").update(secret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(tokens), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${base64UrlEncode(iv)}.${base64UrlEncode(tag)}.${base64UrlEncode(ciphertext)}`;
}

function decryptTokens(payload, secret) {
  const p = String(payload || "");
  if (!p.startsWith("v1.")) return null;
  const parts = p.split(".");
  if (parts.length !== 4) return null;
  const [, ivB64u, tagB64u, ctB64u] = parts;
  const key = crypto.createHash("sha256").update(secret).digest();
  const iv = base64UrlDecode(ivB64u);
  const tag = base64UrlDecode(tagB64u);
  const ciphertext = base64UrlDecode(ctB64u);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const obj = JSON.parse(plaintext.toString("utf8"));
  return obj && typeof obj === "object" ? obj : null;
}

export function parseCookies(req) {
  const raw = String(req?.headers?.cookie || "");
  /** @type {Record<string, string>} */
  const out = {};
  for (const part of raw.split(";")) {
    const p = part.trim();
    if (!p) continue;
    const i = p.indexOf("=");
    if (i <= 0) continue;
    const k = p.slice(0, i).trim();
    const v = p.slice(i + 1).trim();
    if (!k) continue;
    out[k] = decodeURIComponent(v);
  }
  return out;
}

export function setUserCookie(req, res, user) {
  const secret = getSessionSecret();
  if (!secret) return false;
  const proto = String(req?.headers?.["x-forwarded-proto"] || req?.protocol || "http")
    .split(",")[0]
    .trim();
  const secure = proto === "https";
  const value = encryptTokens(user, secret);
  const attrs = [
    `gformgen_user=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : "",
    `Max-Age=${60 * 60 * 24 * 30}`,
  ]
    .filter(Boolean)
    .join("; ");
  res.setHeader("Set-Cookie", attrs);
  return true;
}

export function clearUserCookie(req, res) {
  const proto = String(req?.headers?.["x-forwarded-proto"] || req?.protocol || "http")
    .split(",")[0]
    .trim();
  const secure = proto === "https";
  const attrs = [
    "gformgen_user=",
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : "",
    "Max-Age=0",
  ]
    .filter(Boolean)
    .join("; ");
  res.setHeader("Set-Cookie", attrs);
}

export function getSavedUser(req) {
  const secret = getSessionSecret();
  if (secret) {
    try {
      const cookies = parseCookies(req);
      const enc = cookies?.gformgen_user;
      if (enc) {
        const user = decryptTokens(enc, secret);
        if (user && typeof user === "object") {
          return user;
        }
      }
    } catch {
      // ignore and fallback
    }
    return null;
  }
  return savedUser;
}

export async function fetchGoogleUserInfo(authClient) {
  const oauth2 = google.oauth2({ version: "v2", auth: authClient });
  const res = await oauth2.userinfo.get();
  const data = res?.data || {};
  const sub = String(data?.id || "").trim();
  const email = String(data?.email || "").trim();
  const name = String(data?.name || "").trim();
  return {
    sub: sub || "",
    email: email || "",
    name: name || "",
  };
}

function tryDecodeJwtPayload(jwt) {
  const s = String(jwt || "").trim();
  const parts = s.split(".");
  if (parts.length < 2) return null;
  const payload = parts[1];
  try {
    const buf = base64UrlDecode(payload);
    const obj = JSON.parse(buf.toString("utf8"));
    return obj && typeof obj === "object" ? obj : null;
  } catch {
    return null;
  }
}

export function userFromIdToken(tokens) {
  const idToken = tokens?.id_token;
  if (!idToken) return null;
  const payload = tryDecodeJwtPayload(idToken);
  if (!payload) return null;
  const sub = String(payload?.sub || payload?.user_id || "").trim();
  const email = String(payload?.email || "").trim();
  const name = String(payload?.name || payload?.given_name || "").trim();
  if (!sub) return null;
  return { sub, email, name };
}

export async function getAuthUserOrNull(req, res) {
  const cached = getSavedUser(req);
  if (cached?.sub) return cached;

  const tokens = getTokens(req);
  const fromIdToken = userFromIdToken(tokens);
  if (fromIdToken?.sub) {
    if (!getSessionSecret()) savedUser = fromIdToken;
    try {
      setUserCookie(req, res, fromIdToken);
    } catch {
      // ignore
    }
    return fromIdToken;
  }

  const authClient = makeAuthedOAuthClientOrNull(req);
  if (!authClient) return null;
  try {
    const user = await fetchGoogleUserInfo(authClient);
    if (user?.sub) {
      if (!getSessionSecret()) savedUser = user;
      try {
        setUserCookie(req, res, user);
      } catch {
        // ignore
      }
      return user;
    }
  } catch {
    // ignore
  }
  return cached || null;
}

export async function enforceOwnerAccess({ req, res, drive, formId, requireApp = true }) {
  const authUser = await getAuthUserOrNull(req, res);
  if (!authUser?.sub) {
    return { ok: false, status: 401, error: "Not logged in" };
  }

  const driveFile = await drive.files.get({
    fileId: formId,
    fields: "id,name,ownedByMe,appProperties",
  });
  const file = driveFile?.data || {};
  const props = file?.appProperties || {};
  const appKey = String(props?.[APP_PROP_APP_KEY] || "");
  if (requireApp && appKey && appKey !== APP_PROP_APP_VALUE) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  const ownerSub = String(props?.[APP_PROP_OWNER_SUB_KEY] || "").trim();
  const me = String(authUser.sub).trim();
  if (ownerSub) {
    if (ownerSub !== me) return { ok: false, status: 403, error: "Forbidden" };
    return { ok: true, authUser, file };
  }

  if (file?.ownedByMe === true) {
    const nextProps = mergeAppProperties(
      props,
      buildOwnerAppPropertiesPatch(props, authUser, true)
    );
    try {
      await drive.files.update({
        fileId: formId,
        requestBody: { appProperties: nextProps },
      });
      file.appProperties = nextProps;
    } catch {
      // ignore
    }
    return { ok: true, authUser, file };
  }

  return { ok: false, status: 403, error: "Forbidden" };
}

function setAuthCookie(req, res, tokens) {
  const secret = getSessionSecret();
  if (!secret) {
    if (IS_FIREBASE && !warnedMissingSessionPassword) {
      warnedMissingSessionPassword = true;
      console.warn(
        "[gformgen] GF_SESSION_PASSWORD is not set. Login state may be lost between serverless instances."
      );
    }
    return false;
  }

  const proto = String(req?.headers?.["x-forwarded-proto"] || req?.protocol || "http")
    .split(",")[0]
    .trim();
  const secure = proto === "https";
  const value = encryptTokens(tokens, secret);
  const attrs = [
    `gformgen_tokens=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : "",
    `Max-Age=${60 * 60 * 24 * 30}`,
  ]
    .filter(Boolean)
    .join("; ");
  res.setHeader("Set-Cookie", attrs);
  return true;
}

function clearAuthCookie(req, res) {
  const proto = String(req?.headers?.["x-forwarded-proto"] || req?.protocol || "http")
    .split(",")[0]
    .trim();
  const secure = proto === "https";
  const attrs = [
    "gformgen_tokens=",
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : "",
    "Max-Age=0",
  ]
    .filter(Boolean)
    .join("; ");
  res.setHeader("Set-Cookie", attrs);
}

export function getTokens(req) {
  const secret = getSessionSecret();
  if (secret) {
    try {
      const cookies = parseCookies(req);
      const enc = cookies?.gformgen_tokens;
      if (enc) {
        const tokens = decryptTokens(enc, secret);
        if (tokens?.access_token || tokens?.refresh_token) {
          return tokens;
        }
      }
    } catch {
      // ignore and fallback
    }
    return null;
  }
  return savedTokens;
}

export async function setTokens(req, res, tokens) {
  try {
    const ok = setAuthCookie(req, res, tokens);
    if (!ok) {
      savedTokens = tokens;
    }
  } catch {
    savedTokens = tokens;
  }
}

export async function clearTokens(req, res) {
  savedTokens = null;
  savedUser = null;
  try {
    clearAuthCookie(req, res);
  } catch {
    // ignore
  }
  try {
    clearUserCookie(req, res);
  } catch {
    // ignore
  }
}

export function makeAuthedOAuthClientOrNull(req) {
  const tokens = getTokens(req);
  if (!tokens?.access_token && !tokens?.refresh_token) return null;
  const client = makeOAuthClient(FALLBACK_OAUTH_REDIRECT_URI);
  client.setCredentials(tokens);
  return client;
}

export function handleAuthGoogle(req, res) {
  const redirectUri =
    readLegacyAwareSecret(
      "GF_OAUTH_REDIRECT_URI",
      "OAUTH_REDIRECT_URI",
      OAUTH_REDIRECT_URI_SECRET
    ) ||
    buildRedirectUriFromRequest(req);
  const oauthForAuth = makeOAuthClient(redirectUri);
  const returnToRaw = String(req.query.returnTo || "").trim();
  const returnTo =
    returnToRaw && /^https?:\/\//.test(returnToRaw) ? returnToRaw : null;

  const authUrl = oauthForAuth.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/forms.body",
      "https://www.googleapis.com/auth/forms.responses.readonly",
      "https://www.googleapis.com/auth/drive.file",
    ],
    ...(returnTo ? { state: encodeURIComponent(returnTo) } : {}),
  });
  res.redirect(authUrl);
}

export async function handleAuthCallback(req, res) {
  const { logEvent } = await import("./logger.js");
  try {
    const redirectUri =
      readLegacyAwareSecret(
        "GF_OAUTH_REDIRECT_URI",
        "OAUTH_REDIRECT_URI",
        OAUTH_REDIRECT_URI_SECRET
      ) ||
      buildRedirectUriFromRequest(req);
    const oauthForAuth = makeOAuthClient(redirectUri);
    const { tokens } = await oauthForAuth.getToken(req.query.code);
    await setTokens(req, res, tokens);

    try {
      const fromIdToken = userFromIdToken(tokens);
      if (fromIdToken?.sub) {
        savedUser = fromIdToken;
        setUserCookie(req, res, fromIdToken);
      }

      const client = makeOAuthClient(redirectUri);
      client.setCredentials(tokens);
      const user = await fetchGoogleUserInfo(client);
      if (user?.sub) {
        savedUser = user;
        setUserCookie(req, res, user);
      }
    } catch {
      // ignore
    }

    void logEvent({
      type: "oauth_success",
    });
    const state = String(req.query.state || "").trim();
    const returnTo = state ? decodeURIComponent(state) : null;
    const safeReturnTo = returnTo && /^https?:\/\//.test(returnTo) ? returnTo : null;
    const configuredFrontendOrigin = readLegacyAwareSecret(
      "GF_FRONTEND_ORIGIN",
      "FRONTEND_ORIGIN",
      FRONTEND_ORIGIN_SECRET
    );

    const parseAbsoluteUrl = (maybeUrl) => {
      if (!maybeUrl) return null;
      try {
        return new URL(String(maybeUrl));
      } catch {
        return null;
      }
    };

    const configuredUrl = parseAbsoluteUrl(configuredFrontendOrigin);
    const returnToUrl = parseAbsoluteUrl(safeReturnTo);

    let redirectUrl = null;
    if (returnToUrl && configuredUrl) {
      if (returnToUrl.origin === configuredUrl.origin) redirectUrl = returnToUrl;
      else redirectUrl = configuredUrl;
    } else if (returnToUrl) {
      redirectUrl = returnToUrl;
    } else if (configuredUrl) {
      redirectUrl = configuredUrl;
    }

    if (!redirectUrl) {
      const proto = String(req?.headers?.["x-forwarded-proto"] || req?.protocol || "https")
        .split(",")[0]
        .trim();
      const host = String(req?.headers?.["x-forwarded-host"] || req?.get?.("host") || "").trim();
      redirectUrl = host ? new URL(`${proto}://${host}`) : new URL("https://example.invalid");
    }

    redirectUrl.search = "";
    redirectUrl.hash = "";

    const basePath = String(redirectUrl.pathname || "/").replace(/\/?$/, "/");
    const base = `${redirectUrl.origin}${basePath}`;
    res.redirect(`${base}?login=success`);
  } catch (err) {
    console.error(err);
    void logEvent({
      type: "oauth_error",
      message: err?.message || String(err),
    });
    res.status(500).send("OAuth failed");
  }
}

export async function handleAuthMe(req, res) {
  const tokens = getTokens(req);
  const loggedIn = Boolean(tokens?.access_token) || Boolean(tokens?.refresh_token);
  const user = await getAuthUserOrNull(req, res);
  return res.json({
    loggedIn,
    hasRefreshToken: Boolean(tokens?.refresh_token),
    hasAccessToken: Boolean(tokens?.access_token),
    expiryDate: tokens?.expiry_date ?? null,
    user: user
      ? {
          sub: String(user?.sub || ""),
          email: String(user?.email || ""),
          name: String(user?.name || ""),
        }
      : null,
  });
}
