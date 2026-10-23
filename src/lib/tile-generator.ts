import { insideHex, TILE_SIZE } from "./hex";
import { PALETTE as C } from "./palette";
import { createRng, hashString, type Rng } from "./random";
import type { IslandPreset } from "./schema";

/**
 * Pure, deterministic description of one hex tile diorama. No three.js
 * objects are created here, so output is unit-testable and identical on
 * every load for the same seed.
 *
 * Local space: tile centre at the origin, y = 0 is the tile's top surface.
 */

export type Vec3 = [number, number, number];

export type PropKind =
  | "tree"
  | "pine"
  | "bush"
  | "rock"
  | "building"
  | "tower"
  | "apartment"
  | "frame"
  | "house"
  | "hut"
  | "warehouse"
  | "tank"
  | "chimney"
  | "lighthouse"
  | "pier"
  | "hall"
  | "column"
  | "flag"
  | "water"
  | "patch"
  | "container"
  | "crane"
  | "ship"
  | "stall"
  | "bridge"
  | "track"
  | "ferris"
  | "carousel"
  | "hospital"
  | "ambulance"
  | "turbine"
  | "solar"
  | "pagoda"
  | "dam"
  | "barn"
  | "silo"
  | "stadium"
  | "floodlight"
  | "datacenter"
  | "antenna"
  | "dish"
  | "hill"
  | "car";

export interface PropInstance {
  kind: PropKind;
  position: Vec3;
  /** Width (x), height (y), depth (z) in world units. */
  scale: Vec3;
  rotationY: number;
  color: string;
  /** Secondary colour (roof, stripe, foliage tier…). */
  accent: string;
  variant: number;
}

export interface TileSpec {
  preset: IslandPreset;
  seed: number;
  /** Colour of the tile's walkable surface. */
  ground: string;
  props: PropInstance[];
  /** Points (tile-local) where animated smoke rises (chimneys etc.). */
  smoke: Vec3[];
}

export interface GenerateTileOptions {
  seed: number;
  preset: IslandPreset;
  /** Multiplier on scattered prop counts; 1 = desktop, lower on mobile. */
  density?: number;
}

/** Props stay inside this fraction of the tile so the road ring stays clear. */
export const INNER_FRACTION = 0.72;
const INNER = TILE_SIZE * INNER_FRACTION;

const GROUND: Record<IslandPreset, string> = {
  city: C.plaza,
  forest: C.grass,
  industry: C.asphalt,
  coast: C.sand,
  civic: C.plaza,
  port: C.asphalt,
  market: C.plaza,
  river: C.grass,
  school: C.grass,
  housing: C.plaza,
  fair: C.grass,
  hospital: C.plaza,
  energy: C.grass,
  oldtown: C.plaza,
  reservoir: C.grass,
  farm: C.grassDark,
  stadium: C.plaza,
  tech: C.plaza,
  mountain: C.grassDark,
};

interface Scatter {
  kind: PropKind;
  count: [number, number];
  width: [number, number];
  height: [number, number];
  depthRatio?: [number, number];
  colors: readonly string[];
  accents: readonly string[];
}

const TREES = [C.tree, C.treeLight, C.treeDark] as const;
const FACADES = [C.wallCream, C.wallBlue, C.wallGrey, C.wallNavy] as const;

