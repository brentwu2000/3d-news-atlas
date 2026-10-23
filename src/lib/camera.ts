import type { WorldBounds } from "./layout";

export type Vec3Tuple = [number, number, number];

export interface CameraPose {
  position: Vec3Tuple;
  target: Vec3Tuple;
}

export const CAMERA_FOV = 40;
const OVERVIEW_AZIMUTH = Math.PI / 4;
const OVERVIEW_ELEVATION = (38 * Math.PI) / 180;

/**
 * Deterministic overview pose that frames the whole world for a given
 * viewport aspect ratio. Same inputs always return the same pose.
 */
export function overviewPose(bounds: WorldBounds, aspect: number, fovDeg = CAMERA_FOV): CameraPose {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const vFov = (fovDeg * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * safeAspect);
  const limiting = Math.min(vFov, hFov);
  // Pad slightly so island bases and labels stay in frame.
  // Seen from above, the island ring fills less height than its bounding sphere,
  // so landscape can frame tighter than portrait (which is width-limited).
  // tests/unit/silhouette.test.ts guards that every island stays on screen.
  const fit = hFov < vFov ? 1.02 : 0.92;
  const distance = (bounds.radius * fit) / Math.sin(limiting / 2);
  const [cx, cy, cz] = bounds.center;
  const ty = cy - 1;
  const horizontal = Math.cos(OVERVIEW_ELEVATION) * distance;
  return {
    target: [cx, ty, cz],
    position: [
      round(cx + Math.cos(OVERVIEW_AZIMUTH) * horizontal),
      round(ty + Math.sin(OVERVIEW_ELEVATION) * distance),
      round(cz + Math.sin(OVERVIEW_AZIMUTH) * horizontal),
    ],
  };
}

export interface OrbitLimits {
  minDistance: number;
  maxDistance: number;
  minPolarAngle: number;
  maxPolarAngle: number;
  /** Max horizontal distance the orbit target may be panned from the world centre. */
  panRadius: number;
}

export function orbitLimits(bounds: WorldBounds): OrbitLimits {
  return {
    minDistance: 6,
    // Portrait phones need ~6x radius to frame the whole world (see overviewPose).
    maxDistance: bounds.radius * 8,
    minPolarAngle: 0.15,
    // Stop a little below the horizon so the camera never ends up under the world.
    maxPolarAngle: Math.PI * 0.62,
    panRadius: bounds.radius * 1.1,
  };
}

const TARGET_MIN_Y = -8;
const TARGET_MAX_Y = 8;

/** Correction that keeps a panned orbit target inside the world; [0,0,0] when already inside. */
export function clampTargetDelta(target: Vec3Tuple, bounds: WorldBounds, panRadius: number): Vec3Tuple {
  const [cx, , cz] = bounds.center;
  const dx = target[0] - cx;
  const dz = target[2] - cz;
  const d = Math.hypot(dx, dz);
  let ox = 0;
  let oz = 0;
  if (d > panRadius) {
    const k = panRadius / d;
    ox = cx + dx * k - target[0];
    oz = cz + dz * k - target[2];
  }
  const oy = target[1] < TARGET_MIN_Y ? TARGET_MIN_Y - target[1] : target[1] > TARGET_MAX_Y ? TARGET_MAX_Y - target[1] : 0;
  return [ox, oy, oz];
}

export interface FocusOptions {
  /** Fraction of the canvas width the island should span (POLISH-V1: 0.35–0.55 desktop). */
  widthFraction: number;
  /** Fraction of the canvas width covered by a drawer on the right (0 when none). */
  occludedRight?: number;
}

const FOCUS_ELEVATION = (40 * Math.PI) / 180;
/** Keep the focus camera from getting so close that it clips terrain or feels nauseating. */
export const FOCUS_MIN_DISTANCE = 12;
export const FOCUS_MAX_DISTANCE = 60;

/** Desktop and mobile framing targets for a focused island. */
export const FOCUS_WIDTH_DESKTOP = 0.45;
export const FOCUS_WIDTH_MOBILE = 0.4;

/**
 * Deterministic focus pose for one island: fixed azimuth/elevation, distance
 * chosen so the island footprint spans `widthFraction` of the canvas, and the
 * look-at point shifted so the island sits centred in the unoccluded area.
 */
export function focusPose(
  island: { x: number; y: number; z: number; radius: number },
  aspect: number,
  { widthFraction, occludedRight = 0 }: FocusOptions,
  fovDeg = CAMERA_FOV,
): CameraPose {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const vFov = (fovDeg * Math.PI) / 180;
  const halfWidthPerDistance = Math.tan(vFov / 2) * safeAspect;
  const fraction = Math.min(0.9, Math.max(0.1, widthFraction));
  const raw = (2 * island.radius) / (fraction * 2 * halfWidthPerDistance);
  const distance = Math.min(FOCUS_MAX_DISTANCE, Math.max(FOCUS_MIN_DISTANCE, raw));
  // World width visible at the target plane; shift right by half the occluded part.
  const visibleWidth = 2 * distance * halfWidthPerDistance;
  const shift = (Math.min(0.6, Math.max(0, occludedRight)) / 2) * visibleWidth;
  const az = OVERVIEW_AZIMUTH;
  const right: Vec3Tuple = [Math.sin(az), 0, -Math.cos(az)];
  const target: Vec3Tuple = [
    round(island.x + right[0] * shift),
    round(island.y + 1),
    round(island.z + right[2] * shift),
  ];
  const horizontal = Math.cos(FOCUS_ELEVATION) * distance;
  return {
    target,
    position: [
      round(target[0] + Math.cos(az) * horizontal),
      round(target[1] + Math.sin(FOCUS_ELEVATION) * distance),
      round(target[2] + Math.sin(az) * horizontal),
    ],
  };
}

/**
 * Whether a remembered user orbit is still a sensible place to return to
 * (inside orbit limits and pan radius). Otherwise use the canonical overview.
 */
export function isPoseSafe(pose: CameraPose, bounds: WorldBounds): boolean {
  const limits = orbitLimits(bounds);
  const values = [...pose.position, ...pose.target];
  if (!values.every(Number.isFinite)) return false;
  const [dx, dy, dz] = pose.position.map((v, i) => v - (pose.target[i] ?? 0)) as Vec3Tuple;
  const distance = Math.hypot(dx, dy, dz);
  if (distance < limits.minDistance || distance > limits.maxDistance) return false;
  const polar = Math.acos(Math.min(1, Math.max(-1, dy / distance)));
  if (polar < limits.minPolarAngle - 1e-6 || polar > limits.maxPolarAngle + 1e-6) return false;
  const [ox, oy, oz] = clampTargetDelta(pose.target, bounds, limits.panRadius);
  return Math.abs(ox) < 1e-6 && Math.abs(oy) < 1e-6 && Math.abs(oz) < 1e-6;
}

export function posesEqual(a: CameraPose, b: CameraPose, epsilon = 1e-3): boolean {
  return [...a.position, ...a.target].every((v, i) => Math.abs(v - ([...b.position, ...b.target][i] ?? NaN)) <= epsilon);
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
