function hexToRgb(hex) {
  const s = String(hex || "").trim().toLowerCase();
  const m = s.match(/^#([0-9a-f]{6})$/);
  if (!m) return null;
  const n = Number.parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return { r, g, b };
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function adjust(hex, amount) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const r = clamp(rgb.r + amount, 0, 255);
  const g = clamp(rgb.g + amount, 0, 255);
  const b = clamp(rgb.b + amount, 0, 255);
  const toHex = (v) => v.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function applyAppThemeToDom(theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const accent = String(theme?.accent || "#3b82f6").trim().toLowerCase();
  const scopeRaw = String(theme?.scope || "sidebar").trim();
  // We no longer expose "accent-only" in UI; treat unknown/legacy values as "sidebar".
  const scope = scopeRaw === "dark" || scopeRaw === "sidebar" ? scopeRaw : "sidebar";
  const rgb = hexToRgb(accent) || hexToRgb("#3b82f6");
  const accent2 = adjust(accent, -18);

  root.style.setProperty("--accent", accent);
  root.style.setProperty("--accent2", accent2);
  if (rgb) root.style.setProperty("--accent-rgb", `${rgb.r}, ${rgb.g}, ${rgb.b}`);

  // Sidebar background can be overridden in "sidebar" mode (but not in "accent only").
  if (scope === "sidebar" || scope === "dark") {
    if (rgb) {
      root.style.setProperty(
        "--sidebar-bg",
        `linear-gradient(180deg, rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.10), rgba(241, 245, 249, 0.96))`
      );
    }
  } else {
    root.style.removeProperty("--sidebar-bg");
  }

  if (scope === "dark") root.dataset.theme = "dark";
  else delete root.dataset.theme;

  // Notify app (e.g. to update MUI ThemeProvider) without tight coupling.
  try {
    window.dispatchEvent(new CustomEvent("gformgen:theme", { detail: { accent, scope } }));
  } catch {
    // ignore
  }
}