const SCATTER: Record<IslandPreset, Scatter[]> = {
  city: [
    { kind: "building", count: [6, 9], width: [1.2, 1.9], height: [1.6, 3.6], depthRatio: [0.7, 1.3], colors: FACADES, accents: [C.roofDark, C.roofYellow] },
    { kind: "tree", count: [3, 5], width: [0.7, 0.9], height: [1.0, 1.4], colors: TREES, accents: TREES },
    { kind: "car", count: [2, 3], width: [0.9, 0.9], height: [0.45, 0.45], colors: [C.accentRed, C.wallWhite, C.wallBlue], accents: [C.roofDark] },
  ],
  forest: [
    { kind: "pine", count: [16, 22], width: [0.8, 1.2], height: [1.8, 3.0], colors: [C.treeDark, C.tree], accents: [C.treeLight, C.tree] },
    { kind: "tree", count: [5, 8], width: [0.8, 1.1], height: [1.2, 1.7], colors: TREES, accents: TREES },
    { kind: "rock", count: [3, 5], width: [0.5, 0.9], height: [0.4, 0.6], colors: [C.rock], accents: [C.rock] },
  ],
  industry: [
    { kind: "tank", count: [2, 3], width: [1.3, 1.6], height: [1.0, 1.4], colors: [C.metal, C.wallWhite], accents: [C.metalDark] },
    { kind: "container", count: [3, 5], width: [1.4, 1.4], height: [0.6, 0.6], depthRatio: [0.45, 0.45], colors: [C.accentRed, C.wallBlue, C.accentYellow, C.wallTeal], accents: [C.metalDark] },
    { kind: "tree", count: [1, 2], width: [0.6, 0.8], height: [1.0, 1.2], colors: TREES, accents: TREES },
  ],
  coast: [
    { kind: "hut", count: [3, 4], width: [0.9, 1.1], height: [0.7, 0.8], colors: [C.wallWhite, C.wallCream, C.wallTeal], accents: [C.roofRed, C.roofTeal] },
    { kind: "tree", count: [3, 5], width: [0.7, 0.9], height: [1.3, 1.6], colors: [C.treeLight], accents: [C.tree] },
    { kind: "rock", count: [3, 5], width: [0.5, 0.8], height: [0.3, 0.5], colors: [C.rock], accents: [C.rock] },
  ],
  civic: [
    { kind: "tree", count: [5, 7], width: [0.7, 0.9], height: [1.1, 1.4], colors: TREES, accents: TREES },
    { kind: "bush", count: [3, 5], width: [0.5, 0.7], height: [0.35, 0.45], colors: TREES, accents: TREES },
  ],
  port: [
    { kind: "container", count: [9, 13], width: [1.4, 1.4], height: [0.6, 0.6], depthRatio: [0.45, 0.45], colors: [C.accentRed, C.wallBlue, C.accentYellow, C.wallTeal, C.accentOrange], accents: [C.metalDark] },
  ],
  market: [
    { kind: "stall", count: [9, 12], width: [1.0, 1.2], height: [0.7, 0.8], depthRatio: [0.8, 1.0], colors: [C.wallCream, C.wallWhite], accents: [C.accentRed, C.accentYellow, C.accentOrange] },
    { kind: "tree", count: [1, 2], width: [0.7, 0.8], height: [1.1, 1.3], colors: TREES, accents: TREES },
  ],
  river: [
    { kind: "tree", count: [6, 9], width: [0.7, 1.0], height: [1.1, 1.6], colors: TREES, accents: TREES },
    { kind: "bush", count: [3, 5], width: [0.5, 0.7], height: [0.35, 0.5], colors: TREES, accents: TREES },
    { kind: "rock", count: [2, 3], width: [0.5, 0.7], height: [0.3, 0.5], colors: [C.rock], accents: [C.rock] },
  ],
  school: [
    { kind: "tree", count: [4, 6], width: [0.7, 0.9], height: [1.1, 1.5], colors: TREES, accents: TREES },
  ],
  housing: [
    { kind: "tree", count: [2, 3], width: [0.7, 0.8], height: [1.0, 1.3], colors: TREES, accents: TREES },
    { kind: "car", count: [1, 2], width: [0.9, 0.9], height: [0.45, 0.45], colors: [C.wallWhite, C.wallBlue], accents: [C.roofDark] },
  ],
  fair: [
    { kind: "stall", count: [3, 4], width: [0.9, 1.0], height: [0.7, 0.8], depthRatio: [0.8, 1.0], colors: [C.wallWhite], accents: [C.accentPink, C.accentYellow, C.accentRed] },
    { kind: "tree", count: [3, 5], width: [0.7, 0.9], height: [1.1, 1.4], colors: TREES, accents: TREES },
  ],
  hospital: [
    { kind: "tree", count: [3, 5], width: [0.7, 0.9], height: [1.0, 1.3], colors: TREES, accents: TREES },
    { kind: "car", count: [1, 2], width: [0.9, 0.9], height: [0.45, 0.45], colors: [C.wallWhite, C.wallGrey], accents: [C.roofDark] },
  ],
  energy: [
    { kind: "bush", count: [3, 5], width: [0.5, 0.7], height: [0.35, 0.5], colors: TREES, accents: TREES },
  ],
  oldtown: [
    { kind: "house", count: [10, 13], width: [0.9, 1.3], height: [0.8, 1.4], depthRatio: [0.8, 1.2], colors: [C.wallCream, C.wallBrick, C.wallWhite, C.wallGrey], accents: [C.roofRed, C.roofDark, C.roofTeal] },
    { kind: "tree", count: [1, 2], width: [0.7, 0.8], height: [1.0, 1.2], colors: TREES, accents: TREES },
  ],
  reservoir: [
    { kind: "pine", count: [6, 9], width: [0.8, 1.0], height: [1.6, 2.4], colors: [C.treeDark, C.tree], accents: [C.treeLight] },
    { kind: "rock", count: [2, 3], width: [0.5, 0.7], height: [0.3, 0.5], colors: [C.rock], accents: [C.rock] },
  ],
  farm: [
    { kind: "tree", count: [2, 3], width: [0.7, 0.9], height: [1.1, 1.4], colors: TREES, accents: TREES },
  ],
  stadium: [
    { kind: "tree", count: [3, 4], width: [0.6, 0.8], height: [1.0, 1.2], colors: TREES, accents: TREES },
    { kind: "car", count: [2, 4], width: [0.9, 0.9], height: [0.45, 0.45], colors: [C.accentRed, C.wallWhite, C.wallBlue, C.accentYellow], accents: [C.roofDark] },
  ],
  tech: [
    { kind: "tree", count: [3, 4], width: [0.6, 0.8], height: [1.0, 1.3], colors: TREES, accents: TREES },
  ],
  mountain: [
    { kind: "pine", count: [8, 12], width: [0.7, 1.0], height: [1.5, 2.4], colors: [C.treeDark, C.tree], accents: [C.treeLight] },
    { kind: "rock", count: [3, 5], width: [0.5, 0.9], height: [0.4, 0.7], colors: [C.rock], accents: [C.rock] },
  ],
};

