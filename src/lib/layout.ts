import { ISLAND_EXTENT, islandRadius } from "./island-generator";
import { createRng, hashString } from "./random";
import type { Topic } from "./schema";

/**
 * Visual layout of topic islands. Positions are purely presentational and
 * carry no geographic meaning (see CLAUDE.md data model).
 */

export interface IslandPlacement {
  topicId: string;
  x: number;
  y: number;
  z: number;
  /** Footprint radius: furthest geometry incl. rim lobes and the coast pier. */
  radius: number;
}

export interface WorldBounds {
  center: [number, number, number];
  /** Radius of a sphere containing every island footprint. */
  radius: number;
}

/** Minimum free space between neighbouring island rims. */
export const ISLAND_GAP = 3;
const RING_LAYOUT_MAX = 7;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export function layoutIslands(topics: readonly Pick<Topic, "id" | "seed">[]): IslandPlacement[] {
  const radii = topics.map((t) => islandRadius(t.seed) * ISLAND_EXTENT);
  const maxR = Math.max(0, ...radii);
  const spacing = 2 * maxR + ISLAND_GAP;
  const n = topics.length;

  return topics.map((topic, i) => {
    const rng = createRng(hashString(`layout:${topic.id}:${topic.seed}`));
    let x = 0;
    let z = 0;
    if (n > 1 && n <= RING_LAYOUT_MAX) {
      // Chord between ring neighbours must be >= spacing.
      const ringR = spacing / (2 * Math.sin(Math.PI / n));
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      x = Math.cos(angle) * ringR;
      z = Math.sin(angle) * ringR;
    } else if (n > RING_LAYOUT_MAX) {
      // Phyllotaxis spiral: nearest-neighbour distance is roughly `c`.
      const c = spacing * 1.05;
      const r = c * Math.sqrt(i + 0.5);
      x = Math.cos(i * GOLDEN_ANGLE) * r;
      z = Math.sin(i * GOLDEN_ANGLE) * r;
    }
    return { topicId: topic.id, x, y: rng.range(-1.2, 1.2), z, radius: radii[i] ?? maxR };
  });
}

export function computeWorldBounds(placements: readonly IslandPlacement[]): WorldBounds {
  if (placements.length === 0) return { center: [0, 0, 0], radius: 10 };
  const cx = placements.reduce((s, p) => s + p.x, 0) / placements.length;
  const cz = placements.reduce((s, p) => s + p.z, 0) / placements.length;
  const radius = Math.max(...placements.map((p) => Math.hypot(p.x - cx, p.z - cz) + p.radius));
  return { center: [cx, 0, cz], radius };
}
