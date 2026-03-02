import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { google } from "googleapis";
import crypto from "node:crypto";
import { logEvent, requestLogger, readRecentLogLines } from "./logger.js";

const IS_FIREBASE =
  Boolean(process.env.FUNCTION_TARGET) ||
  Boolean(process.env.FIREBASE_CONFIG) ||
  Boolean(process.env.K_SERVICE);

if (!IS_FIREBASE) {
  dotenv.config({ path: ".env.local" });
}

const GOOGLE_CLIENT_ID_SECRET = defineSecret("GF_GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET_SECRET = defineSecret("GF_GOOGLE_CLIENT_SECRET");
const CORS_ORIGIN_SECRET = defineSecret("GF_CORS_ORIGIN");
const FRONTEND_ORIGIN_SECRET = defineSecret("GF_FRONTEND_ORIGIN");
const OAUTH_REDIRECT_URI_SECRET = defineSecret("GF_OAUTH_REDIRECT_URI");
const SESSION_PASSWORD_SECRET = defineSecret("GF_SESSION_PASSWORD");

function readSecret(name, secretParam) {
  try {
    const v = secretParam?.value?.();
    if (v) return v;
  } catch {}
  return process.env[name] || "";
}

function readLegacyAwareSecret(gfKey, legacyKey, secretParam) {
  const v = readSecret(gfKey, secretParam);
  if (v) return v;
  return process.env[legacyKey] || "";
}

let savedTokens = null;
let warnedMissingSessionPassword = false;
let savedUser = null;

const app = express();
app.set("trust proxy", 1);
const CORS_ORIGIN =
  readLegacyAwareSecret("GF_CORS_ORIGIN", "CORS_ORIGIN", CORS_ORIGIN_SECRET) || "*";
const allowedOrigins =
  CORS_ORIGIN === "*"
    ? "*"
    : CORS_ORIGIN.split(",")
        .map((s) => s.trim())
        .filter(Boolean);

app.use(
  cors({
    credentials: true,
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (allowedOrigins === "*") return cb(null, true);
      return cb(null, allowedOrigins.includes(origin));
    },
  })
);

app.use(express.json());
app.use(requestLogger);

const PORT = 3000;
const FORM_NAME_TAG = "[gformgen:sangaku]";
const FORM_CLOSED_TAG = "[gformgen:closed]";
const APP_PROP_APP_KEY = "gformgen_app";
const APP_PROP_STATUS_KEY = "gformgen_status";
const APP_PROP_APP_VALUE = "sangaku";
const APP_PROP_STATUS_CLOSED = "closed";
const APP_PROP_OWNER_SUB_KEY = "gformgen_owner_sub";
const APP_PROP_OWNER_EMAIL_KEY = "gformgen_owner_email";
const APP_PROP_OWNER_NAME_KEY = "gformgen_owner_name";
const CLOSED_NOTICE_TITLE = "【回答受付終了】このフォームは締め切られています。";

function buildClosedNoticeDescription(host) {
  const hostLabel = String(host || "").trim() || "主催者";
  return [
    "このフォームの回答受付は終了しました。",
    "新しい回答は送信できません。",
    "",
    `ご不明な点は${hostLabel}事務局へお問い合わせください。`,
    "（TEL）0242-23-8511",
  ].join("\n");
}

function extractHostFromFormDescription(description) {
  const s = String(description || "").trim();
  const m = s.match(/【お問合せ先】\s*\n\s*(.+?)\s*事務局/);
  return m ? m[1].trim() : "";
}
const APP_PROP_TYPE_FORM_SNAPSHOT = "form_snapshot";
const APP_PROP_FORM_ID_KEY = "gformgen_form_id";
const FORM_SNAPSHOT_SCHEMA_VERSION = 1;

const APP_PROP_TYPE_KEY = "gformgen_type";
const APP_PROP_TYPE_USER_SETTINGS = "user_settings";
const APP_PROP_TYPE_TOOL_FOLDER = "tool_folder";
const APP_PROP_TYPE_SETTINGS_FOLDER = "settings_folder";
const APP_PROP_SETTINGS_KIND_KEY = "gformgen_settings_kind";
const APP_PROP_SETTINGS_BODY_VERSION_KEY = "gformgen_settings_body_version";
const SETTINGS_KIND_UNIFIED = "all";
const SETTINGS_BODY_VERSION = "1";
const DRIVE_TOOL_FOLDER_NAME = "フォーム管理ツール";
const DRIVE_SETTINGS_FOLDER_NAME = "設定ファイル";

const APP_PROP_DEFAULT_WEEKS_KEY = "gformgen_default_weeks";
const APP_PROP_DEFAULT_HOUR_KEY = "gformgen_default_hour";
const APP_PROP_DEFAULT_MINUTE_KEY = "gformgen_default_minute";
const APP_PROP_DEFAULT_DURATION_MINUTES_KEY = "gformgen_default_duration_minutes";
const APP_PROP_DEFAULT_END_HOUR_KEY = "gformgen_default_end_hour";
const APP_PROP_DEFAULT_END_MINUTE_KEY = "gformgen_default_end_minute";
const APP_PROP_DEFAULT_DEADLINE_DAYS_BEFORE_KEY = "gformgen_default_deadline_days_before";
const APP_PROP_THEME_ACCENT_KEY = "gformgen_theme_accent";
const APP_PROP_THEME_SCOPE_KEY = "gformgen_theme_scope"; // kept for backward compatibility; always "sidebar"
const APP_PROP_NAV_POSITION_KEY = "gformgen_nav_position"; // sidebar | top | bottom-left | top-left
const APP_PROP_NAV_LABEL_MODE_KEY = "gformgen_nav_label_mode"; // icon | text | both
const APP_PROP_DEFAULT_PARTICIPANT_NAME_COUNT_KEY = "gformgen_default_participant_name_count";
const APP_PROP_DEFAULT_PRICE_KEY = "gformgen_default_price";
const APP_PROP_DEFAULT_MEETING_TITLE_KEY = "gformgen_default_meeting_title";
const APP_PROP_DEFAULT_PLACE_KEY = "gformgen_default_place";
const APP_PROP_DEFAULT_HOST_KEY = "gformgen_default_host";

const THEME_SCOPE_ACCENT = "accent";
const THEME_SCOPE_SIDEBAR = "sidebar";

function normalizeHexColor(input) {
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

function normalizeToHalfWidthDigits(s) {
  return String(s ?? "").replace(/[０-９]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0)
  );
}

function parseIntInRange(v, { min, max } = {}) {
  const normalized = normalizeToHalfWidthDigits(v);
  const n = Number.parseInt(normalized, 10);
  if (!Number.isFinite(n)) return null;
  if (typeof min === "number" && n < min) return null;
  if (typeof max === "number" && n > max) return null;
  return n;
}

function getDefaultScheduleFromProps(appProperties) {
  const props = appProperties || {};
  const weeksOffset = parseIntInRange(props?.[APP_PROP_DEFAULT_WEEKS_KEY], { min: 1, max: 6 }) ?? 6;
  const hour = parseIntInRange(props?.[APP_PROP_DEFAULT_HOUR_KEY], { min: 0, max: 23 }) ?? 15;
  const minute = parseIntInRange(props?.[APP_PROP_DEFAULT_MINUTE_KEY], { min: 0, max: 59 }) ?? 0;
  const deadlineDaysBefore =
    parseIntInRange(props?.[APP_PROP_DEFAULT_DEADLINE_DAYS_BEFORE_KEY], { min: 1, max: 14 }) ?? 2;
  const legacyDurationMinutes =
    parseIntInRange(props?.[APP_PROP_DEFAULT_DURATION_MINUTES_KEY], { min: 15, max: 480 }) ?? 60;
  let endHour = parseIntInRange(props?.[APP_PROP_DEFAULT_END_HOUR_KEY], { min: 0, max: 23 });
  let endMinute = parseIntInRange(props?.[APP_PROP_DEFAULT_END_MINUTE_KEY], { min: 0, max: 59 });
  if (endMinute != null && endMinute % 15 !== 0) endMinute = null;
  if (endHour == null || endMinute == null) {
    const totalStartMinutes = hour * 60 + minute;
    const totalEndMinutes = totalStartMinutes + legacyDurationMinutes;
    endHour = Math.floor((totalEndMinutes % (24 * 60)) / 60);
    endMinute = totalEndMinutes % 60;
  }
  return { weeksOffset, hour, minute, endHour, endMinute, deadlineDaysBefore };
}

const VALID_NAV_POSITIONS = ["sidebar", "bottom-left", "top-left"];
const VALID_NAV_LABEL_MODES = ["icon", "text", "both"];

function getThemeFromProps(appProperties) {
  const props = appProperties || {};
  const accent = normalizeHexColor(props?.[APP_PROP_THEME_ACCENT_KEY]) || "#6b7280";
  const navPosition = VALID_NAV_POSITIONS.includes(props?.[APP_PROP_NAV_POSITION_KEY])
    ? props[APP_PROP_NAV_POSITION_KEY]
    : "sidebar";
  const navLabelMode = VALID_NAV_LABEL_MODES.includes(props?.[APP_PROP_NAV_LABEL_MODE_KEY])
    ? props[APP_PROP_NAV_LABEL_MODE_KEY]
    : "icon";
  return { accent, scope: THEME_SCOPE_SIDEBAR, navPosition, navLabelMode };
}

function getFormDefaultsFromProps(appProperties) {
  const props = appProperties || {};
  const participantNameCount =
    parseIntInRange(props?.[APP_PROP_DEFAULT_PARTICIPANT_NAME_COUNT_KEY], { min: 1, max: 20 }) ??
    1;
  const defaultPrice = parseIntInRange(props?.[APP_PROP_DEFAULT_PRICE_KEY], { min: 0, max: 99999999 }) ?? 0;
  const defaultMeetingTitle =
    String(props?.[APP_PROP_DEFAULT_MEETING_TITLE_KEY] || "").trim() ||
    "会津産学懇話会 月定例会";
  const defaultPlace =
    String(props?.[APP_PROP_DEFAULT_PLACE_KEY] || "").trim() || "会津若松ワシントンホテル";
  const defaultHost =
    String(props?.[APP_PROP_DEFAULT_HOST_KEY] || "").trim() || "会津産学懇話会";
  return { participantNameCount, defaultPrice, defaultMeetingTitle, defaultPlace, defaultHost };
}