function footprint(prop: PropInstance): number {
  // Flat ground patches don't block other props.
  if (prop.kind === "patch" || prop.kind === "track") return 0;
  return Math.max(prop.scale[0], prop.scale[2]) * 0.5;
}

/** Fully inside the usable inner hex (all four footprint corners). */
function fitsInside(x: number, z: number, halfW: number, halfD: number, rot: number): boolean {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  for (const [dx, dz] of [
    [halfW, halfD],
    [-halfW, halfD],
    [halfW, -halfD],
    [-halfW, -halfD],
  ] as const) {
    if (!insideHex(x + dx * c + dz * s, z - dx * s + dz * c, INNER)) return false;
  }
  return true;
}

class Placer {
  readonly props: PropInstance[] = [];
  readonly smoke: Vec3[] = [];
  constructor(readonly rng: Rng) {}

  /** Place a landmark at a fixed spot (no collision check). */
  fixed(kind: PropKind, x: number, z: number, scale: Vec3, color: string, accent = color, rotationY = 0, variant = 0, y = 0) {
    const prop: PropInstance = { kind, position: [x, y, z], scale, rotationY, color, accent, variant };
    this.props.push(prop);
    return prop;
  }

  /** Scatter props randomly inside the inner hex, avoiding everything already placed. */
  scatter(recipe: Scatter, density: number) {
    const target = Math.max(1, Math.round(this.rng.int(recipe.count[0], recipe.count[1]) * density));
    let placed = 0;
    for (let attempt = 0; attempt < target * 40 && placed < target; attempt++) {
      const x = this.rng.range(-INNER, INNER);
      const z = this.rng.range(-INNER, INNER);
      const width = this.rng.range(recipe.width[0], recipe.width[1]);
      const depth = recipe.depthRatio ? width * this.rng.range(recipe.depthRatio[0], recipe.depthRatio[1]) : width;
      const rot = recipe.kind === "container" || recipe.kind === "house" || recipe.kind === "building" || recipe.kind === "stall"
        ? this.rng.pick([0, Math.PI / 3, (2 * Math.PI) / 3])
        : this.rng.range(0, Math.PI * 2);
      if (!fitsInside(x, z, width / 2, depth / 2, rot)) continue;
      const candidate: PropInstance = {
        kind: recipe.kind,
        position: [x, 0, z],
        scale: [width, this.rng.range(recipe.height[0], recipe.height[1]), depth],
        rotationY: rot,
        color: this.rng.pick(recipe.colors),
        accent: this.rng.pick(recipe.accents),
        variant: this.rng.int(0, 2),
      };
      const ok = this.props.every((o) => {
        const d = Math.hypot(o.position[0] - x, o.position[2] - z);
        return d >= footprint(o) + footprint(candidate) + 0.1;
      });
      if (ok) {
        this.props.push(candidate);
        placed++;
      }
    }
  }
}

/** Seeded small offset so identical presets don't look stamped. */
const jitter = (rng: Rng, amount = 0.4) => rng.range(-amount, amount);

