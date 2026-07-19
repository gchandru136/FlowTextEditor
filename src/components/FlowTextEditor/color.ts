/**
 * Dependency-free colour conversion helpers used by the colour toolbar tools
 * and the custom colour picker. All functions are pure.
 */

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface RgbaColor extends RgbColor {
  a: number;
}

/** Hue 0–360, saturation 0–1, value 0–1. */
export interface HsvColor {
  h: number;
  s: number;
  v: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const clampByte = (value: number): number => clamp(Math.round(value) || 0, 0, 255);

/** Parse `#rgb` / `#rrggbb` (leading `#` optional). Returns null when invalid. */
export function hexToRgb(input: string): RgbColor | null {
  let hex = input.trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{3}$/.test(hex)) {
    hex = hex
      .split('')
      .map((char) => char + char)
      .join('');
  }
  if (!/^[0-9a-f]{6}$/.test(hex)) return null;
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

export function rgbToHex({ r, g, b }: RgbColor): string {
  const part = (value: number) => clampByte(value).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

export function rgbToHsv({ r, g, b }: RgbColor): HsvColor {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === rn) h = 60 * (((gn - bn) / delta) % 6);
    else if (max === gn) h = 60 * ((bn - rn) / delta + 2);
    else h = 60 * ((rn - gn) / delta + 4);
  }
  if (h < 0) h += 360;
  return { h, s: max === 0 ? 0 : delta / max, v: max };
}

export function hsvToRgb({ h, s, v }: HsvColor): RgbColor {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let rn = 0;
  let gn = 0;
  let bn = 0;
  if (h < 60) [rn, gn, bn] = [c, x, 0];
  else if (h < 120) [rn, gn, bn] = [x, c, 0];
  else if (h < 180) [rn, gn, bn] = [0, c, x];
  else if (h < 240) [rn, gn, bn] = [0, x, c];
  else if (h < 300) [rn, gn, bn] = [x, 0, c];
  else [rn, gn, bn] = [c, 0, x];
  return {
    r: clampByte((rn + m) * 255),
    g: clampByte((gn + m) * 255),
    b: clampByte((bn + m) * 255),
  };
}

const RGB_PATTERN = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i;

/** Parse a computed CSS colour (`rgb(...)`, `rgba(...)`, hex, `transparent`). */
export function parseCssColor(input: string): RgbaColor | null {
  const value = input.trim().toLowerCase();
  if (value === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const fromHex = hexToRgb(value);
  if (fromHex) return { ...fromHex, a: 1 };
  const match = RGB_PATTERN.exec(value);
  if (!match) return null;
  return {
    r: clampByte(Number(match[1])),
    g: clampByte(Number(match[2])),
    b: clampByte(Number(match[3])),
    a: match[4] === undefined ? 1 : clamp(Number(match[4]), 0, 1),
  };
}
