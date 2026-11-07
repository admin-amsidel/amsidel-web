/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */

/** A colour set a brand can choose. colors: the whole set as shown to choose from. base and accent: what the portal is coloured with. */
/* base: never a blue, or the brand could not be told from the standard look. */
export interface BrandPalette {
  code: string;
  name: string;
  colors: string[];
  base: string;
  accent: string;
}

/** The codes are also in BrandService in amsidel-backend, which refuses any other. */
export const BRAND_PALETTES: BrandPalette[] = [
  { code: 'VIVID', name: 'Vivid', base: '#1BD1B9', accent: '#F99340', colors: ['#3D96E5', '#1BD1B9', '#EA607C', '#F99340', '#FEC236', '#9B7FD1', '#1BC8E3', '#9EDD3B'] },
  { code: 'SOFT', name: 'Soft', base: '#FC9D73', accent: '#7196B0', colors: ['#A1DEFC', '#C1E79B', '#BBBBBD', '#FC9D73', '#FFDA6C', '#FE7678', '#B09380', '#7196B0', '#DFE2D3', '#C5B88A'] },
  { code: 'BOLD', name: 'Bold', base: '#6775C7', accent: '#FDB441', colors: ['#4CD5C5', '#6775C7', '#FDB441', '#A371D5', '#F15F8F', '#88D451', '#399BC8', '#F18463', '#FCBE53', '#6C6C6C'] },
  { code: 'EARTH', name: 'Earth', base: '#88C3A4', accent: '#E77C64', colors: ['#88C3A4', '#5998BF', '#EBC16D', '#E77C64', '#A67FCC', '#7AC3E3', '#83839F', '#B78961', '#AEA8A6', '#B8D773'] },
  { code: 'BLUSH', name: 'Blush', base: '#C572A8', accent: '#60B3F0', colors: ['#EE747A', '#F3CD5C', '#74DFA5', '#60B3F0', '#787BEA', '#B17EED', '#EC88C7', '#C572A8', '#9E718C', '#955E71'] },
];

/** The choice of no palette at all, for the brand form. Never sent as a code. */
export const STANDARD_LOOK: BrandPalette = { code: 'STANDARD', name: 'Standard', base: '#2f80d6', accent: '#e39a2d', colors: ['#2f80d6', '#173b63', '#e3effc'] };

type Rgb = [number, number, number];

function rgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hex(c: Rgb): string {
  return '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

/** weight 0 = a, 1 = b. */
function mix(a: Rgb, b: Rgb, weight: number): Rgb {
  return [a[0] + (b[0] - a[0]) * weight, a[1] + (b[1] - a[1]) * weight, a[2] + (b[2] - a[2]) * weight];
}

function luminance(c: Rgb): number {
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Against white. */
export function contrastOnWhite(color: string): number {
  return 1.05 / (luminance(rgb(color)) + 0.05);
}

const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];
/** What white button text and links on white need to stay easy to read (WCAG AA). */
const READABLE = 4.6;

/** The colour darkened only as far as white text on it stays readable: pale samples cannot carry a button as they are. */
function readable(color: Rgb): Rgb {
  let c = color;
  for (let i = 0; i < 40 && 1.05 / (luminance(c) + 0.05) < READABLE; i++) {
    c = mix(c, BLACK, 0.04);
  }
  return c;
}

/** The portal's colour variables for a palette: the portal's own, and PrimeNG's primary shades. */
export function paletteVariables(p: BrandPalette): Record<string, string> {
  const main = readable(rgb(p.base));
  const shade = (w: number) => hex(mix(main, BLACK, w));
  const tint = (w: number) => hex(mix(main, WHITE, w));
  return {
    '--brass': hex(main),
    '--brass-dark': shade(0.18),
    '--brand-deep': shade(0.28),
    '--dark': shade(0.55),
    '--gold-hi': tint(0.62),
    '--accent-line': tint(0.68),
    '--accent-soft': tint(0.86),
    '--accent-softer': tint(0.93),
    '--line': hex(mix(mix(main, WHITE, 0.82), [228, 228, 228], 0.45)),
    '--soft': tint(0.96),
    '--accent2': hex(readable(rgb(p.accent))),
    '--top-strip': `linear-gradient(90deg, ${p.colors.join(', ')})`,
    '--p-primary-50': tint(0.93),
    '--p-primary-100': tint(0.86),
    '--p-primary-200': tint(0.72),
    '--p-primary-300': tint(0.52),
    '--p-primary-400': tint(0.26),
    '--p-primary-500': hex(main),
    '--p-primary-600': shade(0.18),
    '--p-primary-700': shade(0.32),
    '--p-primary-800': shade(0.44),
    '--p-primary-900': shade(0.55),
    '--p-primary-950': shade(0.7),
  };
}

let applied: string[] = [];

/**
 * Colours the portal with a brand's palette, over the portal's defaults in portal.scss and portal-ui.ts; none = those
 * defaults. Set on the page's root so that popups outside the portal's frame follow too, and taken off when the portal closes.
 */
export function applyBrandPalette(code: string | null | undefined): void {
  const root = document.documentElement;
  applied.forEach((name) => root.style.removeProperty(name));
  applied = [];
  const palette = BRAND_PALETTES.find((p) => p.code === code);
  if (!palette) return;
  const variables = paletteVariables(palette);
  Object.entries(variables).forEach(([name, value]) => root.style.setProperty(name, value));
  applied = Object.keys(variables);
}