function landmarks(preset: IslandPreset, p: Placer) {
  const rng = p.rng;
  switch (preset) {
    case "city": {
      p.fixed("tower", -1.2 + jitter(rng), -0.6, [1.7, 5.2, 1.7], C.wallNavy, C.roofYellow, 0, 0);
      p.fixed("tower", 1.0 + jitter(rng), 0.4, [1.5, 4.0, 1.5], C.wallBlue, C.roofDark, Math.PI / 6, 1);
      break;
    }
    case "forest": {
      p.fixed("water", 0.6, 0.8, [2.6, 0.05, 1.8], C.water, C.sand, rng.range(0, Math.PI));
      p.fixed("hut", -1.6, -0.8, [1.1, 0.8, 1.0], C.wallCream, C.roofRed, 0.3);
      break;
    }
    case "industry": {
      p.fixed("warehouse", -1.0, 0.9, [2.8, 1.2, 1.6], C.wallGrey, C.roofDark, 0);
      p.fixed("warehouse", 1.4, -1.4, [2.2, 1.0, 1.4], C.metal, C.roofRed, Math.PI / 3);
      const c1 = p.fixed("chimney", 1.4 + jitter(rng, 0.2), 1.0, [0.5, 4.2, 0.5], C.wallBrick, C.metalDark);
      const c2 = p.fixed("chimney", 0.6, 1.5, [0.42, 3.4, 0.42], C.wallWhite, C.accentRed);
      p.smoke.push([c1.position[0], c1.scale[1] + 0.2, c1.position[2]], [c2.position[0], c2.scale[1] + 0.2, c2.position[2]]);
      break;
    }
    case "coast": {
      // Sea fills the south side of the tile; lighthouse on the shore, pier into the water.
      p.fixed("water", 0, 2.0, [7.2, 0.05, 2.6], C.water, C.sand);
      p.fixed("lighthouse", -1.8, 0.6, [0.9, 3.6, 0.9], C.wallWhite, C.accentRed);
      p.fixed("pier", 1.4, 1.9, [0.7, 0.12, 2.4], C.trunk, C.trunk);
      p.fixed("ship", -0.2, 2.6, [1.6, 0.6, 0.7], C.wallWhite, C.wallBlue, 0.2);
      break;
    }
    case "civic": {
      p.fixed("hall", 0, -0.4, [3.4, 1.6, 2.2], C.wallWhite, C.wallCream);
      for (let i = 0; i < 5; i++) p.fixed("column", -1.4 + i * 0.7, 0.85, [0.22, 1.5, 0.22], C.wallWhite, C.wallCream);
      p.fixed("flag", 1.9, 1.4, [0.08, 2.6, 0.08], C.metal, C.accentRed);
      break;
    }
    case "port": {
      p.fixed("water", 0, -1.9, [7.2, 0.05, 2.6], C.waterDeep, C.metalDark);
      p.fixed("crane", -1.4, -0.4, [0.6, 4.2, 0.6], C.accentRed, C.accentYellow, 0);
      p.fixed("crane", 1.2, -0.4, [0.6, 3.8, 0.6], C.accentYellow, C.accentRed, 0);
      p.fixed("ship", 0, -2.2, [3.6, 0.9, 1.1], C.wallNavy, C.wallWhite, 0);
      break;
    }
    case "market": {
      p.fixed("patch", 0, 0, [6.0, 0.03, 1.0], C.asphalt, C.asphalt, Math.PI / 6);
      break;
    }
    case "river": {
      p.fixed("water", 0, 0, [9.0, 0.05, 1.9], C.water, C.sand, -Math.PI / 6);
      p.fixed("bridge", 0.2, 0.1, [0.9, 0.35, 3.2], C.wallGrey, C.metalDark, -Math.PI / 6 + Math.PI / 2);
      break;
    }
    case "school": {
      p.fixed("track", 1.0, 0.9, [3.2, 0.04, 2.2], C.wallBrick, C.grassDark);
      p.fixed("building", -1.4, -1.0, [3.0, 1.8, 1.2], C.wallCream, C.roofRed, Math.PI / 3, 0);
      p.fixed("flag", -2.4, 0.6, [0.08, 2.4, 0.08], C.metal, C.accentYellow);
      break;
    }
    case "housing": {
      p.fixed("apartment", -1.3, -0.4, [1.6, 4.6, 1.6], C.wallCream, C.roofDark);
      p.fixed("apartment", 0.8, -1.2, [1.6, 3.8, 1.6], C.wallTeal, C.roofDark, Math.PI / 6);
      p.fixed("frame", 1.0, 1.1, [1.6, 3.2, 1.6], C.metalDark, C.accentYellow);
      p.fixed("crane", -0.3, 1.5, [0.5, 5.4, 0.5], C.accentYellow, C.accentYellow, Math.PI / 2);
      break;
    }
    case "fair": {
      p.fixed("ferris", -0.6, -0.4, [3.4, 3.8, 0.5], C.accentYellow, C.accentPink, 0.2);
      p.fixed("carousel", 1.6, 1.1, [1.8, 1.6, 1.8], C.accentPink, C.wallWhite);
      break;
    }
    case "hospital": {
      p.fixed("hospital", -0.5, -0.8, [3.0, 3.2, 1.8], C.wallWhite, C.accentRed, 0);
      p.fixed("patch", 1.6, 1.3, [1.6, 0.03, 1.6], C.asphalt, C.wallWhite);
      p.fixed("ambulance", 0.2, 1.4, [1.1, 0.6, 0.55], C.wallWhite, C.accentRed, 0.4);
      break;
    }
    case "energy": {
      p.fixed("turbine", -1.6, -1.0, [0.3, 4.6, 0.3], C.wallWhite, C.wallWhite, 0.3);
      p.fixed("turbine", 0.2, -1.8, [0.3, 4.2, 0.3], C.wallWhite, C.wallWhite, 1.1);
      p.fixed("turbine", 1.8, -0.6, [0.3, 4.4, 0.3], C.wallWhite, C.wallWhite, 2.0);
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          p.fixed("solar", -1.2 + col * 1.15, 0.7 + row * 0.75, [1.0, 0.5, 0.55], C.wallNavy, C.metal);
        }
      }
      break;
    }
    case "oldtown": {
      p.fixed("pagoda", 0.2, -0.2, [1.6, 3.0, 1.6], C.accentRed, C.roofYellow);
      break;
    }
    case "reservoir": {
      p.fixed("water", 0.3, 0.2, [5.6, 0.05, 4.2], C.waterDeep, C.sand, 0.2);
      p.fixed("dam", -2.2, 0.4, [0.7, 0.9, 3.4], C.wallGrey, C.metalDark, 0.2);
      p.fixed("silo", -2.2, -1.6, [0.7, 1.6, 0.7], C.wallWhite, C.metalDark);
      break;
    }
    case "farm": {
      const crops = [C.accentYellow, C.treeLight, C.grass, C.sand];
      for (let i = 0; i < 4; i++) p.fixed("patch", -1.0 + (i % 2) * 2.2, -1.2 + Math.floor(i / 2) * 2.0, [2.0, 0.06, 1.7], crops[i]!, crops[i]!, 0, 1);
      p.fixed("barn", 1.9, 1.4, [1.4, 1.1, 1.0], C.accentRed, C.wallWhite, 0.4);
      p.fixed("silo", 2.4, 0.2, [0.7, 2.0, 0.7], C.metal, C.accentRed);
      break;
    }
    case "stadium": {
      p.fixed("stadium", 0, 0, [5.0, 1.2, 3.8], C.wallWhite, C.grass);
      for (const [x, z] of [
        [-2.6, -1.9],
        [2.6, -1.9],
        [-2.6, 1.9],
        [2.6, 1.9],
      ] as const) {
        p.fixed("floodlight", x * 0.95, z * 0.95, [0.16, 3.2, 0.16], C.metalDark, C.lamp);
      }
      break;
    }
    case "tech": {
      p.fixed("datacenter", -0.8, 0.2, [3.0, 1.6, 2.0], C.wallNavy, C.beacon, 0);
      p.fixed("antenna", 1.8, -1.4, [0.6, 5.6, 0.6], C.metal, C.accentRed);
      p.fixed("dish", 1.6, 1.2, [1.4, 1.2, 1.4], C.wallWhite, C.metalDark, 2.4);
      break;
    }
    case "mountain": {
      p.fixed("hill", -0.8, -0.6, [4.0, 3.4, 3.6], C.hill, C.rock, 0.3);
      p.fixed("hill", 1.6, 0.6, [2.8, 2.2, 2.6], C.grassDark, C.rock, 1.2);
      p.fixed("hut", -1.6, 1.8, [1.0, 0.8, 0.9], C.wallCream, C.accentRed, 0.2);
      break;
    }
  }
}

