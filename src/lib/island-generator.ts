import { DEFAULT_ART_TOKENS, deriveSwatches, type ArtSwatches } from "./art-tokens";
import { createRng, hashString, type Rng } from "./random";
import type { IslandPreset } from "./schema";

/**
 * Pure, deterministic island description. No three.js objects are created
 * here so the output can be unit-tested and compared across runs.
 */

export type PropKind =
  | "tree"
  | "pine"
  | "bush"
  | "rock"
  | "building"
  | "tower"
  | "hut"
  | "warehouse"
  | "tank"
  | "chimney"
  | "lighthouse"
  | "pier"
  | "dome"
  | "column"
  | "plaza"
  | "pond";

export type Vec3 = [number, number, number];

export interface PropInstance {
  kind: PropKind;
  position: Vec3;
  /** Width (x), height (y), depth (z) in world units. */
  scale: Vec3;
  rotationY: number;
  color: string;
  /** Secondary colour (roof, foliage tier, lamp…), derived from the art tokens. */
  accent: string;
  /** Small seeded variant index so identical kinds don't look cloned. */
  variant: number;
}

export interface IslandPalette {
  top: string;
  topEdge: string;
  soil: string;
  /** Strata colours from top to bottom. */
  strata: string[];
  ledge: string;
  tip: string;
}

export interface BaseRing {
  /** Base y offset below the rim (negative). */
  y: number;
  /** Radius multiplier relative to the rim outline. */
  scale: number;
  /** Per-segment radial jitter multipliers. */
  jitter: number[];
  /** Per-segment vertical jitter (world units). */
  yJitter: number[];
  /** Colour of the band between the previous ring and this one. */
  color: string;
}

export interface SurfaceRipple {
  amplitude: number;
  fx: number;
  fz: number;
  px: number;
  pz: number;
}

export interface IslandSpec {
  preset: IslandPreset;
  seed: number;
  radius: number;
  segments: number;
  /** Per-segment rim radius multipliers (length === segments). */
  rim: number[];
  /** Height of the gentle hill at the island centre. */
  hill: number;
  ripple: SurfaceRipple;
  /** Number of layered rock strata in the underside (2–3). */
  strata: number;
  baseRings: BaseRing[];
  /** Tip of the floating rock, relative to the island origin. */
  tip: Vec3;
  palette: IslandPalette;
  props: PropInstance[];
}

export interface GenerateIslandOptions {
  seed: number;
  preset: IslandPreset;
  /** Multiplier on prop counts; 1 = desktop, lower on mobile. */
  density?: number;
  /** Angular resolution of the terrain. */
  segments?: number;
  swatches?: ArtSwatches;
}

export const MIN_ISLAND_RADIUS = 4.2;
export const MAX_ISLAND_RADIUS = 5.2;
/** Rim multipliers are clamped to this range, so the outline never exceeds radius × RIM_MAX. */
export const RIM_MIN = 0.8;
export const RIM_MAX = 1.1;
/** Furthest any geometry (incl. the coast pier) reaches, as a multiple of the radius. */
export const ISLAND_EXTENT = 1.25;

/** Island radius depends only on the seed so layout can be computed cheaply. */
export function islandRadius(seed: number): number {
  const rng = createRng(hashString(`radius:${seed}`));
  return rng.range(MIN_ISLAND_RADIUS, MAX_ISLAND_RADIUS);
}

function presetPalette(preset: IslandPreset, s: ArtSwatches): IslandPalette {
  const strata = [s.stone, s.stoneDark, s.stoneDeep];
  switch (preset) {
    case "city":
      return { top: s.foliageLight, topEdge: s.stoneLight, soil: s.soil, strata, ledge: s.stoneLight, tip: s.stoneDeep };
    case "forest":
      return { top: s.foliage, topEdge: s.foliageDark, soil: s.soil, strata: [s.stoneDark, s.stone, s.stoneDeep], ledge: s.foliageDark, tip: s.stoneDeep };
    case "industry":
      return { top: s.sandDark, topEdge: s.stone, soil: s.soil, strata: [s.stoneDark, s.stoneDeep, s.stoneDeep], ledge: s.stone, tip: s.stoneDeep };
    case "coast":
      return { top: s.foliageLight, topEdge: s.sandLight, soil: s.sand, strata: [s.sandDark, s.stone, s.stoneDark], ledge: s.sand, tip: s.stoneDark };
    case "civic":
      return { top: s.foliageLight, topEdge: s.foliage, soil: s.soil, strata: [s.stoneLight, s.stone, s.stoneDark], ledge: s.highlight, tip: s.stoneDark };
  }
}

