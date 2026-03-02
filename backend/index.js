import express from "express";
import cors from "cors";
import { onRequest } from "firebase-functions/v2/https";
import { logEvent, requestLogger, readRecentLogLines } from "./logger.js";
import {
  IS_FIREBASE,
  PORT,
  getCorsOptions,
  GOOGLE_CLIENT_ID_SECRET,
  GOOGLE_CLIENT_SECRET_SECRET,
  CORS_ORIGIN_SECRET,
  FRONTEND_ORIGIN_SECRET,
  OAUTH_REDIRECT_URI_SECRET,
  SESSION_PASSWORD_SECRET,
} from "./config.js";
import {
  mountAuthRoutes,
  clearTokens,
} from "./auth.js";
import { mountUserSettingsRoutes } from "./userSettings.js";
import { mountFormsRoutes } from "./forms.js";

const app = express();
app.set("trust proxy", 1);

app.use(cors(getCorsOptions()));
app.use(express.json());
app.use(requestLogger);

mountAuthRoutes(app);
mountUserSettingsRoutes(app);
mountFormsRoutes(app);

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
      SESSION_PASSWORD_SECRET,
    ],
  },
  app
);

if (!IS_FIREBASE) {
  app.listen(PORT, () => {
    console.log(`Backend running on port ${PORT}`);
  });
}
