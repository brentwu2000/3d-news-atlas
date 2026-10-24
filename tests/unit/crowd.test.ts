import { describe, expect, it } from "vitest";
import { ROAD_INNER, ROAD_OUTER } from "@/lib/city-geometry";
import {
  blockers,
  generateCars,
  generateCrossings,
  generateWalkers,
  interiorPath,
  LANE_INNER,
  LANE_OUTER,
  pathLength,
  pathPoint,
  pointSegmentDistance,
  SIDEWALK_RADIUS,
  travelled,
  type Vec2,
} from "@/lib/crowd";
import { datasetResult } from "@/lib/data";
import { hexDistance, insideHex, SQRT3, TILE_SIZE } from "@/lib/hex";
import { layoutIslands } from "@/lib/layout";
import { qualitySettings } from "@/lib/quality";
import { createRng } from "@/lib/random";
import { generateTile, INNER_FRACTION, type TileSpec } from "@/lib/tile-generator";

if (!datasetResult.ok) throw new Error("fixtures invalid");
const data = datasetResult.data;
const placements = layoutIslands(data.topics);
const tiles = new Map<string, TileSpec>(data.topics.map((t) => [t.id, generateTile({ seed: t.seed, preset: t.theme })]));
const high = { perTile: 4, interiorPerTile: 3, crossingShare: 0.7 };

/** Which tile (if any) contains a world point. */
function tileAt(x: number, z: number) {
  return placements.findIndex((p) => insideHex(x - p.x, z - p.z, TILE_SIZE));
}

describe("pedestrians", () => {
  it("are deterministic and include sidewalk, interior and crossing walkers", () => {
    const a = generateWalkers(placements, tiles, high);
    expect(a).toEqual(generateWalkers(placements, tiles, high));
    const kinds = new Set(a.map((w) => w.kind));
    expect(kinds).toEqual(new Set(["sidewalk", "interior", "crossing"]));
  });

  it("sidewalk loops clear every prop and stay off the road", () => {
    expect(SIDEWALK_RADIUS).toBeGreaterThan(INNER_FRACTION);
    expect(SIDEWALK_RADIUS).toBeLessThan(ROAD_INNER);
    for (const w of generateWalkers(placements, tiles, high).filter((w) => w.kind === "sidewalk")) {
      for (const [x, z] of w.path) {
        const t = tileAt(x, z);
        const p = placements[t]!;
        expect(insideHex(x - p.x, z - p.z, TILE_SIZE * ROAD_INNER)).toBe(true);
        expect(insideHex(x - p.x, z - p.z, TILE_SIZE * INNER_FRACTION)).toBe(false);
      }
    }
  });

  it("interior strolls never cut through a building, tree or water", () => {
    let checked = 0;
    for (const topic of data.topics) {
      const spec = tiles.get(topic.id)!;
      const path = interiorPath(spec, createRng(`test:${topic.id}`));
      if (!path) continue;
      checked++;
      const obs = blockers(spec);
      for (let i = 0; i < path.length; i++) {
        const a = path[i]!;
        const b = path[(i + 1) % path.length]!;
        for (const o of obs) expect(pointSegmentDistance([o.x, o.z], a, b)).toBeGreaterThan(o.r);
        expect(insideHex(a[0], a[1], TILE_SIZE * INNER_FRACTION)).toBe(true);
      }
    }
    expect(checked).toBeGreaterThanOrEqual(8);
  });

  it("scale with the quality preset", () => {
    const low = qualitySettings("low");
    const hi = qualitySettings("high");
    const n = (q: typeof low) =>
      generateWalkers(placements, tiles, { perTile: q.walkersPerTile, interiorPerTile: q.interiorWalkers, crossingShare: q.crossingShare }).length;
    expect(n(low)).toBeLessThan(n(hi));
  });
});

