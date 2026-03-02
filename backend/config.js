import dotenv from "dotenv";
import { defineSecret } from "firebase-functions/params";

const IS_FIREBASE =
  Boolean(process.env.FUNCTION_TARGET) ||
  Boolean(process.env.FIREBASE_CONFIG) ||
  Boolean(process.env.K_SERVICE);

if (!IS_FIREBASE) {
  dotenv.config({ path: ".env.local" });
}

export const GOOGLE_CLIENT_ID_SECRET = defineSecret("GF_GOOGLE_CLIENT_ID");
export const GOOGLE_CLIENT_SECRET_SECRET = defineSecret("GF_GOOGLE_CLIENT_SECRET");
export const CORS_ORIGIN_SECRET = defineSecret("GF_CORS_ORIGIN");
export const FRONTEND_ORIGIN_SECRET = defineSecret("GF_FRONTEND_ORIGIN");
export const OAUTH_REDIRECT_URI_SECRET = defineSecret("GF_OAUTH_REDIRECT_URI");
export const SESSION_PASSWORD_SECRET = defineSecret("GF_SESSION_PASSWORD");

export function readSecret(name, secretParam) {
  try {
    const v = secretParam?.value?.();
    if (v) return v;
  } catch {}
  return process.env[name] || "";
}

export function readLegacyAwareSecret(gfKey, legacyKey, secretParam) {
  const v = readSecret(gfKey, secretParam);
  if (v) return v;
  return process.env[legacyKey] || "";
}

export const PORT = 3000;

export function getCorsOptions() {
  const CORS_ORIGIN =
    readLegacyAwareSecret("GF_CORS_ORIGIN", "CORS_ORIGIN", CORS_ORIGIN_SECRET) || "*";
  const allowedOrigins =
    CORS_ORIGIN === "*"
      ? "*"
      : CORS_ORIGIN.split(",")
          .map((s) => s.trim())
          .filter(Boolean);

  return {
    credentials: true,
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (allowedOrigins === "*") return cb(null, true);
      return cb(null, allowedOrigins.includes(origin));
    },
  };
}

export { IS_FIREBASE };
