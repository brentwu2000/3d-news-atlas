import { ROAD_INNER, ROAD_OUTER } from "./city-geometry";
import { hexCorner, hexDistance, SQRT3, TILE_SIZE } from "./hex";
import type { IslandPlacement } from "./layout";
import { createRng, hashString, type Rng } from "./random";
import type { PropKind, TileSpec } from "./tile-generator";
import { INNER_FRACTION } from "./tile-generator";

/**
 * Ambient city life: pedestrians on sidewalks, inside open tiles and across
 * zebra crossings between tiles, plus cars on the road rings. Everything is
 * pure and seeded; animation only advances a walker's distance along its
 * closed polyline path.
 *
 * Purely decorative: walkers and cars never represent people or events in
 * the news data.
 */

export type Vec2 = [number, number];

/** Sidewalk loop radius (fraction of tile radius): outside every prop footprint, inside the kerb lamps. */
export const SIDEWALK_RADIUS = 0.755;
/** Inner and outer driving lanes. */
export const LANE_INNER = ROAD_INNER + (ROAD_OUTER - ROAD_INNER) * 0.28;
export const LANE_OUTER = ROAD_INNER + (ROAD_OUTER - ROAD_INNER) * 0.72;
/** Crossings are offset along the edge so they clear the mid-edge street lamp. */
const CROSSING_OFFSET = 0.6;
/** Clearance kept between a walking path and any blocking prop. */
const PATH_CLEARANCE = 0.3;

export type WalkerKind = "sidewalk" | "interior" | "crossing";

export interface Walker {
  kind: WalkerKind;
  /** Closed polyline in world space (x, z). A two-point path walks there and back. */
  path: Vec2[];
  /** World units per second. */
  speed: number;
  /** Starting fraction of the path, 0..1. */
  start: number;
  scale: number;
  skin: string;
  hair: string;
  shirt: string;
  pants: string;
}

export interface Car {
  path: Vec2[];
  speed: number;
  start: number;
  body: string;
}

export interface Stripe {
  x: number;
  z: number;
  /** Rotation about +y; the stripe's long side runs along local x. */
  rotationY: number;
}

const SKIN = ["#f1c8a5", "#e2b08a", "#c98f6b", "#a8714f", "#f4d6bd"] as const;
const HAIR = ["#2b2220", "#3d2b22", "#5a3b26", "#1c1c22", "#8a6a4a", "#c9c2b8"] as const;
const SHIRT = ["#d0402f", "#2f6db3", "#f2c94c", "#3f8e8a", "#f5f3ee", "#7d5ba6", "#ef8a2f", "#4e8f4f"] as const;
const PANTS = ["#2f3653", "#3b3b4a", "#5a4a3a", "#6b7080", "#1d1a17"] as const;
const CAR_COLORS = ["#d0402f", "#f5f3ee", "#2f6db3", "#f2c94c", "#3b3b4a", "#3f8e8a"] as const;

/** Presets with open ground where people stroll inside the tile. */
const STROLL_PRESETS = new Set(["city", "civic", "market", "fair", "school", "hospital", "housing", "tech", "stadium", "oldtown", "farm", "coast"]);
/** Props you can walk over (flat ground markings). */
const WALKABLE: ReadonlySet<PropKind> = new Set<PropKind>(["patch", "track", "car"]);

function look(rng: Rng) {
  return {
    scale: rng.range(0.9, 1.08),
    skin: rng.pick(SKIN),
    hair: rng.pick(HAIR),
    shirt: rng.pick(SHIRT),
    pants: rng.pick(PANTS),
  };
}

function hexPath(cx: number, cz: number, radius: number): Vec2[] {
  return Array.from({ length: 6 }, (_, i) => {
    const [x, z] = hexCorner(i, radius);
    return [cx + x, cz + z] as Vec2;
  });
}

/** Distance from point p to segment ab. */
export function pointSegmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b[0] - a[0];
  const abz = b[1] - a[1];
  const len2 = abx * abx + abz * abz || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * abz) / len2));
  return Math.hypot(p[0] - (a[0] + abx * t), p[1] - (a[1] + abz * t));
}

export interface Blocker {
  x: number;
  z: number;
  r: number;
}