interface Recipe {
  kind: PropKind;
  count: [number, number];
  /** Radial zone as a fraction of the local rim radius. */
  zone: [number, number];
  width: [number, number];
  height: [number, number];
  /** Depth relative to width; omit for square footprints. */
  depthRatio?: [number, number];
  colors: readonly string[];
  accents: readonly string[];
}

function presetRecipes(preset: IslandPreset, s: ArtSwatches): Recipe[] {
  const trees = [s.foliage, s.foliageLight, s.foliageDark];
  const rocks = [s.stone, s.stoneLight, s.stoneDark];
  switch (preset) {
    case "city":
      return [
        { kind: "tower", count: [2, 3], zone: [0, 0.3], width: [0.85, 1.05], height: [2.6, 3.6], colors: [s.wallCool, s.stoneLight], accents: [s.highlight] },
        { kind: "building", count: [14, 20], zone: [0.05, 0.78], width: [0.55, 0.95], height: [0.6, 2.0], depthRatio: [0.7, 1.4], colors: [s.wall, s.wallCool, s.wallWarm, s.stoneLight], accents: [s.roofDark, s.roof] },
        { kind: "tree", count: [6, 9], zone: [0.75, 0.95], width: [0.45, 0.6], height: [0.75, 1.0], colors: trees, accents: trees },
      ];
    case "forest":
      return [
        { kind: "hut", count: [1, 2], zone: [0.2, 0.5], width: [0.7, 0.85], height: [0.5, 0.6], colors: [s.wallWarm], accents: [s.roof] },
        { kind: "pine", count: [30, 40], zone: [0, 0.95], width: [0.55, 0.8], height: [1.3, 2.2], colors: [s.foliageDeep, s.foliageDark], accents: [s.foliage, s.foliageDark] },
        { kind: "tree", count: [9, 13], zone: [0.3, 0.95], width: [0.55, 0.75], height: [0.85, 1.2], colors: trees, accents: trees },
        { kind: "rock", count: [5, 8], zone: [0.4, 0.97], width: [0.35, 0.65], height: [0.25, 0.45], colors: rocks, accents: rocks },
      ];
    case "industry":
      return [
        { kind: "warehouse", count: [4, 6], zone: [0, 0.68], width: [1.3, 1.9], height: [0.55, 0.85], depthRatio: [0.5, 0.7], colors: [s.metal, s.wallCool, s.stoneLight], accents: [s.roofDark, s.stoneDark] },
        { kind: "tank", count: [3, 5], zone: [0.2, 0.8], width: [0.8, 1.15], height: [0.7, 1.05], colors: [s.wall, s.metal], accents: [s.stoneDark] },
        { kind: "chimney", count: [2, 3], zone: [0, 0.55], width: [0.32, 0.42], height: [2.3, 3.3], colors: [s.roof, s.stoneDark], accents: [s.stoneDeep] },
        { kind: "rock", count: [3, 5], zone: [0.75, 0.97], width: [0.35, 0.6], height: [0.25, 0.4], colors: rocks, accents: rocks },
        { kind: "tree", count: [3, 5], zone: [0.75, 0.95], width: [0.45, 0.55], height: [0.65, 0.9], colors: trees, accents: trees },
      ];
    case "coast":
      return [
        { kind: "hut", count: [4, 6], zone: [0.15, 0.55], width: [0.6, 0.8], height: [0.45, 0.6], colors: [s.wall, s.wallWarm, s.sandLight], accents: [s.roof, s.stoneDark] },
        { kind: "tree", count: [7, 10], zone: [0.2, 0.68], width: [0.5, 0.65], height: [0.9, 1.25], colors: [s.foliageLight, s.foliage], accents: [s.foliageLight, s.foliage] },
        { kind: "bush", count: [5, 8], zone: [0.3, 0.7], width: [0.32, 0.45], height: [0.25, 0.35], colors: trees, accents: trees },
        { kind: "rock", count: [6, 9], zone: [0.86, 0.98], width: [0.35, 0.65], height: [0.2, 0.4], colors: [s.stoneLight, s.stone], accents: rocks },
      ];
    case "civic":
      return [
        { kind: "building", count: [4, 6], zone: [0.52, 0.75], width: [0.8, 1.05], height: [0.6, 0.95], depthRatio: [0.8, 1.2], colors: [s.wall, s.wallWarm], accents: [s.roof] },
        { kind: "tree", count: [10, 14], zone: [0.62, 0.93], width: [0.5, 0.62], height: [0.8, 1.05], colors: trees, accents: trees },
        { kind: "bush", count: [4, 6], zone: [0.42, 0.62], width: [0.3, 0.4], height: [0.22, 0.3], colors: trees, accents: trees },
      ];
  }
}

