// Device-level display preferences. There's no per-user preference storage on the server, so these live in
// this browser only (and say so wherever they're shown) — they work, they just don't follow the user around.
export type TextSize = "small" | "default" | "large";

const KEY = "oncoflow.textSize";
const PERCENT: Record<TextSize, string> = { small: "90%", default: "100%", large: "112%" };

// Reads the saved text size, tolerating storage being unavailable.
export function getTextSize(): TextSize {
  try {
    const v = localStorage.getItem(KEY);
    return v === "small" || v === "large" ? v : "default";
  } catch { return "default"; }
}

// Saves and applies a text size by scaling the root font size (the UI is rem-based, so everything follows).
export function setTextSize(size: TextSize): void {
  try { localStorage.setItem(KEY, size); } catch { /* not persisted; still applied for this session */ }
  applyTextSize(size);
}

// Applies a text size without saving it.
export function applyTextSize(size: TextSize = getTextSize()): void {
  document.documentElement.style.fontSize = PERCENT[size];
}
