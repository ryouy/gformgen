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
 * - prod: always use same-origin `/api`
 */
export function getApiBase(): string {
  const runtime = getRuntime();
  if (runtime === "local") {
    const origin = normalizeBase(import.meta.env.VITE_LOCAL_API_BASE);
    return `${origin}/api`;
  }
  return "/api";
}

/**
 * Returns backend base for non-API endpoints like `/auth/*`.
 * In prod, auth always goes through same-origin `/api` so Hosting rewrites keep
 * session cookies on the app host.
 */
export function getAuthBase(): string {
  const runtime = getRuntime();
  if (runtime === "local") {
    return normalizeBase(import.meta.env.VITE_LOCAL_API_BASE);
  }
  return "/api";
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