describe("zebra crossings", () => {
  const crossings = generateCrossings(placements);

  it("join neighbouring tiles only, about half of the shared edges", () => {
    expect(crossings.length).toBeGreaterThan(8);
    for (const c of crossings) expect(hexDistance(placements[c.a]!, placements[c.b]!)).toBe(1);
  });

  it("run from one sidewalk to the other, with stripes on the roads between", () => {
    const apothem = (SQRT3 / 2) * TILE_SIZE;
    for (const c of crossings) {
      const A = placements[c.a]!;
      const B = placements[c.b]!;
      expect(Math.hypot(c.from[0] - A.x, c.from[1] - A.z)).toBeLessThan(apothem * ROAD_INNER);
      expect(Math.hypot(c.to[0] - B.x, c.to[1] - B.z)).toBeLessThan(apothem * ROAD_INNER);
      expect(c.stripes.length).toBeGreaterThanOrEqual(4);
      for (const s of c.stripes) {
        // Every stripe lies on one of the two road bands, never on a tile's walkable interior.
        const t = tileAt(s.x, s.z);
        const p = placements[t]!;
        expect([c.a, c.b]).toContain(t);
        expect(insideHex(s.x - p.x, s.z - p.z, TILE_SIZE * ROAD_INNER)).toBe(false);
        expect(insideHex(s.x - p.x, s.z - p.z, TILE_SIZE * ROAD_OUTER + 0.2)).toBe(true);
      }
    }
  });

  it("stripes lie across the walking direction (long side along the shared edge)", () => {
    const c = crossings[0]!;
    const walk = Math.atan2(c.to[0] - c.from[0], c.to[1] - c.from[1]);
    for (const s of c.stripes) {
      // Local +x after rotationY is (cos r, -sin r); it must be perpendicular to the walk direction.
      const along: Vec2 = [Math.cos(s.rotationY), -Math.sin(s.rotationY)];
      expect(Math.abs(along[0] * Math.sin(walk) + along[1] * Math.cos(walk))).toBeLessThan(1e-9);
    }
  });
});

describe("traffic", () => {
  it("drives inside the road band, in two lanes by direction", () => {
    expect(LANE_INNER).toBeGreaterThan(ROAD_INNER);
    expect(LANE_OUTER).toBeLessThan(ROAD_OUTER);
    for (const c of generateCars(placements, 14)) {
      const p = placements[tileAt(c.path[0]![0], c.path[0]![1])]!;
      const r = Math.hypot(c.path[0]![0] - p.x, c.path[0]![1] - p.z) / TILE_SIZE;
      expect([LANE_INNER, LANE_OUTER].some((lane) => Math.abs(lane - r) < 1e-9)).toBe(true);
    }
  });

  it("is capped and deterministic", () => {
    expect(generateCars(placements, 999).length).toBe(placements.length * 2);
    expect(generateCars(placements, 6)).toEqual(generateCars(placements, 6));
  });
});

describe("path motion", () => {
  const square: Vec2[] = [
    [0, 0],
    [2, 0],
    [2, 2],
    [0, 2],
  ];

  it("measures closed polylines and wraps", () => {
    expect(pathLength(square)).toBe(8);
    expect(pathLength([[0, 0], [3, 4]])).toBe(10); // there and back
    const a = pathPoint(square, 0.25);
    const b = pathPoint(square, 1.25);
    expect([a.x, a.z]).toEqual([b.x, b.z]);
    expect([a.x, a.z]).toEqual([2, 0]);
  });

  it("moves at the configured speed and faces the direction of travel", () => {
    expect(travelled(0, 2, 8, 4)).toBe(1); // one full lap
    const p = pathPoint(square, 0.1); // on the first edge, heading +x
    expect(Math.sin(p.heading)).toBeCloseTo(1, 9);
    const back = pathPoint([[0, 0], [0, 4]], 0.75); // returning leg heads -z
    expect(Math.cos(back.heading)).toBeCloseTo(-1, 9);
  });

  it("segment distance helper", () => {
    expect(pointSegmentDistance([1, 1], [0, 0], [2, 0])).toBe(1);
    expect(pointSegmentDistance([3, 0], [0, 0], [2, 0])).toBe(1);
  });
});