/** Smallest distance between a prop centre and anything else. */
function footprint(prop: PropInstance): number {
  return Math.max(prop.scale[0], prop.scale[2]) * 0.5;
}

export function rimRadiusAt(spec: Pick<IslandSpec, "rim" | "radius" | "segments">, angle: number): number {
  const a = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const f = (a / (Math.PI * 2)) * spec.segments;
  const i0 = Math.floor(f) % spec.segments;
  const i1 = (i0 + 1) % spec.segments;
  const t = f - Math.floor(f);
  const r0 = spec.rim[i0] ?? 1;
  const r1 = spec.rim[i1] ?? 1;
  return spec.radius * (r0 + (r1 - r0) * t);
}

/** Terrain height profile as a function of the normalised radial distance. */
export function surfaceProfile(hill: number, t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return hill * (1 - c * c);
}

type SurfaceSpec = Pick<IslandSpec, "rim" | "radius" | "segments" | "hill" | "ripple">;

/** Height of the upper terrain at a local (x, z) position. Rim is always y = 0. */
export function surfaceHeightAt(spec: SurfaceSpec, x: number, z: number): number {
  const t = Math.min(1, Math.hypot(x, z) / rimRadiusAt(spec, Math.atan2(z, x)));
  const { amplitude, fx, fz, px, pz } = spec.ripple;
  const ripple = amplitude * (1 - t * t) * Math.sin(fx * x + px) * Math.cos(fz * z + pz);
  return surfaceProfile(spec.hill, t) + ripple;
}

/** Radial positions of the terrain rings used by both geometry and props. */
export const SURFACE_RINGS = [0.25, 0.5, 0.75, 1] as const;

function placeProps(spec: IslandSpec, rng: Rng, density: number, s: ArtSwatches): PropInstance[] {
  const props: PropInstance[] = [];
  const fits = (candidate: PropInstance, margin: number): boolean =>
    props.every((other) => {
      const dx = other.position[0] - candidate.position[0];
      const dz = other.position[2] - candidate.position[2];
      return Math.hypot(dx, dz) >= footprint(other) + footprint(candidate) + margin;
    });

  const add = (kind: PropKind, x: number, z: number, scale: Vec3, rotationY: number, color: string, accent: string, lift = 0) => {
    const y = surfaceHeightAt(spec, x, z) + lift;
    props.push({ kind, position: [x, y, z], scale, rotationY, color, accent, variant: 0 });
  };

  // Landmarks first so the procedural scatter flows around them.
  if (spec.preset === "civic") {
    const plazaR = spec.radius * 0.38;
    add("plaza", 0, 0, [plazaR * 2, 0.08, plazaR * 2], 0, s.sandLight, s.highlight, 0.02);
    add("dome", 0, 0, [1.9, 1.7, 1.9], 0, s.wall, s.stoneLight);
    const columns = 10;
    for (let i = 0; i < columns; i++) {
      const a = (i / columns) * Math.PI * 2;
      add("column", Math.cos(a) * plazaR * 0.8, Math.sin(a) * plazaR * 0.8, [0.22, 1.05, 0.22], 0, s.wall, s.highlight);
    }
  } else if (spec.preset === "coast") {
    const a = rng.range(0, Math.PI * 2);
    const rim = rimRadiusAt(spec, a);
    add("lighthouse", Math.cos(a) * rim * 0.74, Math.sin(a) * rim * 0.74, [0.7, 2.8, 0.7], 0, s.wall, s.lamp);
    // Pier points outward across the rim, giving the coast its distinct silhouette.
    const pa = a + Math.PI * rng.range(0.55, 0.85);
    const pr = rimRadiusAt(spec, pa);
    const length = spec.radius * 0.3;
    const mid = pr * 0.96 + length * 0.1;
    props.push({
      kind: "pier",
      position: [Math.cos(pa) * mid, 0.02, Math.sin(pa) * mid],
      scale: [length, 0.08, 0.55],
      rotationY: -pa,
      color: s.sandDark,
      accent: s.trunk,
      variant: 0,
    });
  } else if (spec.preset === "forest") {
    const a = rng.range(0, Math.PI * 2);
    const r = rimRadiusAt(spec, a) * 0.32;
    add("pond", Math.cos(a) * r, Math.sin(a) * r, [2.0, 0.05, 1.5], rng.range(0, Math.PI), s.water, s.sandLight, 0.015);
  }

  for (const recipe of presetRecipes(spec.preset, s)) {
    const target = Math.max(1, Math.round(rng.int(recipe.count[0], recipe.count[1]) * density));
    let placed = 0;
    for (let attempt = 0; attempt < target * 30 && placed < target; attempt++) {
      const angle = rng.range(0, Math.PI * 2);
      // sqrt keeps samples uniform over the annulus area.
      const t = Math.sqrt(rng.range(recipe.zone[0] ** 2, recipe.zone[1] ** 2));
      const r = rimRadiusAt(spec, angle) * t * 0.9;
      const width = rng.range(recipe.width[0], recipe.width[1]);
      const depth = recipe.depthRatio ? width * rng.range(recipe.depthRatio[0], recipe.depthRatio[1]) : width;
      const height = rng.range(recipe.height[0], recipe.height[1]);
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      const candidate: PropInstance = {
        kind: recipe.kind,
        position: [x, surfaceHeightAt(spec, x, z), z],
        scale: [width, height, depth],
        rotationY: rng.range(0, Math.PI * 2),
        color: rng.pick(recipe.colors),
        accent: rng.pick(recipe.accents),
        variant: rng.int(0, 2),
      };
      if (fits(candidate, 0.06)) {
        props.push(candidate);
        placed++;
      }
    }
  }
  return props;
}