function buildUnifiedSettingsFileContent(appProperties) {
  const props = appProperties || {};
  return {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    defaultSchedule: getDefaultScheduleFromProps(props),
    theme: getThemeFromProps(props),
    formDefaults: getFormDefaultsFromProps(props),
  };
}

function buildUserSettingsBasePatch(authUser) {
  const sub = String(authUser?.sub || "").trim();
  if (!sub) throw new Error("Missing auth user sub");
  return {
    [APP_PROP_APP_KEY]: APP_PROP_APP_VALUE,
    [APP_PROP_TYPE_KEY]: APP_PROP_TYPE_USER_SETTINGS,
    [APP_PROP_SETTINGS_KIND_KEY]: SETTINGS_KIND_UNIFIED,
    [APP_PROP_SETTINGS_BODY_VERSION_KEY]: SETTINGS_BODY_VERSION,
    [APP_PROP_OWNER_SUB_KEY]: sub,
    ...(authUser?.email ? { [APP_PROP_OWNER_EMAIL_KEY]: String(authUser.email) } : {}),
    ...(authUser?.name ? { [APP_PROP_OWNER_NAME_KEY]: String(authUser.name) } : {}),
  };
}

async function listUserSettingsFiles({ drive, authUser }) {
  const sub = String(authUser?.sub || "").trim();
  if (!sub) return [];
  const q = [
    "trashed = false",
    `appProperties has { key='${APP_PROP_APP_KEY}' and value='${APP_PROP_APP_VALUE}' }`,
    `appProperties has { key='${APP_PROP_TYPE_KEY}' and value='${APP_PROP_TYPE_USER_SETTINGS}' }`,
    `appProperties has { key='${APP_PROP_OWNER_SUB_KEY}' and value='${sub}' }`,
  ].join(" and ");
  const result = await drive.files.list({
    q,
    orderBy: "modifiedTime desc",
    pageSize: 100,
    fields: "files(id,name,modifiedTime,appProperties,parents)",
  });
  return result?.data?.files || [];
}

async function markDriveFileAsTrashedSafe({ drive, fileId }) {
  if (!String(fileId || "").trim()) return;
  try {
    await drive.files.update({
      fileId,
      requestBody: { trashed: true },
      fields: "id",
    });
  } catch {}
}

async function ensureUnifiedUserSettingsFile({
  drive,
  authUser,
  createIfMissing = false,
}) {
  const basePatch = buildUserSettingsBasePatch(authUser);
  const settingsFolderId = await ensureSettingsFolderId({ drive, authUser });
  const files = await listUserSettingsFiles({ drive, authUser });
  const unifiedFiles = files.filter(
    (f) => String(f?.appProperties?.[APP_PROP_SETTINGS_KIND_KEY] || "") === SETTINGS_KIND_UNIFIED
  );
  const legacyFiles = files.filter(
    (f) => String(f?.appProperties?.[APP_PROP_SETTINGS_KIND_KEY] || "") !== SETTINGS_KIND_UNIFIED
  );

  if (!createIfMissing && unifiedFiles.length === 0 && legacyFiles.length === 0) {
    return { file: null, migrated: false };
  }

  let canonical = unifiedFiles?.[0] || null;

  if (!canonical && legacyFiles.length === 0 && createIfMissing) {
    const created = await drive.files.create({
      requestBody: {
        name: "gformgen_user_settings.json",
        mimeType: "application/json",
        appProperties: basePatch,
        parents: settingsFolderId ? [settingsFolderId] : undefined,
      },
      media: {
        mimeType: "application/json",
        body: JSON.stringify(buildUnifiedSettingsFileContent(basePatch), null, 2),
      },
      fields: "id,appProperties,parents",
    });
    return {
      file: { id: created?.data?.id || "", appProperties: created?.data?.appProperties || basePatch },
      migrated: false,
    };
  }

  const needsMigration = legacyFiles.length > 0 || unifiedFiles.length > 1;
  if (!needsMigration && canonical?.id) {
    const nextProps = mergeAppProperties(canonical?.appProperties || {}, basePatch);
    const currentProps = canonical?.appProperties || {};
    const needsPatch = Object.keys(basePatch).some(
      (k) => String(currentProps?.[k] || "") !== String(nextProps?.[k] || "")
    );
    const updated = needsPatch
      ? await drive.files.update({
          fileId: canonical.id,
          requestBody: { appProperties: nextProps },
          media: {
            mimeType: "application/json",
            body: JSON.stringify(buildUnifiedSettingsFileContent(nextProps), null, 2),
          },
          fields: "id,appProperties,parents",
        })
      : null;
    if (settingsFolderId) {
      await moveFileIntoFolderIfNeeded({ drive, fileId: canonical.id, folderId: settingsFolderId });
    }
    return {
      file: {
        id: updated?.data?.id || canonical.id,
        appProperties: updated?.data?.appProperties || (needsPatch ? nextProps : currentProps),
      },
      migrated: false,
    };
  }

  const mergeTargets = [...files].sort((a, b) => {
    const ta = Date.parse(String(a?.modifiedTime || "")) || 0;
    const tb = Date.parse(String(b?.modifiedTime || "")) || 0;
    return ta - tb;
  });
  const mergedProps = mergeTargets.reduce(
    (acc, f) => mergeAppProperties(acc, f?.appProperties || {}),
    {}
  );
  const finalProps = mergeAppProperties(mergedProps, basePatch);

  if (canonical?.id) {
    const updated = await drive.files.update({
      fileId: canonical.id,
      requestBody: { appProperties: finalProps },
      media: {
        mimeType: "application/json",
        body: JSON.stringify(buildUnifiedSettingsFileContent(finalProps), null, 2),
      },
      fields: "id,appProperties,parents",
    });
    canonical = { id: updated?.data?.id || canonical.id, appProperties: updated?.data?.appProperties || finalProps };
  } else {
    const created = await drive.files.create({
      requestBody: {
        name: "gformgen_user_settings.json",
        mimeType: "application/json",
        appProperties: finalProps,
        parents: settingsFolderId ? [settingsFolderId] : undefined,
      },
      media: {
        mimeType: "application/json",
        body: JSON.stringify(buildUnifiedSettingsFileContent(finalProps), null, 2),
      },
      fields: "id,appProperties,parents",
    });
    canonical = { id: created?.data?.id || "", appProperties: created?.data?.appProperties || finalProps };
  }

  if (settingsFolderId && canonical?.id) {
    await moveFileIntoFolderIfNeeded({ drive, fileId: canonical.id, folderId: settingsFolderId });
  }

  const staleFileIds = files
    .map((f) => String(f?.id || "").trim())
    .filter((id) => id && id !== String(canonical?.id || "").trim());
  for (const fileId of staleFileIds) {
    await markDriveFileAsTrashedSafe({ drive, fileId });
  }

  return { file: canonical, migrated: true };
}

async function upsertUnifiedUserSettingsPatch({ drive, authUser, patch }) {
  const ensured = await ensureUnifiedUserSettingsFile({ drive, authUser, createIfMissing: true });
  if (!ensured?.file?.id) throw new Error("Failed to prepare user settings file");
  const nextProps = mergeAppProperties(ensured.file.appProperties || {}, patch || {});
  const updated = await drive.files.update({
    fileId: ensured.file.id,
    requestBody: { appProperties: nextProps },
    media: {
      mimeType: "application/json",
      body: JSON.stringify(buildUnifiedSettingsFileContent(nextProps), null, 2),
    },
    fields: "id,appProperties",
  });
  return {
    fileId: updated?.data?.id || ensured.file.id,
    appProperties: updated?.data?.appProperties || nextProps,
  };
}

async function upsertThemeSettings({
  drive,
  authUser,
  accent,
  scope,
  navPosition = "sidebar",
  navLabelMode = "icon",
}) {
  const basePatch = buildUserSettingsBasePatch(authUser);
  const patch = {
    ...basePatch,
    [APP_PROP_THEME_ACCENT_KEY]: String(accent),
    [APP_PROP_THEME_SCOPE_KEY]: String(scope),
    [APP_PROP_NAV_POSITION_KEY]: String(navPosition),
    [APP_PROP_NAV_LABEL_MODE_KEY]: String(navLabelMode),
  };
  const result = await upsertUnifiedUserSettingsPatch({ drive, authUser, patch });
  return {
    fileId: result.fileId,
    settings: getThemeFromProps(result.appProperties),
  };
}

async function upsertFormDefaultsSettings({
  drive,
  authUser,
  participantNameCount,
  defaultPrice,
  defaultMeetingTitle,
  defaultPlace,
  defaultHost,
}) {
  const basePatch = buildUserSettingsBasePatch(authUser);
  const patch = {
    ...basePatch,
    [APP_PROP_DEFAULT_PARTICIPANT_NAME_COUNT_KEY]: String(participantNameCount),
    [APP_PROP_DEFAULT_PRICE_KEY]: String(defaultPrice),
    [APP_PROP_DEFAULT_MEETING_TITLE_KEY]: String(defaultMeetingTitle || ""),
    [APP_PROP_DEFAULT_PLACE_KEY]: String(defaultPlace || ""),
    [APP_PROP_DEFAULT_HOST_KEY]: String(defaultHost || ""),
  };
  const result = await upsertUnifiedUserSettingsPatch({ drive, authUser, patch });
  return {
    fileId: result.fileId,
    settings: getFormDefaultsFromProps(result.appProperties),
  };
}

async function upsertDefaultScheduleSettings({
  drive,
  authUser,
  weeksOffset,
  hour,
  minute,
  endHour,
  endMinute,
  deadlineDaysBefore,
}) {
  const basePatch = buildUserSettingsBasePatch(authUser);
  const patch = {
    ...basePatch,
    [APP_PROP_DEFAULT_WEEKS_KEY]: String(weeksOffset),
    [APP_PROP_DEFAULT_HOUR_KEY]: String(hour),
    [APP_PROP_DEFAULT_MINUTE_KEY]: String(minute),
    [APP_PROP_DEFAULT_END_HOUR_KEY]: String(endHour),
    [APP_PROP_DEFAULT_END_MINUTE_KEY]: String(endMinute),
    [APP_PROP_DEFAULT_DEADLINE_DAYS_BEFORE_KEY]: String(deadlineDaysBefore),
  };
  const result = await upsertUnifiedUserSettingsPatch({ drive, authUser, patch });
  return {
    fileId: result.fileId,
    settings: getDefaultScheduleFromProps(result.appProperties),
  };
}

