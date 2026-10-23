import { describe, expect, it } from "vitest";
import { clampTargetDelta, orbitLimits, overviewPose } from "@/lib/camera";
import { topics } from "@/lib/data";
import { computeWorldBounds, ISLAND_GAP, layoutIslands } from "@/lib/layout";

function syntheticTopics(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `topic-${i}`, seed: (i * 2654435761) >>> 0 }));
}

describe("layoutIslands", () => {
  it("is deterministic", () => {
    expect(layoutIslands(topics)).toEqual(layoutIslands(topics));
  });

  it.each([1, 2, 5, 7, 8, 20, 50])("never overlaps islands (%i topics)", (n) => {
    const placements = layoutIslands(syntheticTopics(n));
    expect(placements).toHaveLength(n);
    for (let i = 0; i < placements.length; i++) {
      for (let j = i + 1; j < placements.length; j++) {
        const a = placements[i]!;
        const b = placements[j]!;
        const gap = Math.hypot(a.x - b.x, a.z - b.z) - a.radius - b.radius;
        expect(gap).toBeGreaterThanOrEqual(ISLAND_GAP * 0.5);
      }
    }
  });

  it("bounds contain every island", () => {
    const placements = layoutIslands(topics);
    const bounds = computeWorldBounds(placements);
    for (const p of placements) {
      expect(Math.hypot(p.x - bounds.center[0], p.z - bounds.center[2]) + p.radius).toBeLessThanOrEqual(bounds.radius + 1e-9);
    }
  });
});

describe("camera", () => {
  const bounds = computeWorldBounds(layoutIslands(topics));

  it("overview pose is deterministic", () => {
    expect(overviewPose(bounds, 16 / 9)).toEqual(overviewPose(bounds, 16 / 9));
  });

  it("pulls back further on portrait screens", () => {
    const landscape = overviewPose(bounds, 16 / 9);
    const portrait = overviewPose(bounds, 390 / 500);
    const dist = (p: typeof landscape) => Math.hypot(...p.position.map((v, i) => v - p.target[i]!));
    expect(dist(portrait)).toBeGreaterThan(dist(landscape));
  });

  it("handles invalid aspect ratios", () => {
    const pose = overviewPose(bounds, Number.NaN);
    expect([...pose.position, ...pose.target].every(Number.isFinite)).toBe(true);
  });

  it("overview distance is within orbit limits", () => {
    const limits = orbitLimits(bounds);
    for (const aspect of [0.5, 1, 16 / 9, 2.4]) {
      const p = overviewPose(bounds, aspect);
      const d = Math.hypot(...p.position.map((v, i) => v - p.target[i]!));
      expect(d).toBeGreaterThan(limits.minDistance);
      expect(d).toBeLessThan(limits.maxDistance);
    }
  });

  it("clamps pan targets that leave the world", () => {
    const limits = orbitLimits(bounds);
    expect(clampTargetDelta([0, 0, 0], bounds, limits.panRadius)).toEqual([0, 0, 0]);
    const far: [number, number, number] = [limits.panRadius * 3, 0, 0];
    const delta = clampTargetDelta(far, bounds, limits.panRadius);
    const corrected = far.map((v, i) => v + delta[i]!);
    expect(Math.hypot(corrected[0]! - bounds.center[0], corrected[2]! - bounds.center[2])).toBeCloseTo(limits.panRadius, 6);
    expect(clampTargetDelta([0, 100, 0], bounds, limits.panRadius)[1]).toBeLessThan(0);
  });
});
