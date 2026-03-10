import cookie from "cookie";
import { google } from "googleapis";
import {
  readLegacyAwareSecret,
  GOOGLE_CLIENT_ID_SECRET,
  GOOGLE_CLIENT_SECRET_SECRET,
  OAUTH_REDIRECT_URI_SECRET,
  FRONTEND_ORIGIN_SECRET,
} from "./config.js";
import { APP_PROP_APP_KEY, APP_PROP_APP_VALUE, APP_PROP_OWNER_SUB_KEY } from "./constants.js";
import { mergeAppProperties, buildOwnerAppPropertiesPatch } from "./utils.js";
import { createSession, deleteSession, getSession, updateSession } from "./sessionStore.js";

const SESSION_COOKIE_NAME = "__session";
const LEGACY_SESSION_COOKIE_NAME = "gformgen_session";
const LEGACY_TOKENS_COOKIE_NAME = "gformgen_tokens";
const LEGACY_USER_COOKIE_NAME = "gformgen_user";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const OAUTH_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/forms.body",
  "https://www.googleapis.com/auth/forms.responses.readonly",
  "https://www.googleapis.com/auth/drive.file",
];

function sessionPrefix(sessionId) {
  return String(sessionId || "").slice(0, 8);
}

function getOAuthRedirectUri() {
  const redirectUri = readLegacyAwareSecret(
    "GF_OAUTH_REDIRECT_URI",
    "OAUTH_REDIRECT_URI",
    OAUTH_REDIRECT_URI_SECRET
  );
  const value = String(redirectUri || "").trim();
  if (!value) {
    throw new Error(
      "GF_OAUTH_REDIRECT_URI must be set. Example: https://gfca-aizu.web.app/api/auth/google/callback"
    );
  }
  return value;
}

function parseCookies(req) {
  return cookie.parse(String(req?.headers?.cookie || ""));
}

function getSessionCookieValue(req) {
  return String(parseCookies(req)?.[SESSION_COOKIE_NAME] || "").trim();
}

function cookieAttrs(req, { clear = false } = {}) {
  const proto = String(req?.headers?.["x-forwarded-proto"] || req?.protocol || "http")
    .split(",")[0]
    .trim();
  const secure = proto === "https";
  const sameSite = secure ? "SameSite=None" : "SameSite=Lax";
  return [
    "Path=/",
    "HttpOnly",
    sameSite,
    secure ? "Secure" : "",
    `Max-Age=${clear ? 0 : COOKIE_MAX_AGE_SECONDS}`,
  ]
    .filter(Boolean)
    .join("; ");
}

function setAuthNoStore(res) {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
}

function appendCookie(res, cookieString) {
  res.append("Set-Cookie", cookieString);
}

function setSessionCookie(req, res, sessionId) {
  console.log("[auth] setSessionCookie", {
    sessionId: sessionPrefix(sessionId),
    attrs: cookieAttrs(req),
  });
  appendCookie(
    res,
    [`${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionId)}`, cookieAttrs(req)].join("; ")
  );
}

function clearCookie(req, res, name) {
  appendCookie(res, [`${name}=`, cookieAttrs(req, { clear: true })].join("; "));
}

function clearLegacyCookies(req, res) {
  clearCookie(req, res, LEGACY_SESSION_COOKIE_NAME);
  clearCookie(req, res, LEGACY_TOKENS_COOKIE_NAME);
  clearCookie(req, res, LEGACY_USER_COOKIE_NAME);
}

function setSessionCache(req, session) {
  req._gformgenSession = session || null;
}

async function getSessionFromRequest(req) {
  if (req._gformgenSession !== undefined) return req._gformgenSession;

  const sessionId = getSessionCookieValue(req);
  if (!sessionId) {
    console.log("[auth] getSessionFromRequest no-cookie");
    setSessionCache(req, null);
    return null;
  }

  console.log("[auth] getSessionFromRequest cookie", {
    sessionId: sessionPrefix(sessionId),
  });
  const session = await getSession(sessionId);
  console.log("[auth] getSessionFromRequest result", {
    sessionId: sessionPrefix(sessionId),
    found: Boolean(session),
    hasUser: Boolean(session?.user?.sub),
    hasRefreshToken: Boolean(session?.tokens?.refresh_token),
    hasAccessToken: Boolean(session?.tokens?.access_token),
  });
  setSessionCache(req, session);
  return session;
}

function hasUsableTokens(tokens) {
  return Boolean(tokens?.refresh_token || tokens?.access_token);
}

