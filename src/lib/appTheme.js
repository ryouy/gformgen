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
  const accent = String(theme?.accent || "#6b7280").trim().toLowerCase();
  const scope = "sidebar";
  const rgb = hexToRgb(accent) || hexToRgb("#6b7280");
  const accent2 = adjust(accent, -18);

  root.style.setProperty("--accent", accent);
  root.style.setProperty("--accent2", accent2);
  if (rgb) root.style.setProperty("--accent-rgb", `${rgb.r}, ${rgb.g}, ${rgb.b}`);

  // Sidebar is always themed.
  if (rgb) {
    root.style.setProperty(
      "--sidebar-bg",
      `linear-gradient(180deg, rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.10), rgba(241, 245, 249, 0.96))`
    );
  }
  // Dark mode removed.
  delete root.dataset.theme;

  // Notify app (e.g. to update MUI ThemeProvider) without tight coupling.
  try {
    window.dispatchEvent(new CustomEvent("gformgen:theme", { detail: { accent, scope } }));
  } catch {
    // ignore
  }
}


