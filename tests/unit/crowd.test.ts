import { describe, expect, it } from "vitest";
import { ROAD_INNER, ROAD_OUTER } from "@/lib/city-geometry";
import { generateCars, generateWalkers, LANE_INNER, LANE_OUTER, loopLength, loopPoint, SIDEWALK_RADIUS, travelled } from "@/lib/crowd";
import { datasetResult } from "@/lib/data";
import { insideHex, TILE_SIZE } from "@/lib/hex";
import { layoutIslands } from "@/lib/layout";
import { qualitySettings } from "@/lib/quality";
import { INNER_FRACTION } from "@/lib/tile-generator";

if (!datasetResult.ok) throw new Error("fixtures invalid");
const placements = layoutIslands(datasetResult.data.topics);

describe("pedestrians", () => {
  it("are deterministic and spread over every tile", () => {
    const a = generateWalkers(placements, 4);
    expect(a).toEqual(generateWalkers(placements, 4));
    expect(new Set(a.map((w) => w.tile)).size).toBe(placements.length);
    expect(a.length).toBeGreaterThanOrEqual(placements.length * 3);
  });

  it("walk a sidewalk loop that clears every prop and stays on the tile", () => {
    // Props live inside INNER_FRACTION; the road starts at ROAD_INNER.
    expect(SIDEWALK_RADIUS).toBeGreaterThan(INNER_FRACTION);
    expect(SIDEWALK_RADIUS).toBeLessThan(ROAD_INNER);
    for (const w of generateWalkers(placements, 4)) {
      for (let k = 0; k < 24; k++) {
        const { x, z } = loopPoint(w.radius + w.lateral, k / 24, w.direction);
        expect(insideHex(x, z, TILE_SIZE * ROAD_INNER)).toBe(true);
        expect(insideHex(x, z, TILE_SIZE * INNER_FRACTION)).toBe(false);
      }
    }
  });

  it("scale with the quality preset", () => {
    expect(generateWalkers(placements, qualitySettings("low").walkersPerTile).length).toBeLessThan(
      generateWalkers(placements, qualitySettings("high").walkersPerTile).length,
    );
  });
});

describe("traffic", () => {
  it("drives inside the road band, in two lanes by direction", () => {
    expect(LANE_INNER).toBeGreaterThan(ROAD_INNER);
    expect(LANE_OUTER).toBeLessThan(ROAD_OUTER);
    for (const c of generateCars(placements, 14)) {
      const lane = c.radius / TILE_SIZE;
      expect(lane).toBeCloseTo(c.direction === 1 ? LANE_OUTER : LANE_INNER, 9);
    }
  });

  it("is capped and deterministic", () => {
    expect(generateCars(placements, 999).length).toBe(placements.length * 2);
    expect(generateCars(placements, 6)).toEqual(generateCars(placements, 6));
  });
});

describe("loop motion", () => {
  it("moves at the configured speed and wraps around the hex loop", () => {
    const r = 4.5;
    const u = travelled(0, 1, r, 1, loopLength(r));
    expect(u).toBeCloseTo(1, 9); // one full lap after perimeter / speed seconds
    const a = loopPoint(r, 0.25, 1);
    const b = loopPoint(r, 1.25, 1);
    expect(a.x).toBeCloseTo(b.x, 9);
    expect(a.z).toBeCloseTo(b.z, 9);
    expect(travelled(0.5, 1, r, -1, 1)).toBeLessThan(0.5);
  });

  it("faces the direction of travel", () => {
    const r = 4;
    const p0 = loopPoint(r, 0.1, 1);
    const p1 = loopPoint(r, 0.1001, 1);
    const travel = Math.atan2(p1.x - p0.x, p1.z - p0.z);
    expect(Math.cos(travel - p0.heading)).toBeCloseTo(1, 6);
    const back = loopPoint(r, 0.1, -1);
    expect(Math.cos(back.heading - p0.heading)).toBeCloseTo(-1, 6);
  });
});
