import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOG_DIR = process.env.LOG_DIR || path.join(__dirname, "logs");
const LOG_FILE = process.env.LOG_FILE || path.join(LOG_DIR, "events.jsonl");

async function ensureLogDir() {
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
  } catch {
    // no-op
  }
}

/**
 * Append one event as a JSON line to logs/events.jsonl.
 * NOTE: Do NOT log tokens or any sensitive data here.
 */
export async function logEvent(event) {
  try {
    await ensureLogDir();
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      ...event,
    });
    await fs.appendFile(LOG_FILE, `${line}\n`, "utf8");
  } catch {
    // Logging must never crash the server.
  }
}

export function requestLogger(req, res, next) {
  const start = Date.now();
  res.on("finish", () => {
    void logEvent({
      type: "http",
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      duration_ms: Date.now() - start,
      ip: req.ip,
    });
  });
  next();
}

export async function readRecentLogLines(limit = 200) {
  // naive tail implementation; good enough for local/debug
  const n = Number.isFinite(limit) ? Math.max(1, Math.min(2000, limit)) : 200;
  try {
    const content = await fs.readFile(LOG_FILE, "utf8");
    const lines = content.trim().split("\n");
    return lines.slice(-n).map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return { ts: null, type: "invalid_log_line", raw: l };
      }
    });
  } catch {
    return [];
  }
}


