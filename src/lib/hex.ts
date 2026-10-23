/**
 * Flat-top hexagon helpers (axial coordinates). Tiles are laid out as a
 * compact hexagonal city: centre tile, then ring 1 (6), ring 2 (12), …
 */

/** Centre-to-vertex radius of one tile, in world units. */
export const TILE_SIZE = 6;
export const SQRT3 = Math.sqrt(3);
/** Centre-to-edge distance of one tile. */
export const TILE_APOTHEM = (SQRT3 / 2) * TILE_SIZE;

export interface Axial {
  q: number;
  r: number;
}

const DIRECTIONS: Axial[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function axialToWorld({ q, r }: Axial, size = TILE_SIZE): [number, number] {
  return [size * 1.5 * q, size * SQRT3 * (r + q / 2)];
}

/** Hexes in spiral order: centre first, then each ring clockwise. Enough to hold `count`. */
export function spiral(count: number): Axial[] {
  const out: Axial[] = [{ q: 0, r: 0 }];
  for (let ring = 1; out.length < count; ring++) {
    // Start at the "south-west" corner of the ring and walk its six sides.
    let hex: Axial = { q: DIRECTIONS[4]!.q * ring, r: DIRECTIONS[4]!.r * ring };
    for (let side = 0; side < 6; side++) {
      for (let step = 0; step < ring; step++) {
        out.push(hex);
        const d = DIRECTIONS[side]!;
        hex = { q: hex.q + d.q, r: hex.r + d.r };
      }
    }
  }
  return out.slice(0, count);
}

/** Corner i (0..5) of a flat-top hex centred at the origin. */
export function hexCorner(i: number, size = TILE_SIZE): [number, number] {
  const a = (Math.PI / 3) * i;
  return [size * Math.cos(a), size * Math.sin(a)];
}

/** Point-in-hex test for a flat-top hex centred at the origin. */
export function insideHex(x: number, z: number, size = TILE_SIZE): boolean {
  const ax = Math.abs(x);
  const az = Math.abs(z);
  const h = (SQRT3 / 2) * size;
  return az <= h && (SQRT3 / 2) * ax + az / 2 <= h;
}

export function hexDistance(a: Axial, b: Axial): number {
  return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
}