/** Low-frequency lobes + fine jitter → irregular but coherent outline. */
function generateRim(rng: Rng, segments: number): number[] {
  const lobes = [
    { k: 2, a: rng.range(0.04, 0.09), p: rng.range(0, Math.PI * 2) },
    { k: 3, a: rng.range(0.03, 0.07), p: rng.range(0, Math.PI * 2) },
    { k: 5, a: rng.range(0.01, 0.03), p: rng.range(0, Math.PI * 2) },
  ];
  return Array.from({ length: segments }, (_, i) => {
    const theta = (i / segments) * Math.PI * 2;
    const lobe = lobes.reduce((sum, l) => sum + l.a * Math.sin(l.k * theta + l.p), 0);
    const v = 0.97 + lobe + rng.range(-0.035, 0.035);
    return Math.min(RIM_MAX, Math.max(RIM_MIN, v));
  });
}

/** 2–3 tapered strata, each starting with a small inset ledge. */
function generateBase(rng: Rng, segments: number, radius: number, strata: number, palette: IslandPalette): { rings: BaseRing[]; tip: Vec3 } {
  const depth = radius * rng.range(1.05, 1.35);
  const ringAt = (yAbs: number, scale: number, color: string, jitter: [number, number], yJ: number): BaseRing => ({
    y: -yAbs,
    scale,
    jitter: Array.from({ length: segments }, () => rng.range(jitter[0], jitter[1])),
    yJitter: Array.from({ length: segments }, () => rng.range(-yJ, yJ)),
    color,
  });

  const rings: BaseRing[] = [ringAt(0.32, 1, palette.soil, [0.99, 1.01], 0.03)];
  const layout =
    strata === 3
      ? [
          [0.07, 0.92, 0.3, 0.8],
          [0.33, 0.71, 0.56, 0.54],
          [0.59, 0.45, 0.8, 0.25],
        ]
      : [
          [0.07, 0.92, 0.4, 0.72],
          [0.44, 0.6, 0.76, 0.3],
        ];
  layout.forEach(([ledgeY, ledgeS, bottomY, bottomS], k) => {
    const color = palette.strata[k] ?? palette.tip;
    rings.push(ringAt((ledgeY ?? 0) * depth, ledgeS ?? 1, k === 0 ? palette.ledge : color, [0.95, 1.05], 0.06));
    rings.push(ringAt((bottomY ?? 0) * depth, bottomS ?? 0.5, color, [0.84, 1.12], depth * 0.03));
  });
  const tip: Vec3 = [rng.range(-0.5, 0.5), -depth, rng.range(-0.5, 0.5)];
  return { rings, tip };
}