export function generateTile({ seed, preset, density = 1 }: GenerateTileOptions): TileSpec {
  if (!(density > 0)) throw new Error("density must be > 0");
  const rng = createRng(hashString(`tile:${preset}:${seed}`));
  const placer = new Placer(rng);
  landmarks(preset, placer);
  for (const recipe of SCATTER[preset]) placer.scatter(recipe, density);
  return { preset, seed, ground: GROUND[preset], props: placer.props, smoke: placer.smoke };
}

/* ------------------------------------------------------------------ */
/* Prop → primitive part expansion                                     */
/* ------------------------------------------------------------------ */

/** Shared low-poly unit primitives (1×1×1 bounding box, resting on y = 0). */
/** "torus" stands upright (ring in the XY plane); "ring" lies flat on the ground. */
export type PrimitiveKey = "box" | "cylinder" | "frustum" | "cone" | "prism" | "blob" | "dome" | "disc" | "rock" | "torus" | "ring" | "sphere";

/**
 * standard: lit albedo · facade: lit + window texture that glows at night ·
 * emissive: self-lit accents (lamps, signs) · water: glossy flat surfaces.
 */
export type MaterialKind = "standard" | "facade" | "emissive" | "water";

export interface PrimitivePart {
  primitive: PrimitiveKey;
  material: MaterialKind;
  /** Centre-bottom position in tile-local space. */
  position: Vec3;
  scale: Vec3;
  /** Euler rotation applied in "YXZ" order: local tilt (x, z) first, then yaw (y). */
  rotation: Vec3;
  color: string;
  castShadow: boolean;
}

const SHADOW_KINDS: ReadonlySet<PropKind> = new Set<PropKind>([
  "building", "tower", "apartment", "frame", "house", "warehouse", "tank", "chimney", "lighthouse", "hall",
  "crane", "ship", "hospital", "turbine", "pagoda", "dam", "barn", "silo", "stadium", "datacenter", "antenna", "hill", "ferris", "carousel",
]);