/** Tile-local footprints that walkers must avoid (buildings, water, trees…). */
export function blockers(spec: TileSpec): Blocker[] {
  return spec.props
    .filter((p) => !WALKABLE.has(p.kind))
    .map((p) => ({ x: p.position[0], z: p.position[2], r: Math.max(p.scale[0], p.scale[2]) * 0.5 }));
}

/**
 * A short closed stroll through a tile's open ground (tile-local), or null if
 * the tile is too crowded. Every segment keeps PATH_CLEARANCE from blockers.
 */
export function interiorPath(spec: TileSpec, rng: Rng): Vec2[] | null {
  const obstacles = blockers(spec);
  const limit = TILE_SIZE * INNER_FRACTION * 0.95;
  const clearPoint = (p: Vec2) => obstacles.every((b) => Math.hypot(p[0] - b.x, p[1] - b.z) > b.r + PATH_CLEARANCE + 0.1);
  const clearSegment = (a: Vec2, b: Vec2) => obstacles.every((o) => pointSegmentDistance([o.x, o.z], a, b) > o.r + PATH_CLEARANCE);
  const candidates: Vec2[] = [];
  for (let i = 0; i < 80 && candidates.length < 24; i++) {
    const p: Vec2 = [rng.range(-limit, limit), rng.range(-limit, limit)];
    // Inside the hex (flat-top) and on open ground.
    if (Math.abs(p[1]) > (SQRT3 / 2) * limit || (SQRT3 / 2) * Math.abs(p[0]) + Math.abs(p[1]) / 2 > (SQRT3 / 2) * limit) continue;
    if (clearPoint(p)) candidates.push(p);
  }
  if (candidates.length < 2) return null;
  const path: Vec2[] = [candidates[0]!];
  const used = new Set([0]);
  while (path.length < 5) {
    const last = path[path.length - 1]!;
    let best = -1;
    let bestD = Infinity;
    candidates.forEach((c, i) => {
      if (used.has(i)) return;
      const d = Math.hypot(c[0] - last[0], c[1] - last[1]);
      if (d >= 1.2 && d < bestD && clearSegment(last, c)) {
        best = i;
        bestD = d;
      }
    });
    if (best < 0) break;
    used.add(best);
    path.push(candidates[best]!);
  }
  if (path.length < 2) return null;
  // Close the loop if possible; otherwise walk the same route back.
  if (path.length >= 3 && clearSegment(path[path.length - 1]!, path[0]!)) return path;
  return [...path, ...path.slice(1, -1).reverse()];
}

export interface Crossing {
  /** Tile indices joined by the crossing. */
  a: number;
  b: number;
  /** Sidewalk endpoints (world space). */
  from: Vec2;
  to: Vec2;
  stripes: Stripe[];
}

/** Zebra crossings over roughly half of the shared edges between neighbouring tiles. */
export function generateCrossings(placements: readonly IslandPlacement[]): Crossing[] {
  const out: Crossing[] = [];
  const R = TILE_SIZE;
  const sidewalkApothem = SIDEWALK_RADIUS * R * (SQRT3 / 2);
  const roadStart = ROAD_INNER * R * (SQRT3 / 2);
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      const A = placements[i]!;
      const B = placements[j]!;
      if (hexDistance(A, B) !== 1) continue;
      if (hashString(`crossing:${A.topicId}:${B.topicId}`) % 2 !== 0) continue;
      const dist = Math.hypot(B.x - A.x, B.z - A.z);
      const dx = (B.x - A.x) / dist;
      const dz = (B.z - A.z) / dist;
      // Along the shared edge, offset away from the mid-edge lamp.
      const ex = -dz * CROSSING_OFFSET;
      const ez = dx * CROSSING_OFFSET;
      const from: Vec2 = [A.x + dx * sidewalkApothem + ex, A.z + dz * sidewalkApothem + ez];
      const to: Vec2 = [B.x - dx * sidewalkApothem + ex, B.z - dz * sidewalkApothem + ez];
      const stripes: Stripe[] = [];
      for (let t = roadStart + 0.18; t < dist - roadStart - 0.1; t += 0.36) {
        // Local +x of the stripe → along the shared edge, i.e. (-dz, dx).
        stripes.push({ x: A.x + dx * t + ex, z: A.z + dz * t + ez, rotationY: Math.atan2(-dx, -dz) });
      }
      out.push({ a: i, b: j, from, to, stripes });
    }
  }
  return out;
}

