import * as THREE from "three";
import { hexCorner, TILE_SIZE } from "./hex";
import type { PrimitiveKey, Vec3 } from "./tile-generator";

/**
 * Shared geometries for the hex city. Every tile reuses the same slab, road
 * and kerb geometry (instanced with a per-tile colour), so geometry count is
 * constant regardless of how many tiles there are.
 */

export const SLAB_HEIGHT = 0.6;
/** Road band, as fractions of the tile radius. */
export const ROAD_INNER = 0.8;
export const ROAD_OUTER = 0.985;
const KERB_INNER = 0.78;

/** Flat-top hex prism; top face at y = 0. Vertex colour darkens the sides. */
export function buildSlabGeometry(size = TILE_SIZE, height = SLAB_HEIGHT): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const push = (v: Vec3, shade: number) => {
    positions.push(...v);
    colors.push(shade, shade, shade);
  };
  for (let i = 0; i < 6; i++) {
    const [ax, az] = hexCorner(i, size);
    const [bx, bz] = hexCorner(i + 1, size);
    // Top (counter-clockwise from above → normal +y).
    push([0, 0, 0], 1);
    push([bx, 0, bz], 1);
    push([ax, 0, az], 1);
    // Side.
    const shade = 0.55 + 0.1 * Math.cos((Math.PI / 3) * i + 0.5);
    push([ax, 0, az], shade);
    push([bx, 0, bz], shade);
    push([ax, -height, az], shade * 0.8);
    push([bx, 0, bz], shade);
    push([bx, -height, bz], shade * 0.8);
    push([ax, -height, az], shade * 0.8);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** Flat hex annulus between two radius fractions, lying at height y. */
export function buildHexRingGeometry(inner: number, outer: number, y: number, size = TILE_SIZE): THREE.BufferGeometry {
  const positions: number[] = [];
  for (let i = 0; i < 6; i++) {
    const [ax, az] = hexCorner(i, size * inner);
    const [bx, bz] = hexCorner(i + 1, size * inner);
    const [cx, cz] = hexCorner(i, size * outer);
    const [dx, dz] = hexCorner(i + 1, size * outer);
    positions.push(ax, y, az, dx, y, dz, cx, y, cz, ax, y, az, bx, y, bz, dx, y, dz);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export const buildRoadGeometry = () => buildHexRingGeometry(ROAD_INNER, ROAD_OUTER, 0.02);
export const buildKerbGeometry = () => buildHexRingGeometry(KERB_INNER, ROAD_INNER, 0.05);

export interface Placement2D {
  x: number;
  z: number;
  rotationY: number;
}

/** Lane dashes along the middle of the road band of one tile (tile-local). */
export function roadDashes(size = TILE_SIZE, perEdge = 4): Placement2D[] {
  const out: Placement2D[] = [];
  const mid = (ROAD_INNER + ROAD_OUTER) / 2;
  for (let i = 0; i < 6; i++) {
    const [ax, az] = hexCorner(i, size * mid);
    const [bx, bz] = hexCorner(i + 1, size * mid);
    const angle = Math.atan2(bz - az, bx - ax);
    for (let k = 0; k < perEdge; k++) {
      const t = (k + 0.5) / perEdge;
      out.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, rotationY: -angle });
    }
  }
  return out;
}

/** Street lamps on the kerb at every corner and mid-edge (tile-local). */
export function lampPositions(size = TILE_SIZE): Placement2D[] {
  const out: Placement2D[] = [];
  const r = size * (KERB_INNER + 0.01);
  for (let i = 0; i < 6; i++) {
    const [ax, az] = hexCorner(i, r);
    const [bx, bz] = hexCorner(i + 1, r);
    out.push({ x: ax, z: az, rotationY: 0 }, { x: (ax + bx) / 2, z: (az + bz) / 2, rotationY: 0 });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Shared unit primitives (lazy singletons, never disposed per tile)   */
/* ------------------------------------------------------------------ */

let primitiveCache: Map<PrimitiveKey, THREE.BufferGeometry> | null = null;

/** Normalise to a 1×1×1 bounding box resting on y = 0. */
function unitOnGround(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox ?? new THREE.Box3();
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  geometry.translate(-center.x, -box.min.y, -center.z);
  geometry.scale(1 / (size.x || 1), 1 / (size.y || 1), 1 / (size.z || 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function buildPrimitive(key: PrimitiveKey): THREE.BufferGeometry {
  switch (key) {
    case "box":
      return unitOnGround(new THREE.BoxGeometry(1, 1, 1));
    case "cylinder":
      return unitOnGround(new THREE.CylinderGeometry(0.5, 0.5, 1, 10));
    case "frustum":
      return unitOnGround(new THREE.CylinderGeometry(0.34, 0.5, 1, 8));
    case "cone":
      return unitOnGround(new THREE.ConeGeometry(0.5, 1, 7));
    case "prism":
      // Gable roof: cylinder axis y → x, then the apex (initially +z) → +y.
      return unitOnGround(new THREE.CylinderGeometry(0.5, 0.5, 1, 3).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2));
    case "blob":
      return unitOnGround(new THREE.IcosahedronGeometry(0.5, 0));
    case "dome":
      return unitOnGround(new THREE.SphereGeometry(0.5, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2));
    case "disc":
      return unitOnGround(new THREE.CylinderGeometry(0.5, 0.5, 1, 20));
    case "rock":
      return unitOnGround(new THREE.DodecahedronGeometry(0.5, 0));
    case "torus":
      return unitOnGround(new THREE.TorusGeometry(0.5, 0.06, 6, 24));
    case "ring":
      return unitOnGround(new THREE.TorusGeometry(0.5, 0.14, 4, 28).rotateX(Math.PI / 2));
    case "sphere":
      // Detail 0 (20 tris): used ~250× for lamp heads, so keep it cheap.
      return unitOnGround(new THREE.IcosahedronGeometry(0.5, 0));
  }
}

export function getPrimitiveGeometry(key: PrimitiveKey): THREE.BufferGeometry {
  primitiveCache ??= new Map();
  let geometry = primitiveCache.get(key);
  if (!geometry) {
    geometry = buildPrimitive(key);
    primitiveCache.set(key, geometry);
  }
  return geometry;
}
