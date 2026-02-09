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

// Local dev only: use .env.local to avoid clashing with Firebase Functions Secrets (.env is auto-loaded by firebase-tools)
if (!IS_FIREBASE) {
  dotenv.config({ path: ".env.local" });
}

// Firebase Functions params/secrets (also works locally via process.env)
// NOTE: Use GF_* keys to avoid clashing with firebase-tools auto-loading backend/.env
// (Cloud Run rejects having both secret + non-secret env vars with the same name)
const GOOGLE_CLIENT_ID_SECRET = defineSecret("GF_GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET_SECRET = defineSecret("GF_GOOGLE_CLIENT_SECRET");
const CORS_ORIGIN_SECRET = defineSecret("GF_CORS_ORIGIN");
const FRONTEND_ORIGIN_SECRET = defineSecret("GF_FRONTEND_ORIGIN");
const OAUTH_REDIRECT_URI_SECRET = defineSecret("GF_OAUTH_REDIRECT_URI");
// Keep the name aligned with README/ops docs.
const SESSION_PASSWORD_SECRET = defineSecret("GF_SESSION_PASSWORD");

function readSecret(name, secretParam) {
  try {
    const v = secretParam?.value?.();
    if (v) return v;
  } catch {
    // ignore
  }
  // Fallback order:
  // 1) process.env[GF_*] for local dev without secrets
  // 2) process.env[legacy key] for backward compatibility
  return process.env[name] || "";
}

function readLegacyAwareSecret(gfKey, legacyKey, secretParam) {
  // Prefer the secret (GF_*) name
  const v = readSecret(gfKey, secretParam);
  if (v) return v;
  return process.env[legacyKey] || "";
}

// NOTE: single-user mode
// Prefer cookie-based persistence so serverless instances don't lose login state.
// Fallback: in-memory (backend restart / cold start => re-login required).
let savedTokens = null;
let warnedMissingSessionPassword = false;

const app = express();
// Ensure req.protocol respects x-forwarded-proto (Firebase/Vercel/Cloud Run)
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
      // No Origin header (curl/same-origin navigation)
      if (!origin) return cb(null, true);
      if (allowedOrigins === "*") return cb(null, true);
      return cb(null, allowedOrigins.includes(origin));
    },
  })
);

app.use(express.json());
app.use(requestLogger);

const PORT = 3000;
const FORM_NAME_TAG = "[gformgen:sangaku]"; // Drive検索で「このアプリが作ったフォーム」を判別するタグ
const FORM_CLOSED_TAG = "[gformgen:closed]"; // アプリ上の「締切」判定用タグ（Forms APIで受付停止ができないため）
// NOTE: タイトルにタグを出さないため、今後は Drive の appProperties をメインで使う
const APP_PROP_APP_KEY = "gformgen_app";
const APP_PROP_STATUS_KEY = "gformgen_status";
const APP_PROP_APP_VALUE = "sangaku";
const APP_PROP_STATUS_CLOSED = "closed";

/* =========================
   Google OAuth 設定
========================= */
const FALLBACK_OAUTH_REDIRECT_URI =
  readLegacyAwareSecret(
    "GF_OAUTH_REDIRECT_URI",
    "OAUTH_REDIRECT_URI",
    OAUTH_REDIRECT_URI_SECRET
  ) ||
  "https://example.invalid/oauth2/callback";

