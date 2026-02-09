type Runtime = "local" | "prod";

function normalizeBase(input: unknown): string {
  const s = String(input ?? "").trim();
  if (!s) return "";
  return s.replace(/\/+$/, "");
}

export function getRuntime(): Runtime {
  const v = String(import.meta.env.VITE_RUNTIME ?? "").trim();
  return v === "local" ? "local" : "prod";
}

/**
 * Returns API base for endpoints under `/api`.
 * - local: `${VITE_LOCAL_API_BASE}/api` (VITE_LOCAL_API_BASE is backend origin)
 * - prod:
 *   - if VITE_PROD_API_BASE ends with `/api` or equals `/api`, use it as-is (same-domain or full host)
 *   - else `${VITE_PROD_API_BASE}/api`
 *   - if unset, defaults to `/api`
 */
export function getApiBase(): string {
  const runtime = getRuntime();
  if (runtime === "local") {
    const origin = normalizeBase(import.meta.env.VITE_LOCAL_API_BASE);
    return `${origin}/api`;
  }

  const raw = normalizeBase(import.meta.env.VITE_PROD_API_BASE) || "/api";
  if (raw === "/api" || raw.endsWith("/api")) return raw;
  return `${raw}/api`;
}

/**
 * Returns backend base for non-API endpoints like `/auth/*`.
 * If prod api base is `/api` then auth base becomes "" (same-origin).
 */
export function getAuthBase(): string {
  const runtime = getRuntime();
  if (runtime === "local") {
    return normalizeBase(import.meta.env.VITE_LOCAL_API_BASE);
  }

  const raw = normalizeBase(import.meta.env.VITE_PROD_API_BASE) || "/api";
  if (raw === "/api") return "";
  if (raw.endsWith("/api")) return raw.slice(0, -"/api".length);
  return raw;
}

function join(base: string, path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (!base) return p;
  return `${base}${p}`;
}

/** Builds URL for `/api/*` endpoints. Pass path WITHOUT `/api` prefix, e.g. `/forms/list`. */
export function apiUrl(path: string): string {
  return join(getApiBase(), path);
}

/** Builds URL for `/auth/*` endpoints. Pass path WITH `/auth` prefix, e.g. `/auth/google`. */
export function authUrl(path: string): string {
  return join(getAuthBase(), path);
}