export function makeOAuthClient(redirectUri = getOAuthRedirectUri()) {
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
    redirectUri
  );
}

export async function fetchGoogleUserInfo(authClient) {
  const oauth2 = google.oauth2({ version: "v2", auth: authClient });
  const response = await oauth2.userinfo.get();
  const data = response?.data || {};
  return {
    sub: String(data?.id || "").trim(),
    email: String(data?.email || "").trim(),
    name: String(data?.name || "").trim(),
  };
}

function base64UrlDecode(value) {
  const b64 = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  return Buffer.from(b64 + pad, "base64");
}

function tryDecodeJwtPayload(jwt) {
  const parts = String(jwt || "").split(".");
  if (parts.length < 2) return null;
  try {
    return JSON.parse(base64UrlDecode(parts[1]).toString("utf8"));
  } catch {
    return null;
  }
}

export function userFromIdToken(tokens) {
  const payload = tryDecodeJwtPayload(tokens?.id_token);
  if (!payload || typeof payload !== "object") return null;
  const sub = String(payload?.sub || payload?.user_id || "").trim();
  if (!sub) return null;
  return {
    sub,
    email: String(payload?.email || "").trim(),
    name: String(payload?.name || payload?.given_name || "").trim(),
  };
}

async function persistUserOnSession(req, user) {
  const session = await getSessionFromRequest(req);
  if (!session?.sessionId || !user?.sub) return user || null;
  const updated = await updateSession(session.sessionId, { user });
  setSessionCache(req, updated);
  return updated?.user || user;
}

async function persistTokensOnSession(req, tokens) {
  const session = await getSessionFromRequest(req);
  if (!session?.sessionId || !tokens) return;
  const updated = await updateSession(session.sessionId, { tokens });
  setSessionCache(req, updated);
}

function buildFrontendRedirectUrl(req, state) {
  const returnTo = state ? decodeURIComponent(String(state)) : null;
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
    redirectUrl = returnToUrl.origin === configuredUrl.origin ? returnToUrl : configuredUrl;
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
  return `${redirectUrl.origin}${basePath}?login=success`;
}

export async function getTokens(req) {
  const session = await getSessionFromRequest(req);
  return hasUsableTokens(session?.tokens) ? session.tokens : null;
}

export async function getAuthUserOrNull(req) {
  const session = await getSessionFromRequest(req);
  if (session?.user?.sub) return session.user;

  const tokens = session?.tokens || null;
  const fromIdToken = userFromIdToken(tokens);
  if (fromIdToken?.sub) {
    await persistUserOnSession(req, fromIdToken);
    return fromIdToken;
  }

  const authClient = await makeAuthedOAuthClientOrNull(req);
  if (!authClient) return null;

  try {
    const user = await fetchGoogleUserInfo(authClient);
    if (!user?.sub) return null;
    await persistUserOnSession(req, user);
    return user;
  } catch {
    return null;
  }
}

export async function enforceOwnerAccess({ req, drive, formId, requireApp = true }) {
  const authUser = await getAuthUserOrNull(req);
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

export async function clearTokens(req, res) {
  const sessionId = getSessionCookieValue(req);
  if (sessionId) {
    await deleteSession(sessionId);
  }
  setSessionCache(req, null);
  clearCookie(req, res, SESSION_COOKIE_NAME);
  clearLegacyCookies(req, res);
}

export async function makeAuthedOAuthClientOrNull(req) {
  const session = await getSessionFromRequest(req);
  if (!hasUsableTokens(session?.tokens)) return null;

  const client = makeOAuthClient();
  client.setCredentials(session.tokens);
  client.on("tokens", (nextTokens) => {
    void persistTokensOnSession(req, nextTokens);
  });
  return client;
}

export function handleAuthGoogle(req, res) {
  try {
    setAuthNoStore(res);
    const oauthClient = makeOAuthClient();
    const returnToRaw = String(req.query.returnTo || "").trim();
    const returnTo = returnToRaw && /^https?:\/\//.test(returnToRaw) ? returnToRaw : null;
    const authUrl = oauthClient.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: OAUTH_SCOPES,
      ...(returnTo ? { state: encodeURIComponent(returnTo) } : {}),
    });
    res.redirect(authUrl);
  } catch (err) {
    console.error("[auth] handleAuthGoogle:", err);
    res.status(500).json({ error: "OAuth configuration error" });
  }
}