export interface CrowdOptions {
  /** Average sidewalk walkers per tile. */
  perTile: number;
  /** Strollers inside each open tile. */
  interiorPerTile: number;
  /** Fraction of crossings with someone crossing. */
  crossingShare: number;
}

export function generateWalkers(
  placements: readonly IslandPlacement[],
  tiles: ReadonlyMap<string, TileSpec>,
  { perTile, interiorPerTile, crossingShare }: CrowdOptions,
  seed = "walkers",
): Walker[] {
  const rng = createRng(seed);
  const out: Walker[] = [];
  placements.forEach((p) => {
    const n = Math.max(0, Math.round(perTile + rng.range(-1, 1)));
    for (let i = 0; i < n; i++) {
      // Clockwise walkers walk the loop backwards.
      const ring = hexPath(p.x, p.z, p.radius * SIDEWALK_RADIUS + rng.range(-0.06, 0.06));
      out.push({ kind: "sidewalk", path: rng.next() < 0.5 ? ring : [...ring].reverse(), speed: rng.range(0.35, 0.6), start: rng.next(), ...look(rng) });
    }
    const spec = tiles.get(p.topicId);
    if (!spec || !STROLL_PRESETS.has(spec.preset)) return;
    const strollRng = createRng(hashString(`stroll:${p.topicId}`));
    for (let i = 0; i < interiorPerTile; i++) {
      const local = interiorPath(spec, strollRng);
      if (!local) continue;
      out.push({
        kind: "interior",
        path: local.map(([x, z]) => [p.x + x, p.z + z] as Vec2),
        speed: rng.range(0.3, 0.5),
        start: rng.next(),
        ...look(rng),
      });
    }
  });
  generateCrossings(placements).forEach((c, i) => {
    if ((i * 0.618034) % 1 >= crossingShare) return;
    out.push({ kind: "crossing", path: [c.from, c.to], speed: rng.range(0.4, 0.55), start: rng.next(), ...look(rng) });
  });
  return out;
}

export function generateCars(placements: readonly IslandPlacement[], count: number, seed = "cars"): Car[] {
  const rng = createRng(seed);
  return Array.from({ length: Math.min(count, placements.length * 2) }, (_, i) => {
    const p = placements[(i * 7) % placements.length]!;
    const ccw = rng.next() < 0.5;
    // Drive on the right: counter-clockwise traffic uses the outer lane.
    const ring = hexPath(p.x, p.z, p.radius * (ccw ? LANE_OUTER : LANE_INNER));
    return { path: ccw ? ring : [...ring].reverse(), speed: rng.range(1.6, 2.6), start: rng.next(), body: rng.pick(CAR_COLORS) };
  });
}

/** Total length of a closed polyline. */
export function pathLength(path: readonly Vec2[]): number {
  let total = 0;
  for (let i = 0; i < path.length; i++) {
    const a = path[i]!;
    const b = path[(i + 1) % path.length]!;
    total += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return total;
}

/** Point and heading at fraction u (wraps) along a closed polyline. Heading: rotation about +y facing travel. */
export function pathPoint(path: readonly Vec2[], u: number): { x: number; z: number; heading: number } {
  const total = pathLength(path) || 1;
  let d = (((u % 1) + 1) % 1) * total;
  for (let i = 0; i < path.length; i++) {
    const a = path[i]!;
    const b = path[(i + 1) % path.length]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (d <= len || i === path.length - 1) {
      const t = len > 0 ? Math.min(1, d / len) : 0;
      return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, heading: Math.atan2(b[0] - a[0], b[1] - a[1]) };
    }
    d -= len;
  }
  const p = path[0] ?? [0, 0];
  return { x: p[0], z: p[1], heading: 0 };
}

/** Path fraction after `seconds` of travel. */
export function travelled(start: number, speed: number, length: number, seconds: number): number {
  return start + (speed * seconds) / (length || 1);
}
