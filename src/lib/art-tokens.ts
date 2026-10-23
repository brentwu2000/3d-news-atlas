import { isHexColor, mix, shade } from "./color";

/**
 * Art-direction tokens (POLISH-V1). These are purely aesthetic and must never
 * be used to encode editorial meaning such as verification status or severity.
 * The CSS custom properties in globals.css are the source of truth at runtime;
 * DEFAULT_ART_TOKENS mirrors them for SSR, tests and as a fallback.
 */
export interface ArtTokens {
  backdrop: string;
  stone: string;
  sand: string;
  foliage: string;
  highlight: string;
}

export const DEFAULT_ART_TOKENS: ArtTokens = {
  backdrop: "#101b2b",
  stone: "#667080",
  sand: "#c4ad83",
  foliage: "#587d6b",
  highlight: "#e9d9ad",
};

export const ART_TOKEN_CSS_VARS: Record<keyof ArtTokens, string> = {
  backdrop: "--atlas-backdrop",
  stone: "--atlas-stone",
  sand: "--atlas-sand",
  foliage: "--atlas-foliage",
  highlight: "--atlas-highlight",
};

/** Read tokens from CSS custom properties; invalid or missing values fall back to defaults. */
export function readArtTokens(element: Element = document.documentElement): ArtTokens {
  const style = getComputedStyle(element);
  const tokens = { ...DEFAULT_ART_TOKENS };
  for (const key of Object.keys(ART_TOKEN_CSS_VARS) as Array<keyof ArtTokens>) {
    const value = style.getPropertyValue(ART_TOKEN_CSS_VARS[key]).trim();
    if (isHexColor(value)) tokens[key] = value.toLowerCase();
  }
  return tokens;
}

/** Named swatches derived from the five tokens; every scene colour comes from here. */
export interface ArtSwatches {
  backdrop: string;
  fog: string;
  stone: string;
  stoneLight: string;
  stoneDark: string;
  stoneDeep: string;
  sand: string;
  sandLight: string;
  sandDark: string;
  soil: string;
  foliage: string;
  foliageLight: string;
  foliageDark: string;
  foliageDeep: string;
  highlight: string;
  wall: string;
  wallWarm: string;
  wallCool: string;
  roof: string;
  roofDark: string;
  metal: string;
  water: string;
  trunk: string;
  lamp: string;
  skyLight: string;
  groundLight: string;
  keyLight: string;
  rimLight: string;
}

export function deriveSwatches(t: ArtTokens): ArtSwatches {
  return {
    backdrop: t.backdrop,
    fog: mix(t.backdrop, t.stone, 0.18),
    stone: t.stone,
    stoneLight: mix(t.stone, t.highlight, 0.35),
    stoneDark: shade(t.stone, -0.3),
    stoneDeep: mix(shade(t.stone, -0.55), t.backdrop, 0.3),
    sand: t.sand,
    sandLight: mix(t.sand, t.highlight, 0.45),
    sandDark: shade(t.sand, -0.25),
    soil: mix(shade(t.sand, -0.45), t.stone, 0.2),
    foliage: t.foliage,
    foliageLight: mix(t.foliage, t.highlight, 0.28),
    foliageDark: shade(t.foliage, -0.22),
    foliageDeep: mix(shade(t.foliage, -0.4), t.backdrop, 0.15),
    highlight: t.highlight,
    wall: mix(t.highlight, t.stone, 0.18),
    wallWarm: mix(t.highlight, t.sand, 0.45),
    wallCool: mix(t.stone, t.highlight, 0.6),
    roof: mix(shade(t.sand, -0.35), t.stone, 0.35),
    roofDark: shade(t.stone, -0.4),
    metal: mix(t.stone, t.highlight, 0.45),
    water: mix(mix(t.stone, t.backdrop, 0.45), t.foliage, 0.2),
    trunk: shade(t.sand, -0.5),
    lamp: shade(t.highlight, 0.15),
    skyLight: mix(t.highlight, "#dfe7f0", 0.6),
    groundLight: mix(t.backdrop, t.sand, 0.25),
    keyLight: mix(t.highlight, "#ffffff", 0.35),
    rimLight: mix(t.stone, "#c9d8ea", 0.6),
  };
}