export function generateIsland({ seed, preset, density = 1, segments = 24, swatches }: GenerateIslandOptions): IslandSpec {
  if (!Number.isInteger(segments) || segments < 6) throw new Error("segments must be an integer >= 6");
  if (!(density > 0)) throw new Error("density must be > 0");

  const s = swatches ?? deriveSwatches(DEFAULT_ART_TOKENS);
  const rng = createRng(hashString(`island:${preset}:${seed}`));
  const radius = islandRadius(seed);
  const rim = generateRim(rng, segments);
  const hill = rng.range(0.25, 0.45);
  const ripple: SurfaceRipple = {
    amplitude: rng.range(0.04, 0.08),
    fx: rng.range(0.6, 1.1),
    fz: rng.range(0.6, 1.1),
    px: rng.range(0, Math.PI * 2),
    pz: rng.range(0, Math.PI * 2),
  };
  const strata = rng.int(2, 3);
  const palette = presetPalette(preset, s);
  const { rings, tip } = generateBase(rng, segments, radius, strata, palette);

  const spec: IslandSpec = { preset, seed, radius, segments, rim, hill, ripple, strata, baseRings: rings, tip, palette, props: [] };
  spec.props = placeProps(spec, rng, density, s);
  return spec;
}

/* ------------------------------------------------------------------ */
/* Prop → primitive part expansion                                     */
/* ------------------------------------------------------------------ */

/** Shared low-poly primitives; each becomes at most two InstancedMeshes per island (shadow / no shadow). */
export type PrimitiveKey = "box" | "cylinder" | "frustum" | "cone" | "prism" | "blob" | "dome" | "disc" | "rock";

export interface PrimitivePart {
  primitive: PrimitiveKey;
  /** Centre-bottom position of the part in island-local space. */
  position: Vec3;
  scale: Vec3;
  rotationY: number;
  color: string;
  castShadow: boolean;
}

/** Kinds large enough to cast a meaningful shadow; small props skip the shadow pass. */
const SHADOW_KINDS: ReadonlySet<PropKind> = new Set(["building", "tower", "warehouse", "tank", "chimney", "lighthouse", "dome", "hut"]);

