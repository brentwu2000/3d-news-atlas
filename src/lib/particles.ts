import type { WorldBounds } from "./layout";
import { createRng } from "./random";

/** Hard caps from POLISH-V1 regardless of what a quality preset asks for. */
export const MAX_PARTICLES_DESKTOP = 100;
export const MAX_PARTICLES_MOBILE = 30;

/**
 * Deterministic dust positions in a flattened shell around the world.
 * Returns a flat [x, y, z, ...] array suitable for a BufferAttribute.
 */
export function generateParticlePositions(bounds: WorldBounds, count: number, seed = "atlas-dust"): number[] {
  const n = Math.max(0, Math.min(MAX_PARTICLES_DESKTOP, Math.floor(count)));
  const rng = createRng(seed);
  const [cx, cy, cz] = bounds.center;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const angle = rng.range(0, Math.PI * 2);
    const dist = bounds.radius * Math.sqrt(rng.range(0.05, 1.4));
    out.push(cx + Math.cos(angle) * dist, cy + rng.range(-9, 7), cz + Math.sin(angle) * dist);
  }
  return out;
}
