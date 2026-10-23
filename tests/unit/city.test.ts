import { describe, expect, it } from "vitest";
import { getPrimitiveGeometry, lampPositions, roadDashes, buildSlabGeometry } from "@/lib/city-geometry";
import { isHexColor } from "@/lib/color";
import { datasetResult } from "@/lib/data";
import { generateHills, generateTrees, railRadius } from "@/lib/environment";
import { insideHex, TILE_SIZE } from "@/lib/hex";
import { computeWorldBounds, layoutIslands } from "@/lib/layout";
import { PALETTE } from "@/lib/palette";
import { generateParticlePositions, MAX_PARTICLES_DESKTOP, MAX_PARTICLES_MOBILE } from "@/lib/particles";
import { qualitySettings } from "@/lib/quality";
import { ISLAND_PRESETS } from "@/lib/schema";
import { expandProp, generateTile, groupParts, INNER_FRACTION, placeParts } from "@/lib/tile-generator";
import { TIME_PRESETS, TIMES_OF_DAY } from "@/lib/time-of-day";

if (!datasetResult.ok) throw new Error("fixtures invalid");
const data = datasetResult.data;
const bounds = computeWorldBounds(layoutIslands(data.topics));

describe("tile generator", () => {
  it.each(ISLAND_PRESETS)("is deterministic for the same seed (%s)", (preset) => {
    expect(generateTile({ seed: 1234, preset })).toEqual(generateTile({ seed: 1234, preset }));
  });

  it("differs across seeds", () => {
    const a = generateTile({ seed: 1, preset: "forest" });
    const b = generateTile({ seed: 2, preset: "forest" });
    expect(a.props.map((p) => p.position)).not.toEqual(b.props.map((p) => p.position));
  });

  it("gives all 19 presets a distinct look (prop vocabulary + ground)", () => {
    const signatures = ISLAND_PRESETS.map((preset) => {
      const spec = generateTile({ seed: 7, preset });
      return `${spec.ground}|${[...new Set(spec.props.map((p) => p.kind))].sort().join(",")}`;
    });
    expect(new Set(signatures).size).toBe(ISLAND_PRESETS.length);
  });

  it.each(ISLAND_PRESETS)("keeps scattered props inside the inner hex, clear of the road (%s)", (preset) => {
    const spec = generateTile({ seed: 99, preset });
    expect(spec.props.length).toBeGreaterThan(0);
    for (const prop of spec.props) {
      // Landmarks may reach a little further but never past the kerb.
      expect(insideHex(prop.position[0], prop.position[2], TILE_SIZE * 0.8)).toBe(true);
      prop.scale.forEach((s) => expect(s).toBeGreaterThan(0));
    }
    const scattered = spec.props.filter((p) => !["water", "patch", "pier", "ship", "track", "stadium", "hill", "ferris", "bridge"].includes(p.kind));
    for (const prop of scattered) expect(insideHex(prop.position[0], prop.position[2], TILE_SIZE * INNER_FRACTION + 1e-6)).toBe(true);
  });

  it("reduces scattered props at lower density", () => {
    const high = generateTile({ seed: 5, preset: "forest", density: 1 });
    const low = generateTile({ seed: 5, preset: "forest", density: 0.5 });
    expect(low.props.length).toBeLessThan(high.props.length);
    expect(() => generateTile({ seed: 1, preset: "city", density: 0 })).toThrow();
  });

  it("emits smoke only from chimneys", () => {
    expect(generateTile({ seed: 3, preset: "industry" }).smoke.length).toBeGreaterThan(0);
    expect(generateTile({ seed: 3, preset: "forest" }).smoke).toHaveLength(0);
  });

  it("expands every prop into known primitives with finite transforms and hex colours", () => {
    for (const preset of ISLAND_PRESETS) {
      for (const prop of generateTile({ seed: 11, preset }).props) {
        const parts = expandProp(prop);
        expect(parts.length).toBeGreaterThan(0);
        for (const part of parts) {
          expect(() => getPrimitiveGeometry(part.primitive)).not.toThrow();
          expect([...part.position, ...part.scale, ...part.rotation].every(Number.isFinite)).toBe(true);
          expect(isHexColor(part.color)).toBe(true);
        }
      }
    }
  });

  it("instances the whole city in a bounded number of groups", () => {
    const owned = data.topics.map((t, i) => {
      const spec = generateTile({ seed: t.seed, preset: t.theme });
      return { parts: placeParts(spec.props.flatMap(expandProp), 0, 0), owner: i };
    });
    const groups = groupParts(owned);
    // primitive × material × shadow — independent of the number of tiles.
    expect(groups.length).toBeLessThanOrEqual(30);
    for (const g of groups) expect(g.owners).toHaveLength(g.parts.length);
  });
});

describe("city geometry", () => {
  it("builds one slab with 6 top + 12 side triangles", () => {
    expect(buildSlabGeometry().getAttribute("position").count).toBe(6 * 3 * 3);
  });

  it("places dashes and lamps on the road ring of a tile", () => {
    expect(roadDashes()).toHaveLength(24);
    expect(lampPositions()).toHaveLength(12);
    for (const l of lampPositions()) expect(insideHex(l.x, l.z, TILE_SIZE)).toBe(true);
  });
});

describe("surroundings", () => {
  it("scatters trees outside the city and off the rail, deterministically", () => {
    const trees = generateTrees(bounds, 120);
    expect(trees).toEqual(generateTrees(bounds, 120));
    expect(trees.length).toBeGreaterThan(60);
    const rail = railRadius(bounds);
    for (const t of trees) {
      const d = Math.hypot(t.position[0] - bounds.center[0], t.position[2] - bounds.center[2]);
      expect(d).toBeGreaterThan(bounds.radius);
      expect(Math.abs(d - rail)).toBeGreaterThanOrEqual(1.6);
    }
  });

  it("places hills well beyond the city", () => {
    for (const h of generateHills(bounds, 7)) {
      expect(Math.hypot(h.position[0], h.position[2])).toBeGreaterThan(bounds.radius * 2);
    }
  });

  it("respects the particle budget", () => {
    expect(generateParticlePositions(bounds, 10_000).length / 3).toBe(MAX_PARTICLES_DESKTOP);
    expect(qualitySettings("high").particles).toBeLessThanOrEqual(MAX_PARTICLES_DESKTOP);
    expect(qualitySettings("low").particles).toBeLessThanOrEqual(MAX_PARTICLES_MOBILE);
  });
});

describe("palette and time of day", () => {
  it("uses valid hex colours everywhere", () => {
    Object.values(PALETTE).forEach((c) => expect(isHexColor(c)).toBe(true));
    for (const t of TIMES_OF_DAY) {
      const p = TIME_PRESETS[t];
      [p.sky, p.ground, p.hemiSky, p.hemiGround, p.keyColor, p.tileTint].forEach((c) => expect(isHexColor(c)).toBe(true));
      expect(p.glow).toBeGreaterThanOrEqual(0);
      expect(p.glow).toBeLessThanOrEqual(1);
    }
  });

  it("night is the glowing preset, day has no window glow", () => {
    expect(TIME_PRESETS.night.glow).toBe(1);
    expect(TIME_PRESETS.day.glow).toBe(0);
  });
});