export function expandProp(prop: PropInstance): PrimitivePart[] {
  const [x, y, z] = prop.position;
  const [w, h, d] = prop.scale;
  const r = prop.rotationY;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const cast = SHADOW_KINDS.has(prop.kind);
  /** Offsets (ox, oz) are in the prop's rotated local frame. */
  const part = (
    primitive: PrimitiveKey,
    dy: number,
    scale: Vec3,
    color: string,
    { ox = 0, oz = 0, material = "standard" as MaterialKind, rx = 0, rz = 0, ry = 0 } = {},
  ): PrimitivePart => ({
    primitive,
    material,
    position: [x + ox * cos + oz * sin, y + dy, z - ox * sin + oz * cos],
    scale,
    rotation: [rx, r + ry, rz],
    color,
    castShadow: cast,
  });

  switch (prop.kind) {
    case "tree":
      return [
        part("cylinder", 0, [w * 0.16, h * 0.4, w * 0.16], C.trunk),
        part("blob", h * 0.3, [w, h * 0.6, w], prop.color),
        part("blob", h * 0.55, [w * 0.6, h * 0.45, w * 0.6], prop.accent, { ox: w * 0.15, oz: -w * 0.1 }),
      ];
    case "pine":
      return [
        part("cylinder", 0, [w * 0.14, h * 0.22, w * 0.14], C.trunk),
        part("cone", h * 0.14, [w, h * 0.5, w], prop.color),
        part("cone", h * 0.42, [w * 0.72, h * 0.42, w * 0.72], prop.accent),
        part("cone", h * 0.68, [w * 0.45, h * 0.32, w * 0.45], prop.color),
      ];
    case "bush":
      return [part("blob", 0, [w, h, w], prop.color), part("blob", 0, [w * 0.7, h * 0.8, w * 0.7], prop.accent, { ox: w * 0.4 })];
    case "rock":
      return [part("rock", -h * 0.2, [w, h, w * 0.85], prop.color), part("rock", -h * 0.2, [w * 0.5, h * 0.6, w * 0.45], prop.accent, { ox: w * 0.45 })];
    case "building":
      return [
        part("box", 0, [w, h, d], prop.color, { material: "facade" }),
        prop.variant === 0
          ? part("prism", h, [w * 1.02, Math.min(0.7, w * 0.4), d * 1.02], prop.accent)
          : part("box", h, [w * 1.04, 0.14, d * 1.04], prop.accent),
      ];
    case "tower": {
      const t1 = h * 0.62;
      return [
        part("box", 0, [w, t1, d], prop.color, { material: "facade" }),
        part("box", t1, [w * 0.8, h * 0.3, d * 0.8], prop.color, { material: "facade" }),
        part("box", h * 0.92, [w * 0.86, h * 0.08, d * 0.86], prop.accent),
        part("cylinder", h, [0.07, 0.8, 0.07], C.metal),
        part("sphere", h + 0.8, [0.18, 0.18, 0.18], C.accentRed, { material: "emissive" }),
      ];
    }
    case "apartment":
      return [
        part("box", 0, [w, h, d], prop.color, { material: "facade" }),
        part("box", h, [w * 1.05, 0.16, d * 1.05], prop.accent),
        part("box", h + 0.16, [w * 0.35, 0.4, d * 0.35], C.metalDark),
      ];
    case "frame":
      // Building under construction: open floors.
      return [0, 1, 2, 3].flatMap((i) => [
        part("box", (h / 4) * i, [w, 0.08, d], prop.color),
        part("box", (h / 4) * i, [0.12, h / 4, 0.12], prop.color, { ox: w / 2 - 0.06, oz: d / 2 - 0.06 }),
        part("box", (h / 4) * i, [0.12, h / 4, 0.12], prop.color, { ox: -w / 2 + 0.06, oz: -d / 2 + 0.06 }),
      ]);
    case "house":
      return [part("box", 0, [w, h, d], prop.color, { material: "facade" }), part("prism", h, [w * 1.1, h * 0.55, d * 1.1], prop.accent)];
    case "hut":
      return [part("box", 0, [w, h, d], prop.color), part("prism", h, [w * 1.15, h * 0.7, d * 1.15], prop.accent)];
    case "warehouse":
      return [
        part("box", 0, [w, h, d], prop.color),
        part("prism", h, [w * 0.5, h * 0.4, d], prop.accent, { ox: -w * 0.25 }),
        part("prism", h, [w * 0.5, h * 0.4, d], prop.accent, { ox: w * 0.25 }),
      ];
    case "tank":
      return [
        part("cylinder", 0, [w, h, d], prop.color),
        part("cylinder", h * 0.5, [w * 1.04, h * 0.07, d * 1.04], prop.accent),
        part("dome", h, [w, h * 0.25, d], prop.color),
      ];
    case "chimney":
      return [
        part("box", 0, [w * 2.2, 0.4, w * 2.2], C.metalDark),
        part("frustum", 0.4, [w, h - 0.4, d], prop.color),
        part("cylinder", h * 0.7, [w * 0.86, 0.2, d * 0.86], prop.accent),
      ];
    case "lighthouse":
      return [
        part("box", 0, [w * 1.5, 0.3, d * 1.5], C.wallGrey),
        part("frustum", 0.3, [w, h * 0.7, d], prop.color),
        part("cylinder", 0.3 + h * 0.35, [w * 0.86, h * 0.1, d * 0.86], prop.accent),
        part("cylinder", 0.3 + h * 0.7, [w * 0.7, h * 0.12, d * 0.7], C.lamp, { material: "emissive" }),
        part("cone", 0.3 + h * 0.82, [w * 0.86, h * 0.18, d * 0.86], prop.accent),
      ];
    case "pier":
      return [
        part("box", 0.04, [w, h, d], prop.color),
        part("cylinder", -0.4, [0.12, 0.5, 0.12], prop.accent, { ox: w * 0.4, oz: d * 0.4 }),
        part("cylinder", -0.4, [0.12, 0.5, 0.12], prop.accent, { ox: -w * 0.4, oz: d * 0.4 }),
      ];
    case "hall":
      return [
        part("box", 0, [w * 1.1, 0.25, d * 1.2], C.wallCream),
        part("box", 0.25, [w, h, d * 0.7], prop.color, { material: "facade", oz: -d * 0.15 }),
        part("prism", 0.25 + h, [w * 1.05, 0.7, d * 0.9], prop.accent),
        part("cylinder", 0.25 + h, [1.0, 0.4, 1.0], prop.color, { oz: -d * 0.15 }),
        part("dome", 0.65 + h, [1.0, 0.8, 1.0], C.roofTeal, { oz: -d * 0.15 }),
      ];
    case "column":
      return [part("cylinder", 0, [w, h, d], prop.color)];
    case "flag":
      return [part("cylinder", 0, [w, h, d], prop.color), part("box", h * 0.78, [0.8, 0.5, 0.04], prop.accent, { ox: 0.4 })];
    case "water":
      return [part("box", -0.02, [w * 1.04, 0.05, d * 1.08], prop.accent), part("box", 0, [w, h, d], prop.color, { material: "water" })];
    case "patch":
      return [part("box", 0, [w, h, d], prop.color)];
    case "container":
      return [
        part("box", 0, [w, h, d], prop.color),
        ...(prop.variant > 0 ? [part("box", h, [w, h, d], prop.variant === 1 ? C.wallBlue : C.accentYellow)] : []),
      ];
    case "crane":
      return [
        part("box", 0, [w * 1.6, 0.3, w * 1.6], C.metalDark),
        part("box", 0.3, [w * 0.5, h, w * 0.5], prop.color),
        part("box", h, [h * 0.75, 0.25, 0.3], prop.accent, { ox: h * 0.2 }),
        part("box", h - 0.6, [0.6, 0.6, 0.6], prop.color),
        part("cylinder", h * 0.55, [0.05, h * 0.42, 0.05], C.metalDark, { ox: h * 0.5 }),
      ];
    case "ship":
      return [
        part("box", -0.25, [w, h * 0.6, d], prop.color),
        part("box", h * 0.35, [w * 0.3, h * 0.6, d * 0.8], prop.accent, { ox: -w * 0.28, material: "facade" }),
        part("box", h * 0.35, [w * 0.18, 0.25, d * 0.5], C.accentRed, { ox: w * 0.15 }),
      ];
    case "stall":
      return [
        part("box", 0, [w, h * 0.7, d], prop.color),
        part("prism", h * 0.7, [w * 1.12, h * 0.45, d * 1.12], prop.accent),
        part("sphere", h * 0.95, [0.18, 0.18, 0.18], C.lamp, { material: "emissive", ox: w * 0.5 }),
      ];
    case "bridge":
      return [
        part("box", 0.25, [w, 0.15, d], prop.color),
        part("box", 0.4, [0.08, 0.3, d], prop.accent, { ox: w / 2 }),
        part("box", 0.4, [0.08, 0.3, d], prop.accent, { ox: -w / 2 }),
      ];
    case "track":
      return [part("disc", 0, [w, h, d], prop.color), part("disc", h, [w * 0.72, h, d * 0.62], prop.accent)];
    case "ferris": {
      const hub = h * 0.55;
      return [
        part("box", 0, [0.2, hub, 0.2], C.metalDark, { ox: -0.5, rz: 0.25 }),
        part("box", 0, [0.2, hub, 0.2], C.metalDark, { ox: 0.5, rz: -0.25 }),
        part("torus", hub - w * 0.45, [w * 0.9, w * 0.9, 0.18], prop.color),
        part("torus", hub - w * 0.25, [w * 0.5, w * 0.5, 0.12], prop.color),
        part("sphere", hub - 0.15, [0.3, 0.3, 0.3], C.lamp, { material: "emissive" }),
        ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
          const a = (i / 8) * Math.PI * 2;
          return part("box", hub + Math.sin(a) * w * 0.45 - 0.2, [0.32, 0.32, 0.32], i % 2 ? prop.accent : C.wallWhite, { ox: Math.cos(a) * w * 0.45 });
        }),
      ];
    }
    case "carousel":
      return [
        part("cylinder", 0, [w, 0.25, d], prop.accent),
        part("cylinder", 0.25, [0.18, h * 0.6, 0.18], C.lamp, { material: "emissive" }),
        part("cone", 0.25 + h * 0.55, [w * 1.1, h * 0.45, d * 1.1], prop.color),
      ];
    case "hospital":
      return [
        part("box", 0, [w, h, d], prop.color, { material: "facade" }),
        part("box", 0, [w * 0.45, h * 0.55, d * 0.6], prop.color, { material: "facade", ox: w * 0.55, oz: d * 0.2 }),
        part("box", h, [w * 1.03, 0.14, d * 1.03], C.wallGrey),
        part("box", h * 0.62, [0.7, 0.22, 0.06], prop.accent, { material: "emissive", oz: d / 2 + 0.02 }),
        part("box", h * 0.62 - 0.24, [0.22, 0.7, 0.06], prop.accent, { material: "emissive", oz: d / 2 + 0.02 }),
      ];
    case "ambulance":
      return [
        part("box", 0.15, [w, h, d], prop.color),
        part("box", 0.15 + h * 0.4, [w * 1.01, 0.12, d * 1.01], prop.accent),
        part("box", 0.15 + h, [0.25, 0.1, 0.3], C.accentRed, { material: "emissive" }),
        part("cylinder", 0, [0.28, 0.28, 0.28], C.roofDark, { ox: w * 0.3, rx: Math.PI / 2 }),
        part("cylinder", 0, [0.28, 0.28, 0.28], C.roofDark, { ox: -w * 0.3, rx: Math.PI / 2 }),
      ];
    case "car":
      return [
        part("box", 0.1, [w, h * 0.5, w * 0.5], prop.color),
        part("box", 0.1 + h * 0.5, [w * 0.55, h * 0.4, w * 0.45], prop.color),
        part("box", 0.1 + h * 0.5, [w * 0.56, h * 0.25, w * 0.46], prop.accent, { oz: 0 }),
      ];
    case "turbine": {
      const hub = h;
      return [
        part("frustum", 0, [w, h, w], prop.color),
        part("box", hub - 0.15, [0.3, 0.3, 0.6], prop.color),
        ...[0, 1, 2].map((i) =>
          part("box", hub - 0.05, [0.12, h * 0.38, 0.04], prop.accent, { oz: 0.32, rz: (i / 3) * Math.PI * 2 }),
        ),
      ];
    }
    case "solar":
      return [
        part("box", 0, [0.08, h * 0.6, 0.08], C.metalDark),
        part("box", h * 0.5, [w, 0.06, d], prop.color, { rx: -0.45 }),
      ];
    case "pagoda":
      return [0, 1, 2].flatMap((i) => {
        const k = 1 - i * 0.22;
        const base = (h / 3) * i;
        return [
          part("box", base, [w * 0.7 * k, h / 3 - 0.25, d * 0.7 * k], prop.color, { material: i === 0 ? "facade" : "standard" }),
          part("cone", base + h / 3 - 0.3, [w * 1.15 * k, 0.45, d * 1.15 * k], prop.accent),
        ];
      });
    case "dam":
      return [part("box", 0, [w, h, d], prop.color), part("box", h, [w * 1.2, 0.12, d], prop.accent)];
    case "barn":
      return [part("box", 0, [w, h, d], prop.color), part("prism", h, [w * 1.1, h * 0.7, d * 1.1], prop.accent)];
    case "silo":
      return [part("cylinder", 0, [w, h, d], prop.color), part("dome", h, [w, w * 0.6, d], prop.accent)];
    case "stadium":
      return [
        part("disc", 0, [w * 0.82, 0.06, d * 0.78], prop.accent),
        part("ring", 0, [w, h, d], prop.color),
        part("disc", 0.07, [w * 0.35, 0.02, d * 0.02], C.wallWhite),
      ];
    case "floodlight":
      return [
        part("cylinder", 0, [w, h, d], prop.color),
        part("box", h, [0.7, 0.4, 0.15], prop.accent, { material: "emissive" }),
      ];
    case "datacenter":
      return [
        part("box", 0, [w, h, d], prop.color, { material: "facade" }),
        part("box", h, [w * 0.25, 0.4, d * 0.25], C.metal, { ox: -w * 0.25 }),
        part("box", h, [w * 0.25, 0.4, d * 0.25], C.metal, { ox: w * 0.2 }),
        part("box", h * 0.5, [w * 1.01, 0.08, d * 1.01], prop.accent, { material: "emissive" }),
      ];
    case "antenna":
      return [
        part("frustum", 0, [w, h, w], prop.color),
        part("cylinder", h, [0.05, 0.9, 0.05], prop.color),
        part("sphere", h + 0.9, [0.2, 0.2, 0.2], prop.accent, { material: "emissive" }),
      ];
    case "dish":
      return [part("cylinder", 0, [0.18, h * 0.6, 0.18], C.metalDark), part("dome", h * 0.45, [w, w * 0.35, w], prop.color, { rx: -1.0 })];
    case "hill":
      return [
        part("rock", 0, [w, h, d], prop.color),
        part("rock", 0, [w * 0.55, h * 0.75, d * 0.5], prop.accent, { ox: w * 0.25, oz: d * 0.15 }),
      ];
  }
}