function getAuthCallbackPathFromRequest(req) {
  const u = String(req?.originalUrl || req?.url || "");
  // If auth is routed under /api (Vercel rewrite), callback must match that path too.
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

// Per-request OAuth client (avoid cross-user races in a multi-user server)
function makeAuthedOAuthClientOrNull(_req) {
  if (!savedTokens?.access_token && !savedTokens?.refresh_token) return null;
  const client = makeOAuthClient(FALLBACK_OAUTH_REDIRECT_URI);
  client.setCredentials(savedTokens);
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
  // v1.<iv>.<tag>.<ciphertext>
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
    // keep for ~30 days (refresh_token is long-lived; access_token is short)
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
  // Prefer cookie (works across serverless instances), fallback to in-memory.
  const secret = getSessionSecret();
  if (secret) {
    try {
      const cookies = parseCookies(req);
      const enc = cookies?.gformgen_tokens;
      if (enc) {
        const tokens = decryptTokens(enc, secret);
        if (tokens?.access_token || tokens?.refresh_token) {
          savedTokens = tokens; // cache in-memory for this instance
          return tokens;
        }
      }
    } catch {
      // ignore and fallback
    }
  }
  return savedTokens;
}

async function setTokens(req, res, tokens) {
  savedTokens = tokens;
  // Best-effort cookie persistence (prevents "login works only after refresh" behind LB)
  try {
    setAuthCookie(req, res, tokens);
  } catch {
    // ignore
  }
}

async function clearTokens(req, res) {
  savedTokens = null;
  try {
    clearAuthCookie(req, res);
  } catch {
    // ignore
  }
}

/* =========================
   OAuth 開始
========================= */
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

/* =========================
   OAuth コールバック
========================= */
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

    // Treat GF_FRONTEND_ORIGIN as "frontend base URL" (can include a path like "/gformgen/").
    const configuredUrl = parseAbsoluteUrl(configuredFrontendOrigin);
    const returnToUrl = parseAbsoluteUrl(safeReturnTo);

    // Prefer returnTo when it is same-origin with configured frontend (or when no configured frontend).
    // This supports hosting the SPA under a sub-path.
    let redirectUrl = null;
    if (returnToUrl && configuredUrl) {
      if (returnToUrl.origin === configuredUrl.origin) redirectUrl = returnToUrl;
      else redirectUrl = configuredUrl;
    } else if (returnToUrl) {
      redirectUrl = returnToUrl;
    } else if (configuredUrl) {
      redirectUrl = configuredUrl;
    }

    // Final fallback: redirect to the current request host (better than "/")
    if (!redirectUrl) {
      const proto = String(req?.headers?.["x-forwarded-proto"] || req?.protocol || "https")
        .split(",")[0]
        .trim();
      const host = String(req?.headers?.["x-forwarded-host"] || req?.get?.("host") || "").trim();
      redirectUrl = host ? new URL(`${proto}://${host}`) : new URL("https://example.invalid");
    }

    // Strip query/hash and append login=success.
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

/* =========================
   ログイン状態確認（サーバ基準）
========================= */
function handleAuthMe(req, res) {
  const tokens = getTokens(req);
  const loggedIn = Boolean(tokens?.access_token) || Boolean(tokens?.refresh_token);
  return res.json({
    loggedIn,
    // for debugging/UX only (do not expose token itself)
    hasRefreshToken: Boolean(tokens?.refresh_token),
    hasAccessToken: Boolean(tokens?.access_token),
    expiryDate: tokens?.expiry_date ?? null,
  });
}

app.get("/auth/me", handleAuthMe);
app.get("/api/auth/me", handleAuthMe);

/* =========================
   日付日本語整形
========================= */
const formatDateJP = (isoString, withTime = false) => {
  if (!isoString) return "";

  const d = new Date(isoString);
  const week = ["日", "月", "火", "水", "木", "金", "土"];

  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const w = week[d.getDay()];

  if (withTime) {
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${y}年${m}月${day}日（${w}）${hh}:${mm}`;
  }

  return `${y}年${m}月${day}日（${w}）`;
};

/* =========================
   Forms: 回答/設問ユーティリティ
========================= */
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

function getAnswerValue(answer) {
  return (
    answer?.textAnswers?.answers?.[0]?.value ??
    answer?.textAnswer?.value ?? // 念のため
    ""
  );
}

function isParticipantNameTitle(title) {
  const t = String(title || "");
  // 新形式: "氏名（1）" / "参加者名（1）"
  // 旧形式: "氏名"
  // NOTE: 要件にある prefix 判定（例: "参加者名（"）にも将来対応しやすいよう緩めにしている
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
  // 全角括弧: （1） / 半角: (1)
  const m1 = t.match(/（\s*(\d+)\s*）/);
  if (m1?.[1]) return Number(m1[1]);
  const m2 = t.match(/\(\s*(\d+)\s*\)/);
  if (m2?.[1]) return Number(m2[1]);
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
  // NOTE: Google Forms APIでは「回答受付停止」を直接更新できないため、
  // アプリ側ではタイトルにタグを付けて締切状態を表現する。
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

function stripTagsFromTitle(title) {
  return String(title || "")
    .replace(`${FORM_NAME_TAG} `, "")
    .replace(`${FORM_CLOSED_TAG} `, "")
    .replace(FORM_NAME_TAG, "")
    .replace(FORM_CLOSED_TAG, "")
    .trim();
}

async function migrateFileToAppProperties({ forms, drive, file }) {
  const formId = file?.id;
  if (!formId) return { migrated: false };

  const currentName = String(file?.name || "");
  const cleanedName = stripTagsFromTitle(currentName) || currentName;
  const currentProps = file?.appProperties || {};

  // 旧タグから open/closed を推測（closed なら status=closed）
  const acceptingFromTitle = parseAcceptingResponsesFromTitle(currentName);
  const inferredStatus =
    acceptingFromTitle === false ? APP_PROP_STATUS_CLOSED : undefined;

  const nextProps = mergeAppProperties(currentProps, {
    [APP_PROP_APP_KEY]: APP_PROP_APP_VALUE,
    ...(inferredStatus ? { [APP_PROP_STATUS_KEY]: inferredStatus } : {}),
  });

  const needsDriveUpdate =
    String(currentProps?.[APP_PROP_APP_KEY] || "") !== APP_PROP_APP_VALUE ||
    currentName.includes(FORM_NAME_TAG) ||
    currentName.includes(FORM_CLOSED_TAG);

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

/* =========================
   フォーム作成 API
========================= */
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

    const {
      title,
      datetime,
      deadline,
      place,
      host,
      participantNameCount,
    } = req.body;

    const parsedCount = Number(participantNameCount);
    const safeParticipantNameCount = Number.isFinite(parsedCount)
      ? Math.max(1, Math.min(20, Math.floor(parsedCount)))
      : 1;

    // ★ Drive / Forms に表示される最終タイトル
    const baseTitle = title ? `${title} 出席通知書` : "出席通知書";
    // NOTE: タグはタイトルに出さず、Drive appProperties へ移行
    const formTitle = baseTitle;

    console.log("受け取ったフォームデータ:", req.body);
    void logEvent({
      type: "forms_create_requested",
      // Avoid PII-heavy payloads; keep only high-level fields.
      formTitle,
      hasDatetime: Boolean(datetime),
      hasDeadline: Boolean(deadline),
      participantNameCount: safeParticipantNameCount,
    });

    /* =========================
       説明文（通知文）
    ========================= */
    const description = `
${formTitle}

平素より当協会の活動にご理解とご協力を賜り、誠にありがとうございます。
下記のとおり【${title}】を開催いたします。
ご出欠につきまして、以下のフォームよりご回答くださいますようお願い申し上げます。

【会合情報】
・主催者： ${host}
・日時： ${formatDateJP(datetime, true)}
・場所： ${place}
・〆切： ${formatDateJP(deadline)}

【お問い合わせ先】
会津産学懇話会 事務局
（TEL）23-8511（会津地区経営者協会内）
`.trim();

    const forms = google.forms({
      version: "v1",
      auth: authClient,
    });

    /* =========================
       ① フォーム作成（仮）
    ========================= */
    const createResult = await forms.forms.create({
      requestBody: {
        info: {
          title: formTitle, // 仮でもOK
        },
      },
    });

    const formId = createResult.data.formId;
    const responderUri = createResult.data.responderUri;

    /* =========================
       ② batchUpdate（★ここが重要）
    ========================= */
    const requests = [];
    // ★ タイトル + 説明文を明示的に更新
    requests.push({
      updateFormInfo: {
        info: {
          title: formTitle,
          description,
        },
        updateMask: "title,description",
      },
    });

    // 出欠（先頭に移動）
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

    // 事業所名
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

    // 役職名（n）/ 氏名（n）: 氏名の1人目のみ必須、2人目以降は任意
    // 役職名は全て任意（入力負担を増やさない）
    let cursorIndex = 2;
    for (let i = 1; i <= safeParticipantNameCount; i += 1) {
      // 役職名（i）
      requests.push({
        createItem: {
          item: {
            title: `役職名（${i}）`,
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

      // 氏名（i）
      requests.push({
        createItem: {
          item: {
            title: `氏名（${i}）`,
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

    // 備考
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

    const drive = google.drive({
      version: "v3",
      auth: authClient,
    });

    await drive.files.update({
      fileId: formId,
      requestBody: {
        name: formTitle,
        appProperties: {
          [APP_PROP_APP_KEY]: APP_PROP_APP_VALUE,
          // open/closed は status で管理（未設定=open扱い）
        },
      },
    });

    /* =========================
       フロントへ返却
    ========================= */
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
    void logEvent({
      type: "forms_create_failed",
      message: err?.message || String(err),
    });
    res.status(500).json({ error: "Failed to create form" });
  }
});

/* =========================
   フォーム回答取得（RAW）
========================= */
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

/* =========================
   フォーム回答取得（整形）
========================= */
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
    const forms = google.forms({ version: "v1", auth: authClient });

    const questionIdToTitle = await buildQuestionIdToTitleMap(forms, formId);
    const { responses } = await listAllFormResponses(forms, formId);

    const rows = responses.map((r) => {
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

        // タイトル部分一致で分類
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

        // 役職名（n） / 役職名
        if (isParticipantRoleTitle(title)) {
          const idx = parseIndexedFieldNumber(title) ?? 1;
          const v = String(value || "").trim();
          if (v) rolesByIdx[String(idx)] = v;
          else if (title === "役職名" && !rolesByIdx["1"]) rolesByIdx["1"] = "";
          continue;
        }

        // 氏名（n） / 氏名 / 参加者名（n）
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

    void logEvent({
      type: "forms_responses_list_succeeded",
      formId,
      mode: "formatted",
      count: rows.length,
    });

    return res.json({ formId, rows });
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

/* =========================
   フォーム別サマリー（出席者数/回答者数）
========================= */
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
    const forms = google.forms({ version: "v1", auth: authClient });

    const questionIdToTitle = await buildQuestionIdToTitleMap(forms, formId);
    const { responses } = await listAllFormResponses(forms, formId);

    const responseCount = responses.length;
    let attendeeCount = 0;

    for (const r of responses) {
      const answers = r?.answers || {};
      // 出席者数は「出席回答」のみを集計対象とする
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
    });
    return res.json({ formId, responseCount, attendeeCount });
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

/* =========================
   このアプリが作成したフォーム一覧（Drive検索）
========================= */
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
    const formsApi = google.forms({ version: "v1", auth: authClient });
    const drive = google.drive({ version: "v3", auth: authClient });

    const baseQ = [
      "trashed = false",
      "mimeType = 'application/vnd.google-apps.form'",
    ].join(" and ");

    // ① appProperties で抽出（タイトルにタグを出さない方式）
    const q1 = [
      baseQ,
      `appProperties has { key='${APP_PROP_APP_KEY}' and value='${APP_PROP_APP_VALUE}' }`,
    ].join(" and ");

    const result1 = await drive.files.list({
      q: q1,
      orderBy: "createdTime desc",
      pageSize: 100,
      fields: "files(id,name,createdTime,modifiedTime,appProperties)",
    });

    const files1 = result1?.data?.files || [];

    // ② 互換：旧方式（タイトルタグ）も常に拾う（移行のため）
    const q2 = [baseQ, `name contains '${FORM_NAME_TAG}'`].join(" and ");
    const result2 = await drive.files.list({
      q: q2,
      orderBy: "createdTime desc",
      pageSize: 100,
      fields: "files(id,name,createdTime,modifiedTime,appProperties)",
    });
    const files2 = result2?.data?.files || [];

    /** @type {Map<string, any>} */
    const byId = new Map();
    for (const f of [...files1, ...files2]) {
      if (!f?.id) continue;
      if (!byId.has(f.id)) byId.set(f.id, f);
    }
    const files = Array.from(byId.values());

    // 一覧取得のタイミングで一括移行（ベストエフォート、5件ずつ）
    const migrateTargets = files.filter((f) => {
      const name = String(f?.name || "");
      const props = f?.appProperties || {};
      const hasApp = String(props?.[APP_PROP_APP_KEY] || "") === APP_PROP_APP_VALUE;
      const hasTag = name.includes(FORM_NAME_TAG) || name.includes(FORM_CLOSED_TAG);
      return !hasApp || hasTag;
    });

    for (let i = 0; i < migrateTargets.length; i += 5) {
      const chunk = migrateTargets.slice(i, i + 5);
      // eslint-disable-next-line no-await-in-loop
      await Promise.allSettled(
        chunk.map((f) => migrateFileToAppProperties({ forms: formsApi, drive, file: f }))
      );
    }

    const forms = files.map((f) => {
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

/* =========================
   フォーム情報取得（responderUriなど）
========================= */
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

    const result = await forms.forms.get({ formId });
    const info = result?.data?.info || {};
    const responderUri = result?.data?.responderUri || "";
    const driveFile = await drive.files.get({
      fileId: formId,
      fields: "id,name,appProperties",
    });
    const driveName = driveFile?.data?.name || "";
    const appProps = driveFile?.data?.appProperties || {};

    // 互換：旧タグが残っている場合、選択したタイミングで自動移行（タイトルからタグを消す）
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
        // Forms タイトルをクリーンに（ユーザーにタグを見せない）
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

        // Drive 側もクリーンにし、appProperties を付与
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
        // 移行はベストエフォート（失敗しても info 自体は返す）
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

/* =========================
   フォーム締切（回答受付停止）
========================= */
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

    // NOTE: Forms APIでは回答受付停止の切り替えが提供されていないため、
    // Drive appProperties で「締切」状態を表現する（タイトルにタグは出さない）
    const driveFile = await drive.files.get({
      fileId: formId,
      fields: "id,name,appProperties",
    });
    const appProps = driveFile?.data?.appProperties || {};
    const byProps = parseAcceptingResponsesFromAppProperties(appProps);
    if (byProps === false) {
      return res.json({ formId, acceptingResponses: false });
    }

    // 互換：旧タグが残っている場合はこのタイミングで除去
    const current = await forms.forms.get({ formId });
    const currentTitle = String(current?.data?.info?.title || "");
    const cleanTitle = stripTagsFromTitle(currentTitle);
    const currentName = String(driveFile?.data?.name || "");
    const cleanName = stripTagsFromTitle(currentName);

    if (cleanTitle && cleanTitle !== currentTitle) {
      await forms.forms.batchUpdate({
        formId,
        requestBody: {
          requests: [
            {
              updateFormInfo: {
                info: { title: cleanTitle },
                updateMask: "title",
              },
            },
          ],
        },
      });
    }

    const nextProps = mergeAppProperties(appProps, {
      [APP_PROP_APP_KEY]: APP_PROP_APP_VALUE,
      [APP_PROP_STATUS_KEY]: APP_PROP_STATUS_CLOSED,
    });

    await drive.files.update({
      fileId: formId,
      requestBody: {
        name: cleanName || cleanTitle || currentName || currentTitle,
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

/* =========================
   フォーム削除（Driveのゴミ箱へ移動）
========================= */
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

/* =========================
   デバッグ用：最近のログ取得（任意）
   ENABLE_LOG_API=true の時のみ有効化
========================= */
if (process.env.ENABLE_LOG_API === "true") {
  app.get("/api/logs/recent", async (req, res) => {
    const limit = Number(req.query.limit ?? 200);
    const events = await readRecentLogLines(limit);
    res.json({ events });
  });
}

/* =========================
   ログアウト
========================= */
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

/* =========================
   エラーハンドラ（実行時500の原因をログに残す）
========================= */
app.use((err, req, res, _next) => {
  const message = err?.message || String(err);
  console.error("Unhandled error:", err);
  void logEvent({
    type: "unhandled_error",
    path: req?.originalUrl || req?.url,
    message,
  });

  // 本番では内部情報を出しすぎない
  const body = IS_FIREBASE
    ? { error: "Internal Server Error" }
    : { error: "Internal Server Error", message, stack: err?.stack || null };
  res.status(500).json(body);
});

// Firebase Hosting から `/api/**` を rewrite して受ける想定（Hosting + Functions 同居）
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

/* =========================
   サーバー起動
========================= */
if (!IS_FIREBASE) {
  app.listen(PORT, () => {
    console.log(`Backend running on port ${PORT}`);
  });
}
