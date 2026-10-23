import { insideHex, TILE_SIZE } from "./hex";
import { hashString } from "./random";
import type { TileSpec, Vec3 } from "./tile-generator";
import { INNER_FRACTION } from "./tile-generator";

/**
 * Event beacon placement inside a tile. Positions depend only on the tile
 * spec and the topic's full, sorted event list, so filtering events hides
 * beacons without moving the remaining ones.
 */

/** Height of the pick target (middle of the light beam). */
export const MARKER_HEIGHT = 1.2;
export const BEAM_HEIGHT = 2.6;
export const BEACON_RADIUS = 0.42;
/** Invisible pick radius; larger than the ring for reliable touch selection. */
export const MARKER_HIT_RADIUS = 0.7;
/** Preferred spacing first; relaxed only when a tile gets crowded. */
const SEPARATION_STEPS = [1.5, 1.15, 0.9] as const;
/** Designed capacity per tile; tests guarantee clean spacing up to this many. */
export const MARKER_CAPACITY = 16;
const CANDIDATES = 200;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export interface MarkerPlacement {
  eventId: string;
  /** Tile-local position of the pick target (beam centre). */
  head: Vec3;
  /** Ground height under the beacon. */
  groundY: number;
}

export function layoutMarkers(spec: TileSpec, eventIds: readonly string[]): MarkerPlacement[] {
  const limit = TILE_SIZE * INNER_FRACTION * 0.92;
  const rotation = ((hashString(`markers:${spec.seed}`) % 360) * Math.PI) / 180;
  // Prefer open ground: avoid the footprints of tall props when possible.
  const blockers = spec.props
    .filter((p) => p.kind !== "patch" && p.kind !== "track" && p.kind !== "water" && p.scale[1] > 1.4)
    .map((p) => ({ x: p.position[0], z: p.position[2], r: Math.max(p.scale[0], p.scale[2]) * 0.5 }));

  const candidates = Array.from({ length: CANDIDATES }, (_, j) => {
    const u = (j + 0.5) / CANDIDATES;
    const r = limit * Math.sqrt(u);
    const a = rotation + j * GOLDEN_ANGLE;
    return { x: Math.cos(a) * r, z: Math.sin(a) * r };
  }).filter((c) => insideHex(c.x, c.z, limit));

  const free = (c: { x: number; z: number }) => blockers.every((b) => Math.hypot(b.x - c.x, b.z - c.z) > b.r + 0.3);
  const ordered = [...candidates.filter(free), ...candidates.filter((c) => !free(c))];
  const stride = 61;
  const used = new Set<number>();
  const placed: MarkerPlacement[] = [];

  eventIds.forEach((eventId, i) => {
    let chosen = -1;
    for (const separation of SEPARATION_STEPS) {
      for (let k = 0; k < ordered.length && chosen < 0; k++) {
        // Walk from a different start per event so beacons spread around the tile.
        const j = (i * stride + k) % ordered.length;
        if (used.has(j)) continue;
        const c = ordered[j]!;
        if (placed.every((m) => Math.hypot(m.head[0] - c.x, m.head[2] - c.z) >= separation)) chosen = j;
      }
      if (chosen >= 0) break;
    }
    if (chosen < 0) chosen = (i * stride) % ordered.length; // over capacity: overlap rather than drop an event
    used.add(chosen);
    const c = ordered[chosen]!;
    placed.push({ eventId, head: [c.x, MARKER_HEIGHT, c.z], groundY: 0 });
  });
  return placed;
}