/** Expand semantic props into primitive parts. All unit primitives sit on y=0 with size 1. */
export function expandProp(prop: PropInstance, trunk = deriveSwatches(DEFAULT_ART_TOKENS).trunk): PrimitivePart[] {
  const [x, y, z] = prop.position;
  const [w, h, d] = prop.scale;
  const r = prop.rotationY;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const cast = SHADOW_KINDS.has(prop.kind);
  /** Offset (ox, oz) is in the prop's local, rotated frame. */
  const part = (primitive: PrimitiveKey, dy: number, scale: Vec3, color: string, ox = 0, oz = 0, rot = r): PrimitivePart => ({
    primitive,
    position: [x + ox * cos + oz * sin, y + dy, z - ox * sin + oz * cos],
    scale,
    rotationY: rot,
    color,
    castShadow: cast,
  });

  switch (prop.kind) {
    case "tree":
      // Two offset canopy blobs read as a tree rather than a ball on a stick.
      return [
        part("cylinder", 0, [w * 0.18, h * 0.4, w * 0.18], trunk),
        part("blob", h * 0.28, [w, h * 0.62, w * 0.95], prop.color),
        part("blob", h * 0.5, [w * 0.62, h * 0.45, w * 0.62], prop.accent, w * 0.16, -w * 0.1),
      ];
    case "pine":
      return [
        part("cylinder", 0, [w * 0.16, h * 0.22, w * 0.16], trunk),
        part("cone", h * 0.14, [w, h * 0.5, w], prop.color),
        part("cone", h * 0.42, [w * 0.72, h * 0.42, w * 0.72], prop.accent),
        part("cone", h * 0.68, [w * 0.45, h * 0.32, w * 0.45], prop.color),
      ];
    case "bush":
      return [part("blob", -h * 0.1, [w, h, w], prop.color), part("blob", -h * 0.1, [w * 0.7, h * 0.8, w * 0.7], prop.accent, w * 0.4, w * 0.1)];
    case "rock":
      return [part("rock", -h * 0.25, [w, h, w * 0.85], prop.color), part("rock", -h * 0.2, [w * 0.5, h * 0.6, w * 0.45], prop.accent, w * 0.45, w * 0.2)];
    case "building":
      return prop.variant === 0
        ? [part("box", 0, [w, h, d], prop.color), part("prism", h, [w, Math.min(0.5, w * 0.45), d * 1.02], prop.accent)]
        : [part("box", 0, [w, h, d], prop.color), part("box", h, [w * 0.55, 0.18, d * 0.5], prop.accent, w * 0.12, 0)];
    case "tower": {
      const t1 = h * 0.55;
      const t2 = h * 0.3;
      return [
        part("box", 0, [w, t1, d], prop.color),
        part("box", t1, [w * 0.74, t2, d * 0.74], prop.color),
        part("box", t1 + t2, [w * 0.48, h * 0.15, d * 0.48], prop.color),
        part("cylinder", h, [0.06, h * 0.12, 0.06], prop.accent),
      ];
    }
    case "hut":
      return [part("box", 0, [w, h, d], prop.color), part("prism", h, [w * 1.12, h * 0.75, d * 1.12], prop.accent)];
    case "warehouse":
      return [
        part("box", 0, [w, h, d], prop.color),
        part("prism", h, [w * 0.5, h * 0.38, d], prop.accent, -w * 0.25, 0),
        part("prism", h, [w * 0.5, h * 0.38, d], prop.accent, w * 0.25, 0),
      ];
    case "tank":
      return [
        part("cylinder", 0, [w, h, d], prop.color),
        part("cylinder", h * 0.55, [w * 1.04, h * 0.06, d * 1.04], prop.accent),
        part("dome", h, [w, h * 0.24, d], prop.color),
      ];
    case "chimney":
      return [
        part("box", 0, [w * 2.2, 0.35, w * 2.2], prop.accent),
        part("frustum", 0.35, [w, h - 0.35, d], prop.color),
        part("cylinder", h, [w * 0.8, 0.12, d * 0.8], prop.accent),
      ];
    case "lighthouse":
      return [
        part("box", 0, [w * 1.5, 0.25, d * 1.5], prop.color),
        part("frustum", 0.25, [w, h * 0.68, d], prop.color),
        part("cylinder", 0.25 + h * 0.68, [w * 0.62, h * 0.1, d * 0.62], prop.accent),
        part("cone", 0.25 + h * 0.78, [w * 0.82, h * 0.16, d * 0.82], prop.color),
      ];
    case "pier": {
      // Deck plus two posts under the seaward end.
      const deck = part("box", 0, [w, h, d], prop.color);
      return [
        deck,
        part("cylinder", -0.6, [0.12, 0.6, 0.12], prop.accent, w * 0.45, d * 0.38),
        part("cylinder", -0.6, [0.12, 0.6, 0.12], prop.accent, w * 0.45, -d * 0.38),
        part("box", h, [0.3, 0.35, 0.3], prop.accent, w * 0.42, 0),
      ];
    }
    case "dome":
      return [
        part("box", 0, [w * 1.5, 0.14, w * 1.5], prop.accent),
        part("box", 0.14, [w * 1.25, 0.14, w * 1.25], prop.accent),
        part("cylinder", 0.28, [w * 0.95, h * 0.32, d * 0.95], prop.color),
        part("dome", 0.28 + h * 0.32, [w * 0.82, h * 0.48, d * 0.82], prop.accent),
        part("cylinder", 0.28 + h * 0.8, [0.08, h * 0.2, 0.08], prop.color),
      ];
    case "column":
      return [part("box", 0, [w * 1.4, 0.06, w * 1.4], prop.accent), part("cylinder", 0.06, [w, h, d], prop.color)];
    case "plaza":
      return [part("disc", 0, [w, h, d], prop.color), part("disc", h, [w * 0.55, h * 0.5, d * 0.55], prop.accent)];
    case "pond":
      return [part("disc", -0.01, [w * 1.12, h, d * 1.12], prop.accent), part("disc", 0, [w, h, d], prop.color)];
  }
}

export interface PartGroup {
  key: string;
  primitive: PrimitiveKey;
  castShadow: boolean;
  parts: PrimitivePart[];
}

export function groupPartsByPrimitive(props: readonly PropInstance[], trunk?: string): PartGroup[] {
  const groups = new Map<string, PartGroup>();
  for (const prop of props) {
    for (const part of expandProp(prop, trunk)) {
      const key = `${part.primitive}:${part.castShadow ? "s" : "n"}`;
      const group = groups.get(key);
      if (group) group.parts.push(part);
      else groups.set(key, { key, primitive: part.primitive, castShadow: part.castShadow, parts: [part] });
    }
  }
  return [...groups.values()];
}
