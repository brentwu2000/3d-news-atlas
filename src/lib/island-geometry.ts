import * as THREE from "three";
import { SURFACE_RINGS, surfaceHeightAt, type IslandSpec, type PrimitiveKey } from "./island-generator";
import { createRng, hashString, type Rng } from "./random";

/**
 * Builds the two per-island geometries (terrain top + floating rock base)
 * from an IslandSpec. Everything else on an island is an instance of a
 * shared primitive, so geometry count stays at 2 per island + 9 shared.
 */

/** ±lightness variation applied per triangle for a hand-faceted look. */
const FACE_VARIATION = 0.05;

class TriangleSoup {
  readonly positions: number[] = [];
  readonly colors: number[] = [];
  private readonly color = new THREE.Color();

  constructor(private readonly rng: Rng) {}

  /** Push one triangle; each gets a small seeded shade offset. */
  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, base: THREE.Color) {
    const k = 1 + this.rng.range(-FACE_VARIATION, FACE_VARIATION);
    this.color.setRGB(base.r * k, base.g * k, base.b * k);
    for (const v of [a, b, c]) {
      this.positions.push(v.x, v.y, v.z);
      this.colors.push(this.color.r, this.color.g, this.color.b);
    }
  }

  /** Non-indexed triangle soup gives crisp faceted (low-poly) shading. */
  build(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }
}

function outlinePoint(spec: IslandSpec, i: number, t: number): [number, number] {
  const seg = ((i % spec.segments) + spec.segments) % spec.segments;
  const angle = (seg / spec.segments) * Math.PI * 2;
  const r = spec.radius * (spec.rim[seg] ?? 1) * t;
  return [Math.cos(angle) * r, Math.sin(angle) * r];
}

export function buildTerrainGeometry(spec: IslandSpec): THREE.BufferGeometry {
  const soup = new TriangleSoup(createRng(hashString(`terrain-faces:${spec.preset}:${spec.seed}`)));
  const top = new THREE.Color(spec.palette.top);
  const edge = new THREE.Color(spec.palette.topEdge);
  const colorAt = (t: number) => top.clone().lerp(edge, Math.min(1, Math.max(0, (t - 0.6) / 0.35)));

  const vertex = (i: number, t: number) => {
    if (t === 0) return new THREE.Vector3(0, surfaceHeightAt(spec, 0, 0), 0);
    const [x, z] = outlinePoint(spec, i, t);
    // Exact same height function the props use, so nothing floats or sinks.
    return new THREE.Vector3(x, t === 1 ? 0 : surfaceHeightAt(spec, x, z), z);
  };

  const rings = [0, ...SURFACE_RINGS];
  for (let i = 0; i < spec.segments; i++) {
    for (let k = 1; k < rings.length; k++) {
      const t0 = rings[k - 1] ?? 0;
      const t1 = rings[k] ?? 1;
      const a0 = vertex(i, t0);
      const b0 = vertex(i + 1, t0);
      const a1 = vertex(i, t1);
      const b1 = vertex(i + 1, t1);
      const c = colorAt((t0 + t1) / 2);
      // Counter-clockwise viewed from +y so normals point up.
      soup.tri(a0, b1, a1, c);
      if (t0 !== 0) soup.tri(a0, b0, b1, c);
    }
  }
  return soup.build();
}

export function buildBaseGeometry(spec: IslandSpec): THREE.BufferGeometry {
  const soup = new TriangleSoup(createRng(hashString(`base-faces:${spec.preset}:${spec.seed}`)));

  const ringPoints: THREE.Vector3[][] = [
    Array.from({ length: spec.segments }, (_, i) => {
      const [x, z] = outlinePoint(spec, i, 1);
      return new THREE.Vector3(x, 0, z);
    }),
  ];
  for (const ring of spec.baseRings) {
    ringPoints.push(
      Array.from({ length: spec.segments }, (_, i) => {
        const [x, z] = outlinePoint(spec, i, ring.scale * (ring.jitter[i] ?? 1));
        return new THREE.Vector3(x, ring.y + (ring.yJitter[i] ?? 0), z);
      }),
    );
  }

  for (let k = 1; k < ringPoints.length; k++) {
    const upper = ringPoints[k - 1] ?? [];
    const lower = ringPoints[k] ?? [];
    const color = new THREE.Color(spec.baseRings[k - 1]?.color ?? spec.palette.tip);
    for (let i = 0; i < spec.segments; i++) {
      const j = (i + 1) % spec.segments;
      const u0 = upper[i];
      const u1 = upper[j];
      const l0 = lower[i];
      const l1 = lower[j];
      if (!u0 || !u1 || !l0 || !l1) continue;
      // Outward-facing winding.
      soup.tri(u0, u1, l0, color);
      soup.tri(u1, l1, l0, color);
    }
  }
  const last = ringPoints[ringPoints.length - 1] ?? [];
  const tip = new THREE.Vector3(...spec.tip);
  const tipColor = new THREE.Color(spec.palette.tip);
  for (let i = 0; i < spec.segments; i++) {
    const a = last[i];
    const b = last[(i + 1) % spec.segments];
    if (a && b) soup.tri(a, b, tip, tipColor);
  }
  return soup.build();
}

/* ------------------------------------------------------------------ */
/* Shared unit primitives (lazy singletons, never disposed per island) */
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
      // Gable roof: triangular prism with its ridge along local x.
      // Cylinder axis y → x, then the apex (initially +z) → +y; base ends up flat on the ground.
      return unitOnGround(new THREE.CylinderGeometry(0.5, 0.5, 1, 3).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2));
    case "blob":
      return unitOnGround(new THREE.IcosahedronGeometry(0.5, 0));
    case "dome":
      return unitOnGround(new THREE.SphereGeometry(0.5, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2));
    case "disc":
      return unitOnGround(new THREE.CylinderGeometry(0.5, 0.5, 1, 16));
    case "rock":
      return unitOnGround(new THREE.DodecahedronGeometry(0.5, 0));
  }
}

/** Unit-sized (1×1×1 bounding box), bottom-centred primitives. */
export function getPrimitiveGeometry(key: PrimitiveKey): THREE.BufferGeometry {
  primitiveCache ??= new Map();
  let geometry = primitiveCache.get(key);
  if (!geometry) {
    geometry = buildPrimitive(key);
    primitiveCache.set(key, geometry);
  }
  return geometry;
}

/**
 * Flat ribbon just outside the rim, used for hover/selection outlines. It is a
 * separate mesh with its own material, so highlighting one island never
 * touches the shared terrain/prop materials of the others.
 */
export function buildOutlineGeometry(spec: IslandSpec, inner = 1.01, outer = 1.06, y = 0.03): THREE.BufferGeometry {
  const positions: number[] = [];
  for (let i = 0; i < spec.segments; i++) {
    const [ax, az] = outlinePoint(spec, i, inner);
    const [bx, bz] = outlinePoint(spec, i + 1, inner);
    const [cx, cz] = outlinePoint(spec, i, outer);
    const [dx, dz] = outlinePoint(spec, i + 1, outer);
    positions.push(ax, y, az, dx, y, dz, cx, y, cz, ax, y, az, bx, y, bz, dx, y, dz);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