const FALLBACK_OAUTH_REDIRECT_URI =
  readLegacyAwareSecret(
    "GF_OAUTH_REDIRECT_URI",
    "OAUTH_REDIRECT_URI",
    OAUTH_REDIRECT_URI_SECRET
  ) ||
  "https://example.invalid/oauth2/callback";

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

function makeOAuthClient(redirectUri) {
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

function makeAuthedOAuthClientOrNull(req) {
  const tokens = getTokens(req);
  if (!tokens?.access_token && !tokens?.refresh_token) return null;
  const client = makeOAuthClient(FALLBACK_OAUTH_REDIRECT_URI);
  client.setCredentials(tokens);
  return client;
}

function parseCookies(req) {
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
  const key = crypto.createHash("sha256").update(secret).digest(); // 32 bytes
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

function setUserCookie(req, res, user) {
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

function clearUserCookie(req, res) {
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

function getSavedUser(req) {
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

async function fetchGoogleUserInfo(authClient) {
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

function userFromIdToken(tokens) {
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

async function getAuthUserOrNull(req, res) {
  const cached = getSavedUser(req);
  if (cached?.sub) return cached;

  // Fast path: derive from id_token (no extra network call).
  const tokens = getTokens(req);
  const fromIdToken = userFromIdToken(tokens);
  if (fromIdToken?.sub) {
    if (!getSessionSecret()) savedUser = fromIdToken; // fallback only
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
      // fallback only (when no cookie secret)
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

async function enforceOwnerAccess({ req, res, drive, formId, requireApp = true }) {
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

  // Legacy/backfill: if the Drive file is owned by current user, allow and backfill owner props.
  if (file?.ownedByMe === true) {
    const nextProps = mergeAppProperties(
      props,
      buildOwnerAppPropertiesPatch(props, authUser, true)
    );
    // best-effort backfill
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

function getTokens(req) {
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

async function setTokens(req, res, tokens) {
  try {
    const ok = setAuthCookie(req, res, tokens);
    if (!ok) {
      savedTokens = tokens;
    }
  } catch {
    savedTokens = tokens;
  }
}

async function clearTokens(req, res) {
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

function handleAuthGoogle(req, res) {
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

app.get("/auth/google", handleAuthGoogle);
app.get("/api/auth/google", handleAuthGoogle);

async function handleAuthCallback(req, res) {
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
        savedUser = fromIdToken; // fallback only
        setUserCookie(req, res, fromIdToken);
      }

      const client = makeOAuthClient(redirectUri);
      client.setCredentials(tokens);
      const user = await fetchGoogleUserInfo(client);
      if (user?.sub) {
        savedUser = user; // fallback only
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

app.get("/auth/google/callback", handleAuthCallback);
app.get("/api/auth/google/callback", handleAuthCallback);

async function handleAuthMe(req, res) {
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

app.get("/auth/me", handleAuthMe);
app.get("/api/auth/me", handleAuthMe);

app.get("/api/user-settings/default-schedule", async (req, res) => {
  try {
    const savedTokens = getTokens(req);
    if (!savedTokens) return res.status(401).json({ error: "Not logged in" });
    const authClient = makeAuthedOAuthClientOrNull(req);
    if (!authClient) return res.status(401).json({ error: "Not logged in" });
    const authUser = await getAuthUserOrNull(req, res);
    if (!authUser?.sub) return res.status(401).json({ error: "Not logged in" });

    const drive = google.drive({ version: "v3", auth: authClient });
    const { file } = await ensureUnifiedUserSettingsFile({
      drive,
      authUser,
      createIfMissing: false,
    });
    const settings = getDefaultScheduleFromProps(file?.appProperties);
    return res.json({ settings, hasSaved: Boolean(file?.id) });
  } catch (err) {
    console.error(err);
    const { status, message } = extractGoogleApiError(err);
    return res
      .status(status || 500)
      .json({ error: message || "Failed to get settings" });
  }
});

app.post("/api/user-settings/default-schedule", async (req, res) => {
  try {
    const savedTokens = getTokens(req);
    if (!savedTokens) return res.status(401).json({ error: "Not logged in" });
    const authClient = makeAuthedOAuthClientOrNull(req);
    if (!authClient) return res.status(401).json({ error: "Not logged in" });
    const authUser = await getAuthUserOrNull(req, res);
    if (!authUser?.sub) return res.status(401).json({ error: "Not logged in" });

    const weeksOffset =
      parseIntInRange(req?.body?.weeksOffset, { min: 1, max: 6 }) ?? null;
    const hour = parseIntInRange(req?.body?.hour, { min: 7, max: 19 }) ?? null;
    const minute = parseIntInRange(req?.body?.minute, { min: 0, max: 59 }) ?? null;
    const endHour = parseIntInRange(req?.body?.endHour, { min: 7, max: 22 }) ?? null;
    const endMinute = parseIntInRange(req?.body?.endMinute, { min: 0, max: 59 }) ?? null;
    const deadlineDaysBefore =
      parseIntInRange(req?.body?.deadlineDaysBefore, { min: 1, max: 14 }) ?? null;

    if (
      weeksOffset == null ||
      hour == null ||
      minute == null ||
      endHour == null ||
      endMinute == null ||
      deadlineDaysBefore == null ||
      minute % 15 !== 0 ||
      endMinute % 15 !== 0
    ) {
      return res.status(400).json({ error: "Invalid settings payload" });
    }

    const drive = google.drive({ version: "v3", auth: authClient });
    const result = await upsertDefaultScheduleSettings({
      drive,
      authUser,
      weeksOffset,
      hour,
      minute,
      endHour,
      endMinute,
      deadlineDaysBefore,
    });
    return res.json({ ok: true, settings: result.settings });
  } catch (err) {
    console.error(err);
    const { status, message } = extractGoogleApiError(err);
    return res
      .status(status || 500)
      .json({ error: message || "Failed to save settings" });
  }
});

app.get("/api/user-settings/theme", async (req, res) => {
  try {
    const savedTokens = getTokens(req);
    if (!savedTokens) return res.status(401).json({ error: "Not logged in" });
    const authClient = makeAuthedOAuthClientOrNull(req);
    if (!authClient) return res.status(401).json({ error: "Not logged in" });
    const authUser = await getAuthUserOrNull(req, res);
    if (!authUser?.sub) return res.status(401).json({ error: "Not logged in" });

    const drive = google.drive({ version: "v3", auth: authClient });
    const { file } = await ensureUnifiedUserSettingsFile({
      drive,
      authUser,
      createIfMissing: false,
    });
    const settings = getThemeFromProps(file?.appProperties);
    return res.json({ settings, hasSaved: Boolean(file?.id) });
  } catch (err) {
    console.error(err);
    const { status, message } = extractGoogleApiError(err);
    return res.status(status || 500).json({ error: message || "Failed to get theme" });
  }
});

app.post("/api/user-settings/theme", async (req, res) => {
  try {
    const savedTokens = getTokens(req);
    if (!savedTokens) return res.status(401).json({ error: "Not logged in" });
    const authClient = makeAuthedOAuthClientOrNull(req);
    if (!authClient) return res.status(401).json({ error: "Not logged in" });
    const authUser = await getAuthUserOrNull(req, res);
    if (!authUser?.sub) return res.status(401).json({ error: "Not logged in" });

    const accent = normalizeHexColor(req?.body?.accent) || "";
    const scope = THEME_SCOPE_SIDEBAR;
    if (!accent) return res.status(400).json({ error: "Invalid accent color" });

    const navPosition = VALID_NAV_POSITIONS.includes(req?.body?.navPosition)
      ? req.body.navPosition
      : "sidebar";
    const navLabelMode = VALID_NAV_LABEL_MODES.includes(req?.body?.navLabelMode)
      ? req.body.navLabelMode
      : "icon";

    const drive = google.drive({ version: "v3", auth: authClient });
    const result = await upsertThemeSettings({
      drive,
      authUser,
      accent,
      scope,
      navPosition,
      navLabelMode,
    });
    return res.json({ ok: true, settings: result.settings });
  } catch (err) {
    console.error(err);
    const { status, message } = extractGoogleApiError(err);
    return res.status(status || 500).json({ error: message || "Failed to save theme" });
  }
});

app.get("/api/user-settings/form-defaults", async (req, res) => {
  try {
    const savedTokens = getTokens(req);
    if (!savedTokens) return res.status(401).json({ error: "Not logged in" });
    const authClient = makeAuthedOAuthClientOrNull(req);
    if (!authClient) return res.status(401).json({ error: "Not logged in" });
    const authUser = await getAuthUserOrNull(req, res);
    if (!authUser?.sub) return res.status(401).json({ error: "Not logged in" });

    const drive = google.drive({ version: "v3", auth: authClient });
    const { file } = await ensureUnifiedUserSettingsFile({
      drive,
      authUser,
      createIfMissing: false,
    });
    const settings = getFormDefaultsFromProps(file?.appProperties);
    return res.json({ settings, hasSaved: Boolean(file?.id) });
  } catch (err) {
    console.error(err);
    const { status, message } = extractGoogleApiError(err);
    return res
      .status(status || 500)
      .json({ error: message || "Failed to get form defaults" });
  }
});

app.post("/api/user-settings/form-defaults", async (req, res) => {
  try {
    const savedTokens = getTokens(req);
    if (!savedTokens) return res.status(401).json({ error: "Not logged in" });
    const authClient = makeAuthedOAuthClientOrNull(req);
    if (!authClient) return res.status(401).json({ error: "Not logged in" });
    const authUser = await getAuthUserOrNull(req, res);
    if (!authUser?.sub) return res.status(401).json({ error: "Not logged in" });

    const participantNameCount =
      parseIntInRange(req?.body?.participantNameCount, { min: 1, max: 20 }) ?? null;
    const parsedDefaultPrice = parseIntInRange(req?.body?.defaultPrice, { min: 0, max: 99999999 });
    const defaultPrice = parsedDefaultPrice == null ? 0 : parsedDefaultPrice;
    const defaultMeetingTitle = String(req?.body?.defaultMeetingTitle || "").trim();
    const defaultPlace = String(req?.body?.defaultPlace || "").trim();
    const defaultHost = String(req?.body?.defaultHost || "").trim();
    if (participantNameCount == null) {
      return res.status(400).json({ error: "Invalid settings payload" });
    }
    if (defaultMeetingTitle.length > 120 || defaultPlace.length > 120 || defaultHost.length > 120) {
      return res.status(400).json({ error: "Invalid settings payload" });
    }

    const drive = google.drive({ version: "v3", auth: authClient });
    const result = await upsertFormDefaultsSettings({
      drive,
      authUser,
      participantNameCount,
      defaultPrice,
      defaultMeetingTitle,
      defaultPlace,
      defaultHost,
    });
    return res.json({ ok: true, settings: result.settings });
  } catch (err) {
    console.error(err);
    const { status, message } = extractGoogleApiError(err);
    return res
      .status(status || 500)
      .json({ error: message || "Failed to save form defaults" });
  }
});

app.post("/api/user-settings/all", async (req, res) => {
  try {
    const savedTokens = getTokens(req);
    if (!savedTokens) return res.status(401).json({ error: "Not logged in" });
    const authClient = makeAuthedOAuthClientOrNull(req);
    if (!authClient) return res.status(401).json({ error: "Not logged in" });
    const authUser = await getAuthUserOrNull(req, res);
    if (!authUser?.sub) return res.status(401).json({ error: "Not logged in" });

    const body = req?.body || {};
    const schedule = body.defaultSchedule || {};
    const formDefaults = body.formDefaults || {};
    const theme = body.theme || {};

    const weeksOffset =
      parseIntInRange(schedule.weeksOffset, { min: 1, max: 6 }) ?? 6;
    const hour = parseIntInRange(schedule.hour, { min: 7, max: 19 }) ?? 15;
    let minute = parseIntInRange(schedule.minute, { min: 0, max: 59 }) ?? 0;
    const endHour = parseIntInRange(schedule.endHour, { min: 7, max: 22 }) ?? 16;
    let endMinute = parseIntInRange(schedule.endMinute, { min: 0, max: 59 }) ?? 0;
    if (minute % 15 !== 0) minute = Math.round(minute / 15) * 15;
    if (endMinute % 15 !== 0) endMinute = Math.round(endMinute / 15) * 15;
    const deadlineDaysBefore =
      parseIntInRange(schedule.deadlineDaysBefore, { min: 1, max: 14 }) ?? 2;

    const participantNameCount =
      parseIntInRange(formDefaults.participantNameCount, { min: 1, max: 20 }) ?? 1;
    const defaultPrice =
      parseIntInRange(formDefaults.defaultPrice, { min: 0, max: 99999999 }) ?? 0;
    const defaultMeetingTitle =
      String(formDefaults.defaultMeetingTitle || "").trim().slice(0, 120) ||
      "会津産学懇話会 月定例会";
    const defaultPlace =
      String(formDefaults.defaultPlace || "").trim().slice(0, 120) ||
      "会津若松ワシントンホテル";
    const defaultHost =
      String(formDefaults.defaultHost || "").trim().slice(0, 120) ||
      "会津産学懇話会";

    const accent =
      normalizeHexColor(theme.accent) ||
      normalizeHexColor(process.env.GF_THEME_ACCENT) ||
      "#6b7280";
    const navPosition = VALID_NAV_POSITIONS.includes(theme.navPosition)
      ? theme.navPosition
      : "sidebar";
    const navLabelMode = VALID_NAV_LABEL_MODES.includes(theme.navLabelMode)
      ? theme.navLabelMode
      : "icon";

    const basePatch = buildUserSettingsBasePatch(authUser);
    const patch = {
      ...basePatch,
      [APP_PROP_DEFAULT_WEEKS_KEY]: String(weeksOffset),
      [APP_PROP_DEFAULT_HOUR_KEY]: String(hour),
      [APP_PROP_DEFAULT_MINUTE_KEY]: String(minute),
      [APP_PROP_DEFAULT_END_HOUR_KEY]: String(endHour),
      [APP_PROP_DEFAULT_END_MINUTE_KEY]: String(endMinute),
      [APP_PROP_DEFAULT_DEADLINE_DAYS_BEFORE_KEY]: String(deadlineDaysBefore),
      [APP_PROP_DEFAULT_PARTICIPANT_NAME_COUNT_KEY]: String(participantNameCount),
      [APP_PROP_DEFAULT_PRICE_KEY]: String(defaultPrice),
      [APP_PROP_DEFAULT_MEETING_TITLE_KEY]: defaultMeetingTitle,
      [APP_PROP_DEFAULT_PLACE_KEY]: defaultPlace,
      [APP_PROP_DEFAULT_HOST_KEY]: defaultHost,
      [APP_PROP_THEME_ACCENT_KEY]: accent,
      [APP_PROP_THEME_SCOPE_KEY]: THEME_SCOPE_SIDEBAR,
      [APP_PROP_NAV_POSITION_KEY]: navPosition,
      [APP_PROP_NAV_LABEL_MODE_KEY]: navLabelMode,
    };

    const drive = google.drive({ version: "v3", auth: authClient });
    const result = await upsertUnifiedUserSettingsPatch({ drive, authUser, patch });

    return res.json({
      ok: true,
      settings: {
        defaultSchedule: getDefaultScheduleFromProps(result.appProperties),
        formDefaults: getFormDefaultsFromProps(result.appProperties),
        theme: getThemeFromProps(result.appProperties),
      },
    });
  } catch (err) {
    console.error(err);
    const { status, message } = extractGoogleApiError(err);
    return res
      .status(status || 500)
      .json({ error: message || "Failed to save settings" });
  }
});

const formatDateJP = (isoString, withTime = false) => {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (!Number.isFinite(d.getTime())) return "";

  // IMPORTANT:
  // Frontend sends `toISOString()` (UTC). Backend often runs in UTC (Cloud Functions),
  // so using `getHours()` would show UTC time. We must render in JST for user-facing text.
  const dateParts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).formatToParts(d);

  const map = {};
  for (const p of dateParts) {
    if (p?.type && p.type !== "literal") map[p.type] = p.value;
  }
  const y = map.year || "";
  const m = map.month || "";
  const day = map.day || "";
  // ja-JP weekday short is like "月", "火", ...
  const w = map.weekday || "";

  if (withTime) {
    const timeParts = new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(d);
    const t = {};
    for (const p of timeParts) {
      if (p?.type && p.type !== "literal") t[p.type] = p.value;
    }
    const hh = String(t.hour || "").padStart(2, "0");
    const mm = String(t.minute || "").padStart(2, "0");
    return `${y}年${m}月${day}日（${w}）${hh}:${mm}`;
  }

  return `${y}年${m}月${day}日（${w}）`;
};

const formatTimeJP = (isoString) => {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (!Number.isFinite(d.getTime())) return "";
  const timeParts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const t = {};
  for (const p of timeParts) {
    if (p?.type && p.type !== "literal") t[p.type] = p.value;
  }
  const hh = String(t.hour || "").padStart(2, "0");
  const mm = String(t.minute || "").padStart(2, "0");
  return `${hh}:${mm}`;
};

const formatDateTimeRangeJP = (startIso, endIso) => {
  const start = String(startIso || "").trim();
  const end = String(endIso || "").trim();
  if (!start) return "";
  if (!end) return formatDateJP(start, true);

  const startDate = formatDateJP(start, false);
  const endDate = formatDateJP(end, false);
  const startTime = formatTimeJP(start);
  const endTime = formatTimeJP(end);
  if (!startDate || !startTime || !endDate || !endTime) return formatDateJP(start, true);
  if (startDate === endDate) return `${startDate}${startTime}〜${endTime}`;
  return `${formatDateJP(start, true)}〜${formatDateJP(end, true)}`;
};

async function listAllFormResponses(forms, formId) {
  const responses = [];
  let nextPageToken = undefined;

  do {
    const result = await forms.forms.responses.list({
      formId,
      pageSize: 200,
      pageToken: nextPageToken,
    });

    const pageResponses = result?.data?.responses || [];
    responses.push(...pageResponses);
    nextPageToken = result?.data?.nextPageToken;
  } while (nextPageToken);

  return { responses, nextPageToken: null };
}

async function buildQuestionIdToTitleMap(forms, formId) {
  const result = await forms.forms.get({ formId });
  const items = result?.data?.items || [];

  /** @type {Map<string, string>} */
  const map = new Map();

  for (const item of items) {
    const questionId = item?.questionItem?.question?.questionId;
    const title = item?.title;
    if (!questionId || !title) continue;
    map.set(String(questionId), String(title));
  }

  return map;
}

function streamToString(stream) {
  return new Promise((resolve, reject) => {
    let data = "";
    stream.on("data", (chunk) => (data += chunk));
    stream.on("end", () => resolve(data));
    stream.on("error", reject);
  });
}

async function findFormSnapshotFileOrNull({ drive, formId }) {
  const id = String(formId || "").trim();
  if (!id) return null;
  const q = [
    "trashed = false",
    `appProperties has { key='${APP_PROP_APP_KEY}' and value='${APP_PROP_APP_VALUE}' }`,
    `appProperties has { key='${APP_PROP_TYPE_KEY}' and value='${APP_PROP_TYPE_FORM_SNAPSHOT}' }`,
    `appProperties has { key='${APP_PROP_FORM_ID_KEY}' and value='${id}' }`,
  ].join(" and ");
  const result = await drive.files.list({
    q,
    orderBy: "modifiedTime desc",
    pageSize: 5,
    fields: "files(id,name,modifiedTime,appProperties)",
  });
  const files = result?.data?.files || [];
  return files?.[0] || null;
}

async function readDriveJsonFileOrNull(drive, fileId) {
  const id = String(fileId || "").trim();
  if (!id) return null;
  const r = await drive.files.get(
    { fileId: id, alt: "media" },
    { responseType: "stream" }
  );
  const text = await streamToString(r?.data);
  try {
    return JSON.parse(String(text || ""));
  } catch {
    return null;
  }
}

async function upsertFormSnapshot({ drive, authUser, formId, questionIdToTitle }) {
  const id = String(formId || "").trim();
  if (!id) return { ok: false };
  const settingsFolderId = await ensureSettingsFolderId({ drive, authUser });
  const existing = await findFormSnapshotFileOrNull({ drive, formId: id });
  const payload = {
    schemaVersion: FORM_SNAPSHOT_SCHEMA_VERSION,
    formId: id,
    createdAt: new Date().toISOString(),
    questionIdToTitle,
  };
  const patch = {
    [APP_PROP_APP_KEY]: APP_PROP_APP_VALUE,
    [APP_PROP_TYPE_KEY]: APP_PROP_TYPE_FORM_SNAPSHOT,
    [APP_PROP_FORM_ID_KEY]: id,
    ...(authUser?.sub ? { [APP_PROP_OWNER_SUB_KEY]: String(authUser.sub) } : {}),
    ...(authUser?.email ? { [APP_PROP_OWNER_EMAIL_KEY]: String(authUser.email) } : {}),
    ...(authUser?.name ? { [APP_PROP_OWNER_NAME_KEY]: String(authUser.name) } : {}),
  };

  if (!existing?.id) {
    const created = await drive.files.create({
      requestBody: {
        name: `gformgen_form_snapshot_${id}.json`,
        mimeType: "application/json",
        appProperties: patch,
        parents: settingsFolderId ? [settingsFolderId] : undefined,
      },
      media: {
        mimeType: "application/json",
        body: JSON.stringify(payload, null, 2),
      },
      fields: "id",
    });
    return { ok: Boolean(created?.data?.id), fileId: created?.data?.id || "" };
  }

  const nextProps = mergeAppProperties(existing?.appProperties || {}, patch);
  await drive.files.update({
    fileId: existing.id,
    requestBody: {
      appProperties: nextProps,
    },
    media: {
      mimeType: "application/json",
      body: JSON.stringify(payload, null, 2),
    },
    fields: "id",
  });
  if (settingsFolderId && existing?.id) {
    await moveFileIntoFolderIfNeeded({ drive, fileId: existing.id, folderId: settingsFolderId });
  }
  return { ok: true, fileId: existing.id };
}

async function findToolFolderOrNull({ drive, authUser }) {
  const sub = String(authUser?.sub || "").trim();
  if (!sub) return null;
  const q = [
    "trashed = false",
    "mimeType = 'application/vnd.google-apps.folder'",
    `name = '${DRIVE_TOOL_FOLDER_NAME}'`,
    `appProperties has { key='${APP_PROP_APP_KEY}' and value='${APP_PROP_APP_VALUE}' }`,
    `appProperties has { key='${APP_PROP_TYPE_KEY}' and value='${APP_PROP_TYPE_TOOL_FOLDER}' }`,
    `appProperties has { key='${APP_PROP_OWNER_SUB_KEY}' and value='${sub}' }`,
  ].join(" and ");
  const result = await drive.files.list({
    q,
    orderBy: "modifiedTime desc",
    pageSize: 5,
    fields: "files(id,name,modifiedTime,appProperties)",
  });
  const files = result?.data?.files || [];
  return files?.[0] || null;
}

async function ensureToolFolderId({ drive, authUser }) {
  const found = await findToolFolderOrNull({ drive, authUser });
  if (found?.id) return String(found.id);
  const sub = String(authUser?.sub || "").trim();
  if (!sub) return "";
  const patch = {
    [APP_PROP_APP_KEY]: APP_PROP_APP_VALUE,
    [APP_PROP_TYPE_KEY]: APP_PROP_TYPE_TOOL_FOLDER,
    [APP_PROP_OWNER_SUB_KEY]: sub,
    ...(authUser?.email ? { [APP_PROP_OWNER_EMAIL_KEY]: String(authUser.email) } : {}),
    ...(authUser?.name ? { [APP_PROP_OWNER_NAME_KEY]: String(authUser.name) } : {}),
  };
  const created = await drive.files.create({
    requestBody: {
      name: DRIVE_TOOL_FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
      appProperties: patch,
    },
    fields: "id",
  });
  return String(created?.data?.id || "");
}

async function findSettingsFolderOrNull({ drive, authUser, toolFolderId }) {
  const sub = String(authUser?.sub || "").trim();
  const parentId = String(toolFolderId || "").trim();
  if (!sub || !parentId) return null;
  const q = [
    "trashed = false",
    "mimeType = 'application/vnd.google-apps.folder'",
    `'${parentId}' in parents`,
    `name = '${DRIVE_SETTINGS_FOLDER_NAME}'`,
    `appProperties has { key='${APP_PROP_APP_KEY}' and value='${APP_PROP_APP_VALUE}' }`,
    `appProperties has { key='${APP_PROP_TYPE_KEY}' and value='${APP_PROP_TYPE_SETTINGS_FOLDER}' }`,
    `appProperties has { key='${APP_PROP_OWNER_SUB_KEY}' and value='${sub}' }`,
  ].join(" and ");
  const result = await drive.files.list({
    q,
    orderBy: "modifiedTime desc",
    pageSize: 5,
    fields: "files(id,name,modifiedTime,appProperties,parents)",
  });
  const files = result?.data?.files || [];
  return files?.[0] || null;
}

async function ensureSettingsFolderId({ drive, authUser }) {
  const toolFolderId = await ensureToolFolderId({ drive, authUser });
  if (!toolFolderId) return "";
  const found = await findSettingsFolderOrNull({ drive, authUser, toolFolderId });
  if (found?.id) return String(found.id);

  const sub = String(authUser?.sub || "").trim();
  if (!sub) return "";
  const patch = {
    [APP_PROP_APP_KEY]: APP_PROP_APP_VALUE,
    [APP_PROP_TYPE_KEY]: APP_PROP_TYPE_SETTINGS_FOLDER,
    [APP_PROP_OWNER_SUB_KEY]: sub,
    ...(authUser?.email ? { [APP_PROP_OWNER_EMAIL_KEY]: String(authUser.email) } : {}),
    ...(authUser?.name ? { [APP_PROP_OWNER_NAME_KEY]: String(authUser.name) } : {}),
  };
  const created = await drive.files.create({
    requestBody: {
      name: DRIVE_SETTINGS_FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
      appProperties: patch,
      parents: [toolFolderId],
    },
    fields: "id",
  });
  return String(created?.data?.id || "");
}

async function moveFileIntoFolderIfNeeded({ drive, fileId, folderId }) {
  const id = String(fileId || "").trim();
  const target = String(folderId || "").trim();
  if (!id || !target) return;
  const current = await drive.files.get({ fileId: id, fields: "id,parents" });
  const parents = Array.isArray(current?.data?.parents) ? current.data.parents : [];
  if (parents.includes(target)) return;
  const removeParents = parents.filter(Boolean).join(",");
  await drive.files.update({
    fileId: id,
    addParents: target,
    removeParents: removeParents || undefined,
    fields: "id,parents",
  });
}

async function buildQuestionIdToTitleMapWithSnapshot({ forms, drive, formId }) {
  try {
    const map = await buildQuestionIdToTitleMap(forms, formId);
    if (map && map.size > 0) return map;
  } catch {
    // fallthrough
  }

  try {
    const snapFile = await findFormSnapshotFileOrNull({ drive, formId });
    if (!snapFile?.id) return new Map();
    const json = await readDriveJsonFileOrNull(drive, snapFile.id);
    const obj = json?.questionIdToTitle;
    if (!obj || typeof obj !== "object") return new Map();
    return new Map(Object.entries(obj).map(([k, v]) => [String(k), String(v)]));
  } catch {
    return new Map();
  }
}

function getAnswerValue(answer) {
  return (
    answer?.textAnswers?.answers?.[0]?.value ??
    answer?.textAnswer?.value ?? // 念のため
    ""
  );
}

function isParticipantNameTitle(title) {
  const t = String(title || "");
  return (
    t.includes("参加者名（") ||
    t.includes("氏名（") ||
    t.includes("氏名(") ||
    t === "氏名"
  );
}

function isParticipantRoleTitle(title) {
  const t = String(title || "");
  return t.includes("役職名（") || t.includes("役職名(") || t === "役職名";
}

function parseIndexedFieldNumber(title) {
  const t = String(title || "");
  const m0 = t.match(/（\s*(\d+)\s*人目\s*）/);
  if (m0?.[1]) return Number(m0[1]);
  const m1 = t.match(/（\s*(\d+)\s*）/);
  if (m1?.[1]) return Number(m1[1]);
  const m2 = t.match(/\(\s*(\d+)\s*人目\s*\)/);
  if (m2?.[1]) return Number(m2[1]);
  const m3 = t.match(/\(\s*(\d+)\s*\)/);
  if (m3?.[1]) return Number(m3[1]);
  return null;
}

function extractGoogleApiError(err) {
  const status =
    err?.response?.status ||
    err?.code || // sometimes numeric
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

function parseAcceptingResponsesFromTitle(title) {
  const t = String(title || "");
  if (t.includes(FORM_CLOSED_TAG)) return false;
  if (t.includes(FORM_NAME_TAG)) return true;
  return null;
}

function parseAcceptingResponsesFromAppProperties(appProperties) {
  const props = appProperties || {};
  const app = props?.[APP_PROP_APP_KEY];
  const status = props?.[APP_PROP_STATUS_KEY];
  if (String(app || "") !== APP_PROP_APP_VALUE) return null;
  if (String(status || "") === APP_PROP_STATUS_CLOSED) return false;
  return true;
}

function mergeAppProperties(current, patch) {
  return {
    ...(current || {}),
    ...(patch || {}),
  };
}

function buildOwnerAppPropertiesPatch(currentProps, authUser, ownedByMe) {
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

function stripTagsFromTitle(title) {
  return String(title || "")
    .replace(`${FORM_NAME_TAG} `, "")
    .replace(`${FORM_CLOSED_TAG} `, "")
    .replace(FORM_NAME_TAG, "")
    .replace(FORM_CLOSED_TAG, "")
    .trim();
}

async function migrateFileToAppProperties({ forms, drive, file, authUser }) {
  const formId = file?.id;
  if (!formId) return { migrated: false };
  const ownedByMe = file?.ownedByMe === true;

  const currentName = String(file?.name || "");
  const cleanedName = stripTagsFromTitle(currentName) || currentName;
  const currentProps = file?.appProperties || {};

  const acceptingFromTitle = parseAcceptingResponsesFromTitle(currentName);
  const inferredStatus =
    acceptingFromTitle === false ? APP_PROP_STATUS_CLOSED : undefined;

  const nextProps = mergeAppProperties(
    currentProps,
    mergeAppProperties(
      {
    [APP_PROP_APP_KEY]: APP_PROP_APP_VALUE,
    ...(inferredStatus ? { [APP_PROP_STATUS_KEY]: inferredStatus } : {}),
      },
      buildOwnerAppPropertiesPatch(currentProps, authUser, ownedByMe)
    )
  );

  const needsDriveUpdate =
    String(currentProps?.[APP_PROP_APP_KEY] || "") !== APP_PROP_APP_VALUE ||
    currentName.includes(FORM_NAME_TAG) ||
    currentName.includes(FORM_CLOSED_TAG) ||
    // add owner props when missing (only when ownedByMe)
    (ownedByMe &&
      String(currentProps?.[APP_PROP_OWNER_SUB_KEY] || "").trim() !==
        String(nextProps?.[APP_PROP_OWNER_SUB_KEY] || "").trim());

  let cleanedTitle = "";
  let needsFormsUpdate = false;
  try {
    const currentForm = await forms.forms.get({ formId });
    const currentTitle = String(currentForm?.data?.info?.title || "");
    cleanedTitle = stripTagsFromTitle(currentTitle) || currentTitle;
    needsFormsUpdate =
      currentTitle.includes(FORM_NAME_TAG) ||
      currentTitle.includes(FORM_CLOSED_TAG);

    if (needsFormsUpdate && cleanedTitle && cleanedTitle !== currentTitle) {
      await forms.forms.batchUpdate({
        formId,
        requestBody: {
          requests: [
            {
              updateFormInfo: {
                info: { title: cleanedTitle },
                updateMask: "title",
              },
            },
          ],
        },
      });
    }
  } catch (e) {
    // Forms更新はベストエフォート
    console.warn("forms title migration failed:", e?.message || String(e));
  }

  if (needsDriveUpdate) {
    try {
      await drive.files.update({
        fileId: formId,
        requestBody: {
          name: cleanedName || cleanedTitle || currentName,
          appProperties: nextProps,
        },
      });
    } catch (e) {
      console.warn("drive migration failed:", e?.message || String(e));
      return { migrated: false };
    }
  }

  return {
    migrated: Boolean(needsDriveUpdate || needsFormsUpdate),
    cleanedName: cleanedName || cleanedTitle || currentName,
    nextProps,
  };
}

app.post("/api/forms/create", async (req, res) => {
  try {
    const savedTokens = getTokens(req);
    if (!savedTokens) {
      void logEvent({
        type: "forms_create_rejected",
        reason: "not_logged_in",
      });
      return res.status(401).json({ error: "Not logged in" });
    }

    const authClient = makeAuthedOAuthClientOrNull(req);
    if (!authClient) return res.status(401).json({ error: "Not logged in" });
    const authUser = await getAuthUserOrNull(req, res);

    const {
      title,
      datetime,
      endDatetime,
      deadline,
      place,
      price,
      host,
      participantNameCount,
    } = req.body;

    const parsedCount = Number(participantNameCount);
    const safeParticipantNameCount = Number.isFinite(parsedCount)
      ? Math.max(1, Math.min(20, Math.floor(parsedCount)))
      : 1;
    const safePrice = parseIntInRange(price, { min: 0, max: 99999999 }) ?? 0;

    const baseTitle = title ? `${title} 出欠通知書` : "出欠通知書";
    const formTitle = baseTitle;

    console.log("受け取ったフォームデータ:", req.body);
    void logEvent({
      type: "forms_create_requested",
      formTitle,
      hasDatetime: Boolean(datetime),
      hasEndDatetime: Boolean(endDatetime),
      hasDeadline: Boolean(deadline),
      hasPrice: price != null,
      participantNameCount: safeParticipantNameCount,
    });

    const formattedMeetingRange = formatDateTimeRangeJP(datetime, endDatetime);
    const meetingInfoLines = [
      `・日時： ${formattedMeetingRange}`,
      `・場所： ${place}`,
      safePrice > 0 ? `・参加費（1人あたり）：￥ ${safePrice}` : null,
      `・〆切： ${formatDateJP(deadline)}`,
    ]
      .filter(Boolean)
      .join("\n");

        const description = `
${formTitle}

平素より当協会の活動にご理解とご協力を賜り、誠にありがとうございます。
下記のとおり【${title}】を開催いたします。
ご出欠につきまして、以下のフォームよりご回答くださるようお願い申し上げます。

【会合情報】
${meetingInfoLines}

【お問合せ先】
 ${host} 事務局
（TEL）0242-23-8511
`.trim();

    const forms = google.forms({ version: "v1", auth: authClient });
    const drive = google.drive({ version: "v3", auth: authClient });

    const created = await forms.forms.create({
      requestBody: { info: { title: formTitle } },
    });
    const formId = String(created?.data?.formId || "").trim();
    if (!formId) throw new Error("Form create failed: missing formId");
    const toolFolderId = await ensureToolFolderId({ drive, authUser });
    if (toolFolderId) {
      await moveFileIntoFolderIfNeeded({ drive, fileId: formId, folderId: toolFolderId });
    }

    const requests = [];
    requests.push({
      updateFormInfo: {
        info: {
          title: formTitle,
          description,
        },
        updateMask: "title,description",
      },
    });

    requests.push({
      createItem: {
        item: {
          title: "出席／欠席",
          questionItem: {
            question: {
              required: true,
              choiceQuestion: {
                type: "RADIO",
                options: [{ value: "出席" }, { value: "欠席" }],
              },
            },
          },
        },
        location: { index: 0 },
      },
    });

    requests.push({
      createItem: {
        item: {
          title: "事業所名",
          questionItem: {
            question: {
              required: true,
              textQuestion: {},
            },
          },
        },
        location: { index: 1 },
      },
    });

    const roleTitle = (i) =>
      safeParticipantNameCount === 1 ? "役職名" : `役職名（${i}人目）`;
    const nameTitle = (i) =>
      safeParticipantNameCount === 1 ? "氏名" : `氏名（${i}人目）`;

    let cursorIndex = 2;
    for (let i = 1; i <= safeParticipantNameCount; i += 1) {
      requests.push({
        createItem: {
          item: {
            title: roleTitle(i),
            questionItem: {
              question: {
                required: false,
                textQuestion: {},
              },
            },
          },
          location: { index: cursorIndex },
        },
      });
      cursorIndex += 1;

      requests.push({
        createItem: {
          item: {
            title: nameTitle(i),
            questionItem: {
              question: {
                required: i === 1,
                textQuestion: {},
              },
            },
          },
          location: { index: cursorIndex },
        },
      });
      cursorIndex += 1;
    }

    requests.push({
      createItem: {
        item: {
          title: "備考",
          questionItem: {
            question: {
              required: false,
              textQuestion: {
                paragraph: true,
              },
            },
          },
        },
        location: { index: cursorIndex },
      },
    });

    await forms.forms.batchUpdate({
      formId,
      requestBody: {
        requests,
      },
    });

    await drive.files.update({
      fileId: formId,
      requestBody: {
        name: formTitle,
        appProperties: {
          [APP_PROP_APP_KEY]: APP_PROP_APP_VALUE,
          ...(authUser?.sub
            ? {
                [APP_PROP_OWNER_SUB_KEY]: String(authUser.sub),
                ...(authUser?.email ? { [APP_PROP_OWNER_EMAIL_KEY]: String(authUser.email) } : {}),
                ...(authUser?.name ? { [APP_PROP_OWNER_NAME_KEY]: String(authUser.name) } : {}),
              }
            : {}),
        },
      },
    });

    const responderUri = String(created?.data?.responderUri || "").trim();

    void logEvent({
      type: "forms_create_succeeded",
      formId,
    });
    res.json({
      formId,
      formUrl: responderUri,
    });
  } catch (err) {
    console.error(err);
    const { status, message } = extractGoogleApiError(err);
    void logEvent({
      type: "forms_create_failed",
      message: message || err?.message || String(err),
    });
    res
      .status(status || 500)
      .json({ error: message || "Failed to create form" });
  }
});

app.get("/api/forms/:formId/responses/raw", async (req, res) => {
  const { formId } = req.params;

  try {
    const savedTokens = getTokens(req);
    if (!savedTokens) {
      void logEvent({
        type: "forms_responses_list_rejected",
        reason: "not_logged_in",
        formId,
      });
      return res.status(401).json({ error: "Not logged in" });
    }

    void logEvent({
      type: "forms_responses_list_requested",
      formId,
      mode: "raw",
    });

    const authClient = makeAuthedOAuthClientOrNull(req);
    if (!authClient) return res.status(401).json({ error: "Not logged in" });
    const drive = google.drive({ version: "v3", auth: authClient });
    const access = await enforceOwnerAccess({ req, res, drive, formId });
    if (!access.ok) return res.status(access.status || 403).json({ error: access.error });
    const forms = google.forms({ version: "v1", auth: authClient });

    const { responses, nextPageToken } = await listAllFormResponses(forms, formId);

    void logEvent({
      type: "forms_responses_list_succeeded",
      formId,
      mode: "raw",
      count: responses.length,
    });

    return res.json({
      formId,
      responses,
      nextPageToken,
    });
  } catch (err) {
    console.error(err);
    void logEvent({
      type: "forms_responses_list_failed",
      formId,
      mode: "raw",
      message: err?.message || String(err),
    });
    return res.status(500).json({ error: "Failed to list responses" });
  }
});

app.get("/api/forms/:formId/responses", async (req, res) => {
  const { formId } = req.params;

  try {
    const savedTokens = getTokens(req);
    if (!savedTokens) {
      void logEvent({
        type: "forms_responses_list_rejected",
        reason: "not_logged_in",
        formId,
      });
      return res.status(401).json({ error: "Not logged in" });
    }

    void logEvent({
      type: "forms_responses_list_requested",
      formId,
      mode: "formatted",
    });

    const authClient = makeAuthedOAuthClientOrNull(req);
    if (!authClient) return res.status(401).json({ error: "Not logged in" });
    const drive = google.drive({ version: "v3", auth: authClient });
    const access = await enforceOwnerAccess({ req, res, drive, formId });
    if (!access.ok) return res.status(access.status || 403).json({ error: access.error });
    const forms = google.forms({ version: "v1", auth: authClient });

    const questionIdToTitle = await buildQuestionIdToTitleMapWithSnapshot({
      forms,
      drive,
      formId,
    });
    const { responses } = await listAllFormResponses(forms, formId);

    const parsedRows = responses.map((r) => {
      const answers = r?.answers || {};

      const row = {
        company: "",
        role: "",
        name: "",
        attendance: "",
        count: 0,
        remarks: "",
        submittedAt: r?.lastSubmittedTime || "",
      };

      /** @type {Record<string, string>} */
      const rolesByIdx = {};
      /** @type {Record<string, string>} */
      const namesByIdx = {};

      for (const [questionId, answer] of Object.entries(answers)) {
        const title = questionIdToTitle.get(String(questionId)) || "";
        const value = getAnswerValue(answer);
        if (!title) continue;

        if (title.includes("事業所")) {
          row.company = value;
          continue;
        }
        if (title.includes("出席")) {
          row.attendance = value;
          continue;
        }
        if (title.includes("備考")) {
          row.remarks = value;
          continue;
        }

        if (isParticipantRoleTitle(title)) {
          const idx = parseIndexedFieldNumber(title) ?? 1;
          const v = String(value || "").trim();
          if (v) rolesByIdx[String(idx)] = v;
          else if (title === "役職名" && !rolesByIdx["1"]) rolesByIdx["1"] = "";
          continue;
        }

        if (isParticipantNameTitle(title)) {
          const idx = parseIndexedFieldNumber(title) ?? 1;
          const v = String(value || "").trim();
          if (v) namesByIdx[String(idx)] = v;
          else if (title === "氏名" && !namesByIdx["1"]) namesByIdx["1"] = "";
          continue;
        }
      }

      const idxs = Array.from(
        new Set([
          ...Object.keys(namesByIdx),
          ...Object.keys(rolesByIdx),
        ])
      )
        .map((s) => Number(s))
        .filter((n) => Number.isFinite(n))
        .sort((a, b) => a - b);

      const names = [];
      const roles = [];
      for (const i of idxs) {
        const name = String(namesByIdx[String(i)] || "").trim();
        const role = String(rolesByIdx[String(i)] || "").trim();
        if (name) names.push(name);
        if (role) roles.push(role);
      }

      row.name = names.join(" / ");
      row.role = roles.join(" / ");
      const participantCount = names.length;
      if (row.attendance === "出席") row.count = participantCount || 1;
      else if (row.attendance === "欠席") row.count = 0;
      else row.count = participantCount || 0;

      return row;
    });

    let postCloseSubmissionCount = 0;
    const filtered = parsedRows.filter((row) => {
      const isEmpty =
        !String(row?.company || "").trim() &&
        !String(row?.role || "").trim() &&
        !String(row?.name || "").trim() &&
        !String(row?.attendance || "").trim() &&
        !String(row?.remarks || "").trim();
      if (isEmpty) {
        postCloseSubmissionCount += 1;
        return false;
      }
      return true;
    });

    const rows = filtered.slice().sort((a, b) => {
      const ta = new Date(a?.submittedAt || 0).getTime();
      const tb = new Date(b?.submittedAt || 0).getTime();
      return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
    });

    void logEvent({
      type: "forms_responses_list_succeeded",
      formId,
      mode: "formatted",
      count: rows.length,
      postCloseSubmissionCount,
    });

    return res.json({ formId, rows, postCloseSubmissionCount });
  } catch (err) {
    console.error(err);
    void logEvent({
      type: "forms_responses_list_failed",
      formId,
      mode: "formatted",
      message: err?.message || String(err),
    });
    return res.status(500).json({ error: "Failed to list responses" });
  }
});

app.get("/api/forms/:formId/summary", async (req, res) => {
  const { formId } = req.params;

  try {
    const savedTokens = getTokens(req);
    if (!savedTokens) {
      void logEvent({
        type: "forms_summary_rejected",
        reason: "not_logged_in",
        formId,
      });
      return res.status(401).json({ error: "Not logged in" });
    }

    void logEvent({ type: "forms_summary_requested", formId });
    const authClient = makeAuthedOAuthClientOrNull(req);
    if (!authClient) return res.status(401).json({ error: "Not logged in" });
    const drive = google.drive({ version: "v3", auth: authClient });
    const access = await enforceOwnerAccess({ req, res, drive, formId });
    if (!access.ok) return res.status(access.status || 403).json({ error: access.error });
    const forms = google.forms({ version: "v1", auth: authClient });

    const questionIdToTitle = await buildQuestionIdToTitleMapWithSnapshot({
      forms,
      drive,
      formId,
    });
    const { responses } = await listAllFormResponses(forms, formId);

    let responseCount = 0;
    let postCloseSubmissionCount = 0;
    let attendeeCount = 0;

    for (const r of responses) {
      const answers = r?.answers || {};
      let hasMeaningfulAnswer = false;

      for (const [questionId, answer] of Object.entries(answers)) {
        const title = questionIdToTitle.get(String(questionId)) || "";
        if (!title) continue;
        const value = String(getAnswerValue(answer) || "").trim();
        if (!value) continue;
        if (
          title.includes("事業所") ||
          title.includes("出席") ||
          title.includes("備考") ||
          isParticipantNameTitle(title) ||
          isParticipantRoleTitle(title)
        ) {
          hasMeaningfulAnswer = true;
          break;
        }
      }
      if (!hasMeaningfulAnswer) {
        postCloseSubmissionCount += 1;
        continue;
      }
      responseCount += 1;

      let attendance = "";
      for (const [questionId, answer] of Object.entries(answers)) {
        const title = questionIdToTitle.get(String(questionId)) || "";
        if (!title) continue;
        if (!title.includes("出席")) continue;
        attendance = String(getAnswerValue(answer) || "").trim();
        break;
      }
      if (attendance !== "出席") continue;

      for (const [questionId, answer] of Object.entries(answers)) {
        const title = questionIdToTitle.get(String(questionId)) || "";
        if (!title) continue;
        if (!isParticipantNameTitle(title)) continue;
        const v = String(getAnswerValue(answer) || "").trim();
        if (v) attendeeCount += 1;
      }
    }

    void logEvent({
      type: "forms_summary_succeeded",
      formId,
      responseCount,
      attendeeCount,
      postCloseSubmissionCount,
    });
    return res.json({ formId, responseCount, attendeeCount, postCloseSubmissionCount });
  } catch (err) {
    console.error(err);
    const { status, message } = extractGoogleApiError(err);
    void logEvent({
      type: "forms_summary_failed",
      formId,
      message,
    });
    return res
      .status(status || 500)
      .json({ error: message || "Failed to get summary" });
  }
});

app.get("/api/forms/list", async (req, res) => {
  try {
    const savedTokens = getTokens(req);
    if (!savedTokens) {
      void logEvent({
        type: "forms_list_rejected",
        reason: "not_logged_in",
      });
      return res.status(401).json({ error: "Not logged in" });
    }

    void logEvent({ type: "forms_list_requested" });

    const authClient = makeAuthedOAuthClientOrNull(req);
    if (!authClient) return res.status(401).json({ error: "Not logged in" });
    const authUser = await getAuthUserOrNull(req, res);
    if (!authUser?.sub) {
      return res.status(401).json({ error: "Failed to determine logged-in user" });
    }
    const formsApi = google.forms({ version: "v1", auth: authClient });
    const drive = google.drive({ version: "v3", auth: authClient });

    const baseQ = [
      "trashed = false",
      "mimeType = 'application/vnd.google-apps.form'",
    ].join(" and ");

    const q1 = [
      baseQ,
      `appProperties has { key='${APP_PROP_APP_KEY}' and value='${APP_PROP_APP_VALUE}' }`,
    ].join(" and ");

    const result1 = await drive.files.list({
      q: q1,
      orderBy: "createdTime desc",
      pageSize: 100,
      fields: "files(id,name,createdTime,modifiedTime,appProperties,ownedByMe)",
    });

    const files1 = result1?.data?.files || [];

    const q2 = [baseQ, `name contains '${FORM_NAME_TAG}'`].join(" and ");
    const result2 = await drive.files.list({
      q: q2,
      orderBy: "createdTime desc",
      pageSize: 100,
      fields: "files(id,name,createdTime,modifiedTime,appProperties,ownedByMe)",
    });
    const files2 = result2?.data?.files || [];

    /** @type {Map<string, any>} */
    const byId = new Map();
    for (const f of [...files1, ...files2]) {
      if (!f?.id) continue;
      if (!byId.has(f.id)) byId.set(f.id, f);
    }
    const files = Array.from(byId.values());

    const migrateTargets = files.filter((f) => {
      const name = String(f?.name || "");
      const props = f?.appProperties || {};
      const hasApp = String(props?.[APP_PROP_APP_KEY] || "") === APP_PROP_APP_VALUE;
      const hasTag = name.includes(FORM_NAME_TAG) || name.includes(FORM_CLOSED_TAG);
      const hasOwner = Boolean(String(props?.[APP_PROP_OWNER_SUB_KEY] || "").trim());
      return !hasApp || hasTag || ((f?.ownedByMe === true) && !hasOwner);
    });

    for (let i = 0; i < migrateTargets.length; i += 5) {
      const chunk = migrateTargets.slice(i, i + 5);
      // eslint-disable-next-line no-await-in-loop
      await Promise.allSettled(
        chunk.map((f) =>
          migrateFileToAppProperties({
            forms: formsApi,
            drive,
            file: f,
            authUser,
          })
        )
      );
    }

    const forms = files
      .filter((f) => {
        if (!authUser?.sub) return true;
        const props = f?.appProperties || {};
        const ownerSub = String(props?.[APP_PROP_OWNER_SUB_KEY] || "").trim();
        if (ownerSub) return ownerSub === String(authUser.sub).trim();
        return f?.ownedByMe === true;
      })
      .map((f) => {
      const cleanedTitle = stripTagsFromTitle(f.name) || f.name;
      const byProps = parseAcceptingResponsesFromAppProperties(f.appProperties);
      const byTitle = parseAcceptingResponsesFromTitle(f.name);
      return {
        formId: f.id,
        title: cleanedTitle,
        createdTime: f.createdTime,
        modifiedTime: f.modifiedTime,
        acceptingResponses: byProps ?? byTitle, // appProperties 優先
      };
    });

    void logEvent({ type: "forms_list_succeeded", count: forms.length });
    return res.json({ forms });
  } catch (err) {
    console.error(err);
    void logEvent({
      type: "forms_list_failed",
      message: err?.message || String(err),
    });
    return res.status(500).json({ error: "Failed to list forms" });
  }
});

app.get("/api/forms/:formId/info", async (req, res) => {
  const { formId } = req.params;

  try {
    const savedTokens = getTokens(req);
    if (!savedTokens) {
      void logEvent({
        type: "forms_info_rejected",
        reason: "not_logged_in",
        formId,
      });
      return res.status(401).json({ error: "Not logged in" });
    }

    void logEvent({ type: "forms_info_requested", formId });

    const authClient = makeAuthedOAuthClientOrNull(req);
    if (!authClient) return res.status(401).json({ error: "Not logged in" });
    const forms = google.forms({ version: "v1", auth: authClient });
    const drive = google.drive({ version: "v3", auth: authClient });
    const access = await enforceOwnerAccess({ req, res, drive, formId, requireApp: false });
    if (!access.ok) return res.status(access.status || 403).json({ error: access.error });

    const result = await forms.forms.get({ formId });
    const info = result?.data?.info || {};
    const responderUri = result?.data?.responderUri || "";
    const editUrl = `https://docs.google.com/forms/d/${encodeURIComponent(String(formId || "").trim())}/edit`;
    const driveFile = await drive.files.get({
      fileId: formId,
      fields: "id,name,appProperties,ownedByMe",
    });
    const driveName = driveFile?.data?.name || "";
    const appProps = driveFile?.data?.appProperties || {};

    const currentTitle = String(info?.title || "");
    const nextTitle = stripTagsFromTitle(currentTitle);
    const currentName = String(driveName || "");
    const nextName = stripTagsFromTitle(currentName);
    const acceptingFromTitle = parseAcceptingResponsesFromTitle(currentTitle) ?? true;
    const inferredStatus =
      acceptingFromTitle === false ? APP_PROP_STATUS_CLOSED : undefined;
    const byProps = parseAcceptingResponsesFromAppProperties(appProps);

    if (
      (currentTitle.includes(FORM_NAME_TAG) || currentTitle.includes(FORM_CLOSED_TAG)) ||
      (currentName.includes(FORM_NAME_TAG) || currentName.includes(FORM_CLOSED_TAG)) ||
      String(appProps?.[APP_PROP_APP_KEY] || "") !== APP_PROP_APP_VALUE
    ) {
      try {
        if (nextTitle && nextTitle !== currentTitle) {
          await forms.forms.batchUpdate({
            formId,
            requestBody: {
              requests: [
                {
                  updateFormInfo: {
                    info: { title: nextTitle },
                    updateMask: "title",
                  },
                },
              ],
            },
          });
        }

        const nextProps = mergeAppProperties(appProps, {
          [APP_PROP_APP_KEY]: APP_PROP_APP_VALUE,
          ...(inferredStatus ? { [APP_PROP_STATUS_KEY]: inferredStatus } : {}),
        });
        await drive.files.update({
          fileId: formId,
          requestBody: {
            name: nextName || nextTitle || currentName || currentTitle,
            appProperties: nextProps,
          },
        });
      } catch (e) {
        console.warn("migration failed:", e?.message || String(e));
      }
    }

    const acceptingResponses =
      byProps ?? parseAcceptingResponsesFromTitle(nextTitle || currentTitle);
    const titleToReturn = nextTitle || currentTitle || nextName || currentName;

    void logEvent({ type: "forms_info_succeeded", formId });
    return res.json({
      formId,
      title: titleToReturn || "",
      formUrl: responderUri,
      editUrl,
      acceptingResponses, // true/false/null
    });
  } catch (err) {
    console.error(err);
    void logEvent({
      type: "forms_info_failed",
      formId,
      message: err?.message || String(err),
    });
    return res.status(500).json({ error: "Failed to get form info" });
  }
});

app.post("/api/forms/:formId/close", async (req, res) => {
  const { formId } = req.params;
  try {
    const savedTokens = getTokens(req);
    if (!savedTokens) {
      void logEvent({
        type: "forms_close_rejected",
        reason: "not_logged_in",
        formId,
      });
      return res.status(401).json({ error: "Not logged in" });
    }

    void logEvent({ type: "forms_close_requested", formId });
    const authClient = makeAuthedOAuthClientOrNull(req);
    if (!authClient) return res.status(401).json({ error: "Not logged in" });

    const forms = google.forms({ version: "v1", auth: authClient });
    const drive = google.drive({ version: "v3", auth: authClient });
    const access = await enforceOwnerAccess({ req, res, drive, formId });
    if (!access.ok) return res.status(access.status || 403).json({ error: access.error });

    const driveFile = await drive.files.get({
      fileId: formId,
      fields: "id,name,appProperties",
    });
    const appProps = driveFile?.data?.appProperties || {};
    const byProps = parseAcceptingResponsesFromAppProperties(appProps);

    const current = await forms.forms.get({ formId });
    const currentTitle = String(current?.data?.info?.title || "");
    const baseTitle = stripTagsFromTitle(currentTitle) || currentTitle;
    const nextTitle = baseTitle;
    const items = Array.isArray(current?.data?.items) ? current.data.items : [];

    // IMPORTANT:
    // After we delete items, we lose the ability to map response answer questionIds to titles.
    // Snapshot the questionId->title map to Drive so closed forms can still be aggregated.
    try {
      /** @type {Record<string, string>} */
      const questionIdToTitleObj = {};
      for (const item of items) {
        const qid = item?.questionItem?.question?.questionId;
        const title = item?.title;
        if (!qid || !title) continue;
        questionIdToTitleObj[String(qid)] = String(title);
      }
      if (Object.keys(questionIdToTitleObj).length > 0) {
        const authUser = await getAuthUserOrNull(req, res);
        await upsertFormSnapshot({
          drive,
          authUser,
          formId,
          questionIdToTitle: questionIdToTitleObj,
        });
      }
    } catch (e) {
      console.warn("failed to snapshot form items:", e?.message || String(e));
    }

    const currentName = String(driveFile?.data?.name || "");
    const baseName = stripTagsFromTitle(currentName) || currentName || baseTitle;
    const nextName = baseName;

    const currentDesc = String(current?.data?.info?.description || "");
    const host = extractHostFromFormDescription(currentDesc);

    /** @type {any[]} */
    const requests = [];
    requests.push({
      updateFormInfo: {
        info: {
          title: nextTitle,
          description: buildClosedNoticeDescription(host),
        },
        updateMask: "title,description",
      },
    });

    for (let i = items.length - 1; i >= 0; i -= 1) {
      requests.push({
        deleteItem: {
          location: { index: i },
        },
      });
    }

    requests.push({
      createItem: {
        item: {
          title: CLOSED_NOTICE_TITLE,
          description: buildClosedNoticeDescription(host),
          textItem: {},
        },
        location: { index: 0 },
      },
    });

    await forms.forms.batchUpdate({
      formId,
      requestBody: { requests },
    });

    const nextProps = mergeAppProperties(appProps, {
      [APP_PROP_APP_KEY]: APP_PROP_APP_VALUE,
      [APP_PROP_STATUS_KEY]: APP_PROP_STATUS_CLOSED,
    });

    await drive.files.update({
      fileId: formId,
      requestBody: {
        name: nextName || nextTitle || currentName || currentTitle,
        appProperties: nextProps,
      },
    });

    void logEvent({ type: "forms_close_succeeded", formId });
    return res.json({ formId, acceptingResponses: false });
  } catch (err) {
    console.error(err);
    const { status, message } = extractGoogleApiError(err);
    void logEvent({
      type: "forms_close_failed",
      formId,
      message,
    });
    return res
      .status(status || 500)
      .json({ error: message || "Failed to close form" });
  }
});

app.post("/api/forms/:formId/trash", async (req, res) => {
  const { formId } = req.params;
  try {
    const savedTokens = getTokens(req);
    if (!savedTokens) {
      void logEvent({
        type: "forms_trash_rejected",
        reason: "not_logged_in",
        formId,
      });
      return res.status(401).json({ error: "Not logged in" });
    }

    void logEvent({ type: "forms_trash_requested", formId });
    const authClient = makeAuthedOAuthClientOrNull(req);
    if (!authClient) return res.status(401).json({ error: "Not logged in" });
    const drive = google.drive({ version: "v3", auth: authClient });
    const access = await enforceOwnerAccess({ req, res, drive, formId });
    if (!access.ok) return res.status(access.status || 403).json({ error: access.error });

    await drive.files.update({
      fileId: formId,
      requestBody: { trashed: true },
    });

    void logEvent({ type: "forms_trash_succeeded", formId });
    return res.json({ formId, trashed: true });
  } catch (err) {
    console.error(err);
    const { status, message } = extractGoogleApiError(err);
    void logEvent({
      type: "forms_trash_failed",
      formId,
      message,
    });
    return res
      .status(status || 500)
      .json({ error: message || "Failed to trash form" });
  }
});

if (process.env.ENABLE_LOG_API === "true") {
  app.get("/api/logs/recent", async (req, res) => {
    const limit = Number(req.query.limit ?? 200);
    const events = await readRecentLogLines(limit);
    res.json({ events });
  });
}

app.post("/auth/logout", (req, res) => {
  void clearTokens(req, res);
  void logEvent({ type: "logout" });
  res.json({ success: true });
});

app.post("/api/auth/logout", (req, res) => {
  void clearTokens(req, res);
  void logEvent({ type: "logout" });
  res.json({ success: true });
});

app.use((err, req, res, _next) => {
  const message = err?.message || String(err);
  console.error("Unhandled error:", err);
  void logEvent({
    type: "unhandled_error",
    path: req?.originalUrl || req?.url,
    message,
  });

  const body = IS_FIREBASE
    ? { error: "Internal Server Error" }
    : { error: "Internal Server Error", message, stack: err?.stack || null };
  res.status(500).json(body);
});

export const api = onRequest(
  {
    timeoutSeconds: 300,
    cors: true,
    secrets: [
      GOOGLE_CLIENT_ID_SECRET,
      GOOGLE_CLIENT_SECRET_SECRET,
      CORS_ORIGIN_SECRET,
      FRONTEND_ORIGIN_SECRET,
      OAUTH_REDIRECT_URI_SECRET,
    ],
  },
  app
);

if (!IS_FIREBASE) {
  app.listen(PORT, () => {
    console.log(`Backend running on port ${PORT}`);
  });
}
