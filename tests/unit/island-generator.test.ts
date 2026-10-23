import { describe, expect, it } from "vitest";
import { DEFAULT_ART_TOKENS, deriveSwatches } from "@/lib/art-tokens";
import { isHexColor } from "@/lib/color";
import {
  expandProp,
  generateIsland,
  groupPartsByPrimitive,
  ISLAND_EXTENT,
  islandRadius,
  MAX_ISLAND_RADIUS,
  MIN_ISLAND_RADIUS,
  RIM_MAX,
  RIM_MIN,
  surfaceHeightAt,
} from "@/lib/island-generator";
import { buildBaseGeometry, buildTerrainGeometry, getPrimitiveGeometry } from "@/lib/island-geometry";
import { createRng, hashString } from "@/lib/random";
import { ISLAND_PRESETS } from "@/lib/schema";

describe("random", () => {
  it("is deterministic for a given seed", () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
    seqA.forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    });
  });

  it("differs across seeds and hashes strings stably", () => {
    expect(createRng(1).next()).not.toEqual(createRng(2).next());
    expect(hashString("atlas")).toBe(hashString("atlas"));
    expect(hashString("atlas")).not.toBe(hashString("atlas2"));
  });
});

describe("generateIsland", () => {
  it.each(ISLAND_PRESETS)("produces identical output for the same seed (%s)", (preset) => {
    const a = generateIsland({ seed: 1234, preset });
    const b = generateIsland({ seed: 1234, preset });
    expect(a).toEqual(b);
  });

  it("produces different islands for different seeds", () => {
    const a = generateIsland({ seed: 1, preset: "forest" });
    const b = generateIsland({ seed: 2, preset: "forest" });
    expect(a.rim).not.toEqual(b.rim);
  });

  it("gives each preset a distinct prop vocabulary", () => {
    const kinds = Object.fromEntries(
      ISLAND_PRESETS.map((preset) => [preset, new Set(generateIsland({ seed: 99, preset }).props.map((p) => p.kind))]),
    );
    expect(kinds.city?.has("tower")).toBe(true);
    expect(kinds.forest?.has("pine")).toBe(true);
    expect(kinds.industry?.has("tank")).toBe(true);
    expect(kinds.coast?.has("lighthouse")).toBe(true);
    expect(kinds.civic?.has("dome")).toBe(true);
    expect(kinds.city?.has("pine")).toBe(false);
  });

  it.each(ISLAND_PRESETS)("keeps every prop on the island and on the surface (%s)", (preset) => {
    const spec = generateIsland({ seed: 777, preset });
    expect(spec.props.length).toBeGreaterThan(5);
    for (const prop of spec.props) {
      const [x, y, z] = prop.position;
      // The pier deliberately sits at rim level and juts out over the edge.
      if (prop.kind === "pier") continue;
      expect(Math.hypot(x, z)).toBeLessThan(spec.radius * RIM_MAX);
      expect(Math.abs(y - surfaceHeightAt(spec, x, z))).toBeLessThan(0.03);
      prop.scale.forEach((s) => expect(s).toBeGreaterThan(0));
    }
  });

  it("reduces prop count at lower density", () => {
    const high = generateIsland({ seed: 5, preset: "forest", density: 1 });
    const low = generateIsland({ seed: 5, preset: "forest", density: 0.5 });
    expect(low.props.length).toBeLessThan(high.props.length);
  });

  it("radius depends only on the seed and is bounded", () => {
    for (let seed = 0; seed < 200; seed++) {
      const r = islandRadius(seed);
      expect(r).toBeGreaterThanOrEqual(MIN_ISLAND_RADIUS);
      expect(r).toBeLessThanOrEqual(MAX_ISLAND_RADIUS);
      expect(generateIsland({ seed, preset: "city" }).radius).toBe(r);
    }
  });

  it("rejects invalid options", () => {
    expect(() => generateIsland({ seed: 1, preset: "city", segments: 3 })).toThrow();
    expect(() => generateIsland({ seed: 1, preset: "city", density: 0 })).toThrow();
  });
});

describe("prop expansion", () => {
  it("maps every prop to known primitives", () => {
    for (const preset of ISLAND_PRESETS) {
      const spec = generateIsland({ seed: 3, preset });
      for (const prop of spec.props) {
        const parts = expandProp(prop);
        expect(parts.length).toBeGreaterThan(0);
        parts.forEach((part) => expect(() => getPrimitiveGeometry(part.primitive)).not.toThrow());
      }
    }
  });

  it("bounds the number of instanced meshes per island", () => {
    for (const preset of ISLAND_PRESETS) {
      const groups = groupPartsByPrimitive(generateIsland({ seed: 3, preset }).props);
      // At most 9 primitives x {shadow, no-shadow}; in practice far fewer.
      expect(groups.length).toBeLessThanOrEqual(14);
      expect(new Set(groups.map((g) => g.key)).size).toBe(groups.length);
    }
  });
});

