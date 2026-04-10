export const QR_PNG_SIZE = 1200;
export const QR_MARGIN_SIZE = 6;
export const QR_ERROR_CORRECTION_LEVEL = "M";
export const QR_DARK_COLOR = "#000000";
export const QR_LIGHT_COLOR = "#FFFFFF";
export const QR_ERROR_CORRECTION_OPTIONS = [
  { value: "M", label: "シンプル", description: "できるだけ二次元バーコードを単純にします。" },
  { value: "Q", label: "安定", description: "読み取りやすさを少し重視します。" },
];

export function normalizeQrErrorCorrectionLevel(input) {
  const value = String(input || "").trim().toUpperCase();
  return QR_ERROR_CORRECTION_OPTIONS.some((option) => option.value === value)
    ? value
    : QR_ERROR_CORRECTION_LEVEL;
}

export function getQrErrorCorrectionOption(input) {
  const value = normalizeQrErrorCorrectionLevel(input);
  return QR_ERROR_CORRECTION_OPTIONS.find((option) => option.value === value)
    || QR_ERROR_CORRECTION_OPTIONS[0];
}

function sanitizeDownloadName(name) {
  const base = String(name || "")
    .trim()
    .replace(/\.png$/i, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return `${base || "gformgen-qr"}.png`;
}

export function buildQrDownloadFileName(label) {
  return sanitizeDownloadName(label);
}

export function downloadQrCanvasAsPng(canvas, fileName) {
  if (!canvas) throw new Error("QR canvas is not ready");

  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = sanitizeDownloadName(fileName);
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function buildQrCanvasStyle(previewSize) {
  return {
    width: previewSize,
    height: previewSize,
    display: "block",
    backgroundColor: QR_LIGHT_COLOR,
    imageRendering: "pixelated",
  };
}
