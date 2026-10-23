import type { WorldBounds } from "./layout";
import { createRng } from "./random";
import type { Vec3 } from "./tile-generator";

/**
 * Deterministic surroundings of the city: scattered trees on the ground
 * plane, a ring of distant hills, and an elevated rail loop.
 */

export interface TreeSpot {
  position: Vec3;
  scale: number;
  kind: "pine" | "round";
}

/** Rail loop radius relative to the city bounds. */
export const RAIL_MARGIN = 3.5;
export const RAIL_HEIGHT = 2.6;

export function railRadius(bounds: WorldBounds): number {
  return bounds.radius + RAIL_MARGIN;
}

export function generateTrees(bounds: WorldBounds, count: number, seed = "trees"): TreeSpot[] {
  const rng = createRng(seed);
  const rail = railRadius(bounds);
  const out: TreeSpot[] = [];
  for (let attempt = 0; attempt < count * 20 && out.length < count; attempt++) {
    const angle = rng.range(0, Math.PI * 2);
    const dist = bounds.radius + 1.2 + Math.sqrt(rng.next()) * bounds.radius * 1.4;
    // Keep the rail corridor clear.
    if (Math.abs(dist - rail) < 1.6) continue;
    const x = bounds.center[0] + Math.cos(angle) * dist;
    const z = bounds.center[2] + Math.sin(angle) * dist;
    if (out.some((t) => Math.hypot(t.position[0] - x, t.position[2] - z) < 1.4)) continue;
    out.push({ position: [x, 0, z], scale: rng.range(0.8, 1.6), kind: rng.next() < 0.7 ? "pine" : "round" });
  }
  return out;
}

export interface HillSpot {
  position: Vec3;
  radius: number;
  height: number;
  rotationY: number;
}

export function generateHills(bounds: WorldBounds, count: number, seed = "hills"): HillSpot[] {
  const rng = createRng(seed);
  return Array.from({ length: count }, (_, i) => {
    // Hills sit mostly behind the city (negative z = far side from the default camera).
    const angle = Math.PI + (i / Math.max(1, count - 1) - 0.5) * Math.PI * 1.5 + rng.range(-0.15, 0.15);
    const dist = bounds.radius * rng.range(2.4, 3.2);
    return {
      position: [bounds.center[0] + Math.cos(angle) * dist, 0, bounds.center[2] + Math.sin(angle) * dist],
      radius: bounds.radius * rng.range(0.5, 0.9),
      height: bounds.radius * rng.range(0.35, 0.7),
      rotationY: rng.range(0, Math.PI * 2),
    };
  });
}

/** Point on the rail loop at parameter t ∈ [0, 1). */
export function railPoint(bounds: WorldBounds, t: number): Vec3 {
  const a = t * Math.PI * 2;
  const r = railRadius(bounds);
  return [bounds.center[0] + Math.cos(a) * r, RAIL_HEIGHT, bounds.center[2] + Math.sin(a) * r];
}