export interface PartGroup {
  key: string;
  primitive: PrimitiveKey;
  material: MaterialKind;
  castShadow: boolean;
  parts: PrimitivePart[];
  /** Same length as parts: index of the tile each part belongs to (for picking). */
  owners: number[];
}

/** Group parts of many tiles by (primitive, material, shadow) → one InstancedMesh each. */
export function groupParts(tiles: ReadonlyArray<{ parts: readonly PrimitivePart[]; owner: number }>): PartGroup[] {
  const groups = new Map<string, PartGroup>();
  for (const { parts, owner } of tiles) {
    for (const part of parts) {
      const key = `${part.primitive}:${part.material}:${part.castShadow ? "s" : "n"}`;
      let group = groups.get(key);
      if (!group) {
        group = { key, primitive: part.primitive, material: part.material, castShadow: part.castShadow, parts: [], owners: [] };
        groups.set(key, group);
      }
      group.parts.push(part);
      group.owners.push(owner);
    }
  }
  return [...groups.values()];
}

/** Translate tile-local parts into world space (tiles are not rotated). */
export function placeParts(parts: readonly PrimitivePart[], dx: number, dz: number): PrimitivePart[] {
  return parts.map((p) => ({ ...p, position: [p.position[0] + dx, p.position[1], p.position[2] + dz] }));
}
