import { rimRadiusAt, surfaceHeightAt, type IslandSpec, type Vec3 } from "./island-generator";
import { hashString } from "./random";

/**
 * Event marker placement on an island. Positions depend only on the island
 * spec and the topic's full, sorted event list, so filtering events hides
 * markers without moving the remaining ones.
 */

/** Marker heads float this far above the local terrain, above most props. */
export const MARKER_HEIGHT = 3;
/** Head radius in world units (same for every event: size never encodes meaning). */
export const MARKER_HEAD_SIZE = 0.42;
/** Invisible pick radius; larger than the head for reliable touch selection. */
export const MARKER_HIT_RADIUS = 0.75;
/** Preferred spacing first; relaxed only when an island gets crowded. */
const SEPARATION_STEPS = [1.6, 1.25, 0.95] as const;
/** Designed capacity per island; tests guarantee clean spacing up to this many. */
export const MARKER_CAPACITY = 24;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export interface MarkerPlacement {
  eventId: string;
  /** Island-local position of the marker head. */
  head: Vec3;
  /** Terrain height directly below the head (stem base). */
  groundY: number;
}

/** Deterministic candidate spots: a Vogel sunflower over the usable annulus (near-uniform spacing). */
const CANDIDATES = 240;

export function layoutMarkers(spec: IslandSpec, eventIds: readonly string[]): MarkerPlacement[] {
  const placed: MarkerPlacement[] = [];
  const rotation = ((hashString(`markers:${spec.seed}`) % 360) * Math.PI) / 180;
  const crowded = eventIds.length > 10;
  // Small sets stay in the calm mid-ring; crowded islands use more of the surface.
  const [tMin, tMax] = crowded ? [0.2, 0.86] : [0.4, 0.75];

  const candidates = Array.from({ length: CANDIDATES }, (_, j) => {
    const u = (j + 0.5) / CANDIDATES;
    // Area-uniform radius within [tMin, tMax].
    const t = Math.sqrt(tMin * tMin + u * (tMax * tMax - tMin * tMin));
    const angle = rotation + j * GOLDEN_ANGLE;
    const r = rimRadiusAt(spec, angle) * t;
    return { x: Math.cos(angle) * r, z: Math.sin(angle) * r };
  });
  // Spread consecutive events around the island instead of filling one side first.
  const stride = 97; // coprime with CANDIDATES
  const used = new Set<number>();

  eventIds.forEach((eventId, i) => {
    let chosen = -1;
    for (const separation of SEPARATION_STEPS) {
      for (let k = 0; k < CANDIDATES && chosen < 0; k++) {
        const j = (i * stride + k) % CANDIDATES;
        if (used.has(j)) continue;
        const c = candidates[j]!;
        if (placed.every((m) => Math.hypot(m.head[0] - c.x, m.head[2] - c.z) >= separation)) chosen = j;
      }
      if (chosen >= 0) break;
    }
    if (chosen < 0) chosen = (i * stride) % CANDIDATES; // over capacity: overlap rather than drop an event
    used.add(chosen);
    const { x, z } = candidates[chosen]!;
    const groundY = surfaceHeightAt(spec, x, z);
    placed.push({ eventId, head: [x, groundY + MARKER_HEIGHT, z], groundY });
  });
  return placed;
}
