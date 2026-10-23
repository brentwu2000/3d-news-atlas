export type QualityLevel = "high" | "low";
export type QualityPreference = QualityLevel | "auto";

export interface QualitySettings {
  level: QualityLevel;
  /** [min, max] device-pixel-ratio passed to the Canvas. */
  dpr: [number, number];
  antialias: boolean;
  shadows: boolean;
  shadowMapSize: number;
  propDensity: number;
  terrainSegments: number;
  /** Ambient dust particles (POLISH-V1 budget: <= 100 desktop, <= 30 mobile). */
  particles: number;
  /** Cool back light (no shadows, cheap) that separates silhouettes from the navy backdrop. */
  rimLight: boolean;
}

export interface DeviceHints {
  coarsePointer: boolean;
  viewportWidth: number;
  hardwareConcurrency?: number;
  deviceMemory?: number;
}

/** Heuristic: phones/small tablets and weak machines get the low preset. */
export function detectQuality(hints: DeviceHints): QualityLevel {
  if (hints.coarsePointer && hints.viewportWidth < 1024) return "low";
  if (hints.hardwareConcurrency !== undefined && hints.hardwareConcurrency <= 2) return "low";
  if (hints.deviceMemory !== undefined && hints.deviceMemory <= 2) return "low";
  return "high";
}

export function resolveQuality(preference: QualityPreference, hints: DeviceHints): QualityLevel {
  return preference === "auto" ? detectQuality(hints) : preference;
}

export function qualitySettings(level: QualityLevel): QualitySettings {
  return level === "high"
    ? { level, dpr: [1, 1.5], antialias: true, shadows: true, shadowMapSize: 1024, propDensity: 1, terrainSegments: 24, particles: 90, rimLight: true }
    : { level, dpr: [1, 1], antialias: false, shadows: false, shadowMapSize: 512, propDensity: 0.6, terrainSegments: 16, particles: 24, rimLight: true };
}

export function readDeviceHints(): DeviceHints {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    coarsePointer: window.matchMedia("(pointer: coarse)").matches,
    viewportWidth: window.innerWidth,
    hardwareConcurrency: nav.hardwareConcurrency,
    deviceMemory: nav.deviceMemory,
  };
}
