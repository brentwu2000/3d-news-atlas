import { ROAD_INNER, ROAD_OUTER } from "./city-geometry";
import { hexCorner, TILE_SIZE } from "./hex";
import type { IslandPlacement } from "./layout";
import { createRng } from "./random";

/**
 * Ambient city life: pedestrians walking the sidewalk loop of each tile and
 * cars driving its road ring. Everything here is pure and seeded, so the
 * same inputs always give the same crowd; animation only advances `s`
 * (distance along the loop) with time.
 *
 * Purely decorative: walkers and cars never represent people or events in
 * the news data.
 */

/** Sidewalk loop radius (fraction of tile radius): outside every prop footprint, inside the kerb lamps. */
export const SIDEWALK_RADIUS = 0.755;
/** Inner and outer driving lanes. */
export const LANE_INNER = ROAD_INNER + (ROAD_OUTER - ROAD_INNER) * 0.28;
export const LANE_OUTER = ROAD_INNER + (ROAD_OUTER - ROAD_INNER) * 0.72;

export interface Walker {
  tile: number;
  /** Loop radius in world units. */
  radius: number;
  /** +1 counter-clockwise, -1 clockwise (viewed from above). */
  direction: 1 | -1;
  /** World units per second. */
  speed: number;
  /** Starting fraction of the loop, 0..1. */
  start: number;
  /** Small sideways offset so walkers don't all share one line. */
  lateral: number;
  scale: number;
  skin: string;
  hair: string;
  shirt: string;
  pants: string;
}

export interface Car {
  tile: number;
  radius: number;
  direction: 1 | -1;
  speed: number;
  start: number;
  body: string;
}

const SKIN = ["#f1c8a5", "#e2b08a", "#c98f6b", "#a8714f", "#f4d6bd"] as const;
const HAIR = ["#2b2220", "#3d2b22", "#5a3b26", "#1c1c22", "#8a6a4a", "#c9c2b8"] as const;
const SHIRT = ["#d0402f", "#2f6db3", "#f2c94c", "#3f8e8a", "#f5f3ee", "#7d5ba6", "#ef8a2f", "#4e8f4f"] as const;
const PANTS = ["#2f3653", "#3b3b4a", "#5a4a3a", "#6b7080", "#1d1a17"] as const;
const CAR_COLORS = ["#d0402f", "#f5f3ee", "#2f6db3", "#f2c94c", "#3b3b4a", "#3f8e8a"] as const;

export function generateWalkers(placements: readonly IslandPlacement[], perTile: number, seed = "walkers"): Walker[] {
  const rng = createRng(seed);
  const out: Walker[] = [];
  placements.forEach((p, tile) => {
    const n = Math.max(0, Math.round(perTile + rng.range(-1, 1)));
    for (let i = 0; i < n; i++) {
      out.push({
        tile,
        radius: p.radius * SIDEWALK_RADIUS,
        direction: rng.next() < 0.5 ? 1 : -1,
        speed: rng.range(0.35, 0.6),
        start: rng.next(),
        lateral: rng.range(-0.08, 0.08),
        scale: rng.range(0.9, 1.08),
        skin: rng.pick(SKIN),
        hair: rng.pick(HAIR),
        shirt: rng.pick(SHIRT),
        pants: rng.pick(PANTS),
      });
    }
  });
  return out;
}

export function generateCars(placements: readonly IslandPlacement[], count: number, seed = "cars"): Car[] {
  const rng = createRng(seed);
  return Array.from({ length: Math.min(count, placements.length * 2) }, (_, i) => {
    const direction = rng.next() < 0.5 ? 1 : -1;
    return {
      // Spread cars over different tiles.
      tile: (i * 7) % placements.length,
      // Drive on the right: counter-clockwise traffic uses the outer lane.
      radius: (placements[0]?.radius ?? TILE_SIZE) * (direction === 1 ? LANE_OUTER : LANE_INNER),
      direction,
      speed: rng.range(1.6, 2.6),
      start: rng.next(),
      body: rng.pick(CAR_COLORS),
    };
  });
}

/** Perimeter length of a flat-top hex loop of the given radius. */
export function loopLength(radius: number): number {
  return radius * 6;
}

/**
 * Point on a hex loop (tile-local) at fraction `u` (wraps), plus the heading
 * (rotation about +y) of travel in the given direction.
 */
export function loopPoint(radius: number, u: number, direction: 1 | -1): { x: number; z: number; heading: number } {
  const f = (((u % 1) + 1) % 1) * 6;
  const edge = Math.floor(f) % 6;
  const t = f - Math.floor(f);
  const [ax, az] = hexCorner(edge, radius);
  const [bx, bz] = hexCorner(edge + 1, radius);
  const x = ax + (bx - ax) * t;
  const z = az + (bz - az) * t;
  // Heading so that local +z of the figure points along travel.
  const dx = (bx - ax) * direction;
  const dz = (bz - az) * direction;
  return { x, z, heading: Math.atan2(dx, dz) };
}

/** Loop fraction after `seconds` of travel. Direction -1 walks the loop backwards. */
export function travelled(start: number, speed: number, radius: number, direction: 1 | -1, seconds: number): number {
  return start + (direction * speed * seconds) / loopLength(radius);
}
