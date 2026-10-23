/** Tiny pure hex colour helpers (no three.js) so palettes stay unit-testable. */

export type Rgb = [number, number, number];

const HEX = /^#([0-9a-f]{6})$/i;

export function isHexColor(value: string): boolean {
  return HEX.test(value.trim());
}

export function hexToRgb(hex: string): Rgb {
  const match = HEX.exec(hex.trim());
  if (!match?.[1]) throw new Error(`Invalid hex colour "${hex}"`);
  const n = Number.parseInt(match[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: Rgb): string {
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Linear mix in sRGB space: t=0 → a, t=1 → b. */
export function mix(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex([ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t]);
}

/** Positive amount lightens towards white, negative darkens towards black. */
export function shade(hex: string, amount: number): string {
  return amount >= 0 ? mix(hex, "#ffffff", amount) : mix(hex, "#000000", -amount);
}