export async function handleAuthCallback(req, res) {
  const { logEvent } = await import("./logger.js");
  try {
    setAuthNoStore(res);
    const oauthClient = makeOAuthClient();
    const { tokens } = await oauthClient.getToken(req.query.code);
    oauthClient.setCredentials(tokens);

    const user = userFromIdToken(tokens) || (await fetchGoogleUserInfo(oauthClient));
    const session = await createSession({ user, tokens });
    console.log("[auth] callback session created", {
      sessionId: sessionPrefix(session?.sessionId),
      hasUser: Boolean(session?.user?.sub),
      hasRefreshToken: Boolean(session?.tokens?.refresh_token),
      hasAccessToken: Boolean(session?.tokens?.access_token),
    });
    setSessionCache(req, session);

    setSessionCookie(req, res, session.sessionId);
    clearLegacyCookies(req, res);

    void logEvent({ type: "oauth_success" });
    res.redirect(buildFrontendRedirectUrl(req, req.query.state));
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
  setAuthNoStore(res);
  const session = await getSessionFromRequest(req);
  const tokens = hasUsableTokens(session?.tokens) ? session.tokens : null;
  const user = await getAuthUserOrNull(req);
  console.log("[auth] me", {
    cookieSessionId: sessionPrefix(getSessionCookieValue(req)),
    found: Boolean(session),
    hasUser: Boolean(user?.sub),
    hasRefreshToken: Boolean(tokens?.refresh_token),
    hasAccessToken: Boolean(tokens?.access_token),
  });

  return res.json({
    loggedIn: Boolean(tokens),
    hasRefreshToken: Boolean(tokens?.refresh_token),
    hasAccessToken: Boolean(tokens?.access_token),
    expiryDate: tokens?.expiry_date ?? null,
    user: user
      ? {
          sub: String(user.sub || ""),
          email: String(user.email || ""),
          name: String(user.name || ""),
        }
      : null,
  });
}

async function authDebugHandler(req, res) {
  setAuthNoStore(res);
  const cookies = parseCookies(req);
  const sessionId = getSessionCookieValue(req);
  const session = sessionId ? await getSession(sessionId) : null;
  const forwardedProto = String(req?.headers?.["x-forwarded-proto"] || req?.protocol || "")
    .split(",")[0]
    .trim();
  const forwardedHost = String(req?.headers?.["x-forwarded-host"] || req?.get?.("host") || "").trim();
  res.json({
    hasSessionCookie: Boolean(sessionId),
    hasLegacyTokensCookie: Boolean(cookies?.[LEGACY_TOKENS_COOKIE_NAME]),
    hasLegacyUserCookie: Boolean(cookies?.[LEGACY_USER_COOKIE_NAME]),
    sessionIdPrefix: sessionId ? sessionId.slice(0, 8) : "",
    sessionFound: Boolean(session),
    sessionHasUser: Boolean(session?.user?.sub),
    sessionHasRefreshToken: Boolean(session?.tokens?.refresh_token),
    sessionHasAccessToken: Boolean(session?.tokens?.access_token),
    forwardedProto,
    forwardedHost,
    configuredRedirectUri: getOAuthRedirectUri(),
    _path: req.path,
    _url: req.url,
    _originalUrl: req.originalUrl,
  });
}

function authDebugSetCookieHandler(req, res) {
  setAuthNoStore(res);
  const requestedSessionId = String(req.query.sessionId || "debug-session").trim() || "debug-session";
  setSessionCookie(req, res, requestedSessionId);
  res.json({
    ok: true,
    sessionIdPrefix: requestedSessionId.slice(0, 8),
    forwardedProto: String(req?.headers?.["x-forwarded-proto"] || req?.protocol || "")
      .split(",")[0]
      .trim(),
    forwardedHost: String(req?.headers?.["x-forwarded-host"] || req?.get?.("host") || "").trim(),
    cookieAttrs: cookieAttrs(req),
  });
}

export function mountAuthRoutes(app) {
  app.get("/auth/debug", authDebugHandler);
  app.get("/api/auth/debug", authDebugHandler);
  app.get("/auth/debug/set-cookie", authDebugSetCookieHandler);
  app.get("/api/auth/debug/set-cookie", authDebugSetCookieHandler);
  app.get("/auth/google", handleAuthGoogle);
  app.get("/api/auth/google", handleAuthGoogle);
  app.get("/auth/google/callback", handleAuthCallback);
  app.get("/api/auth/google/callback", handleAuthCallback);
  app.get("/auth/me", handleAuthMe);
  app.get("/api/auth/me", handleAuthMe);
}
