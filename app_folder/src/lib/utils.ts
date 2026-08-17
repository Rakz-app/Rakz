// ========== 1. IMPORTS ==========
// (none)

// ========== 2. TYPES ==========
/** HSV color parts used by the settings color wheel. */
export interface Hsv {
  h: number;
  s: number;
  v: number;
}

// ========== 3. CONSTANTS ==========
/** Curated accent swatches offered under the color wheel in settings. */
export const SWATCHES = ["#00E5FF", "#38BDF8", "#A78BFA", "#F472B6", "#FB923C", "#FBBF24", "#34D399", "#10B981", "#EF4444", "#F87171", "#E8E8E8", "#94A3B8"];

// ========== 4. STATE ==========
// (none)

// ========== 5. LOGIC ==========

// ----- mix -----
// purpose:   an accent-tinted transparent overlay (e.g. chip backgrounds, hover glows)
// io:        in → pct (number, 0..100) | out → string (a color-mix() CSS color)
// processes: none                                                        [auto]
export function mix(pct: number): string {
  return `color-mix(in srgb, var(--accent) ${pct}%, transparent)`;
}

// ----- hsvToHex -----
// purpose:   convert HSV to a #RRGGBB hex string (color wheel → storage format)
// io:        in → h (0..360), s (0..1), v (0..1) | out → string (#RRGGBB upper-case)
// processes: none                                                        [auto]
export function hsvToHex(h: number, s: number, v: number): string {
  // 1. chroma / second-largest component / brightness offset
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  // 2. pick the RGB ramp segment for the hue
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  // 3. encode each channel as two hex digits
  const to = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, "0").toUpperCase();
  return `#${to(r)}${to(g)}${to(b)}`;
}

// ----- hexToHsv -----
// purpose:   convert a #RRGGBB hex string to HSV (storage format → color wheel)
// io:        in → hex (string) | out → Hsv (falls back to cyan when unparseable)
// processes: none                                                        [auto]
export function hexToHsv(hex: string): Hsv {
  // 1. accept with/without '#' — anything else falls back to accent cyan
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return { h: 190, s: 1, v: 1 };
  // 2. split channels back to 0..1
  const int = parseInt(m[1]!, 16);
  const r = ((int >> 16) & 255) / 255, g = ((int >> 8) & 255) / 255, b = (int & 255) / 255;
  // 3. classic RGB→HSV
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

// ========== 6. MAIN / EXPORTS ==========
// (all exports declared inline above)
