import { axialToWorld, spiral, TILE_SIZE, type Axial } from "./hex";
import type { Topic } from "./schema";

/**
 * Visual layout of topic tiles on a hexagonal grid. Positions are purely
 * presentational and carry no geographic meaning (see CLAUDE.md data model).
 */

export interface IslandPlacement extends Axial {
  topicId: string;
  /** 1-based display number ("01" … "19"), in data order. */
  index: number;
  x: number;
  y: number;
  z: number;
  /** Footprint radius (centre to vertex). */
  radius: number;
}

export interface WorldBounds {
  center: [number, number, number];
  /** Radius of a circle containing every tile. */
  radius: number;
}

export function layoutIslands(topics: readonly Pick<Topic, "id">[]): IslandPlacement[] {
  const cells = spiral(topics.length);
  return topics.map((topic, i) => {
    const cell = cells[i]!;
    const [x, z] = axialToWorld(cell);
    return { topicId: topic.id, index: i + 1, q: cell.q, r: cell.r, x, y: 0, z, radius: TILE_SIZE };
  });
}

export function computeWorldBounds(placements: readonly IslandPlacement[]): WorldBounds {
  if (placements.length === 0) return { center: [0, 0, 0], radius: 10 };
  const cx = placements.reduce((s, p) => s + p.x, 0) / placements.length;
  const cz = placements.reduce((s, p) => s + p.z, 0) / placements.length;
  const radius = Math.max(...placements.map((p) => Math.hypot(p.x - cx, p.z - cz) + p.radius));
  return { center: [cx, 0, cz], radius };
}