describe("island geometry", () => {
  it.each(ISLAND_PRESETS)("builds deterministic, finite geometry (%s)", (preset) => {
    const spec = generateIsland({ seed: 2024, preset, segments: 12 });
    const terrainA = buildTerrainGeometry(spec).getAttribute("position").array;
    const terrainB = buildTerrainGeometry(spec).getAttribute("position").array;
    expect(Array.from(terrainA)).toEqual(Array.from(terrainB));
    const base = buildBaseGeometry(spec);
    const positions = Array.from(base.getAttribute("position").array);
    expect(positions.every(Number.isFinite)).toBe(true);
    // One quad band (2 tris) per base ring + tip fan, 3 verts per tri.
    expect(positions.length / 3).toBe(spec.segments * (spec.baseRings.length * 6 + 3));
    // Terrain: centre fan + 3 quad bands.
    expect(terrainA.length / 3).toBe(spec.segments * (3 + 6 * 3));
  });

  it("terrain faces point upwards", () => {
    const spec = generateIsland({ seed: 8, preset: "civic", segments: 12 });
    const normals = buildTerrainGeometry(spec).getAttribute("normal");
    for (let i = 0; i < normals.count; i++) expect(normals.getY(i)).toBeGreaterThan(0);
  });
});

describe("POLISH-V1 geometry rules", () => {
  it.each(ISLAND_PRESETS)("has an irregular, clamped outline and 2-3 tapered strata (%s)", (preset) => {
    const spec = generateIsland({ seed: 4242, preset });
    spec.rim.forEach((r) => {
      expect(r).toBeGreaterThanOrEqual(RIM_MIN);
      expect(r).toBeLessThanOrEqual(RIM_MAX);
    });
    expect(Math.max(...spec.rim) - Math.min(...spec.rim)).toBeGreaterThan(0.05);
    expect([2, 3]).toContain(spec.strata);
    expect(spec.baseRings).toHaveLength(1 + spec.strata * 2);
    // Strictly descending and tapering towards the tip.
    for (let i = 1; i < spec.baseRings.length; i++) {
      expect(spec.baseRings[i]!.y).toBeLessThan(spec.baseRings[i - 1]!.y);
      expect(spec.baseRings[i]!.scale).toBeLessThanOrEqual(spec.baseRings[i - 1]!.scale);
    }
    expect(spec.tip[1]).toBeLessThan(spec.baseRings.at(-1)!.y);
  });

  it.each(ISLAND_PRESETS)("keeps every part within the island extent (%s)", (preset) => {
    const spec = generateIsland({ seed: 31337, preset });
    for (const prop of spec.props) {
      for (const part of expandProp(prop)) {
        const reach = Math.hypot(part.position[0], part.position[2]) + Math.max(part.scale[0], part.scale[2]) / 2;
        expect(reach).toBeLessThanOrEqual(spec.radius * ISLAND_EXTENT + 1e-6);
      }
    }
  });

  it("derives every colour from the art tokens", () => {
    const base = generateIsland({ seed: 9, preset: "coast" });
    const allColours = [
      ...Object.values(base.palette).flat(),
      ...base.baseRings.map((r) => r.color),
      ...base.props.flatMap((p) => [p.color, p.accent]),
    ];
    allColours.forEach((c) => expect(isHexColor(c)).toBe(true));

    const retinted = generateIsland({
      seed: 9,
      preset: "coast",
      swatches: deriveSwatches({ ...DEFAULT_ART_TOKENS, foliage: "#336699", sand: "#aa8844" }),
    });
    expect(retinted.palette.top).not.toBe(base.palette.top);
    expect(retinted.palette.topEdge).not.toBe(base.palette.topEdge);
    // Geometry is unaffected by palette changes.
    expect(retinted.rim).toEqual(base.rim);
    expect(retinted.props.map((p) => p.position)).toEqual(base.props.map((p) => p.position));
  });

  it("small props do not cast shadows; large structures do", () => {
    for (const prop of generateIsland({ seed: 1, preset: "city" }).props) {
      const parts = expandProp(prop);
      if (prop.kind === "tree" || prop.kind === "rock" || prop.kind === "bush") expect(parts.some((p) => p.castShadow)).toBe(false);
      if (prop.kind === "tower" || prop.kind === "building") expect(parts.every((p) => p.castShadow)).toBe(true);
    }
  });

  it("composes trees, buildings and landmarks from multiple parts", () => {
    const composed = ["tree", "pine", "building", "tower", "hut", "tank", "lighthouse", "dome", "pier"];
    for (const preset of ISLAND_PRESETS) {
      for (const prop of generateIsland({ seed: 77, preset }).props) {
        if (composed.includes(prop.kind)) expect(expandProp(prop).length).toBeGreaterThanOrEqual(2);
      }
    }
  });
});
