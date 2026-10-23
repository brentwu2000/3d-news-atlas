import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { birdseyePose, CAMERA_FOV, clampTargetDelta, orbitLimits, overviewPose, type CameraPose } from "@/lib/camera";
import { topics } from "@/lib/data";
import { axialToWorld, hexCorner, hexDistance, insideHex, spiral, SQRT3, TILE_APOTHEM, TILE_SIZE } from "@/lib/hex";
import { computeWorldBounds, layoutIslands } from "@/lib/layout";

describe("hex grid", () => {
  it("spiral yields unique cells, centre first, ring by ring", () => {
    const cells = spiral(37);
    expect(cells).toHaveLength(37);
    expect(new Set(cells.map((c) => `${c.q},${c.r}`)).size).toBe(37);
    expect(cells[0]).toEqual({ q: 0, r: 0 });
    cells.slice(1, 7).forEach((c) => expect(hexDistance(c, { q: 0, r: 0 })).toBe(1));
    cells.slice(7, 19).forEach((c) => expect(hexDistance(c, { q: 0, r: 0 })).toBe(2));
  });

  it("neighbouring tiles share an edge exactly (no gaps, no overlap)", () => {
    const [ax, az] = axialToWorld({ q: 0, r: 0 });
    for (const n of spiral(7).slice(1)) {
      const [bx, bz] = axialToWorld(n);
      expect(Math.hypot(bx - ax, bz - az)).toBeCloseTo(SQRT3 * TILE_SIZE, 9);
    }
  });

  it("insideHex matches the corners and apothem", () => {
    expect(insideHex(0, 0)).toBe(true);
    expect(insideHex(0, TILE_APOTHEM - 1e-6)).toBe(true);
    expect(insideHex(0, TILE_APOTHEM + 1e-3)).toBe(false);
    const [cx, cz] = hexCorner(0);
    expect(insideHex(cx * 0.999, cz)).toBe(true);
    expect(insideHex(cx * 1.01, cz)).toBe(false);
  });
});

describe("layoutIslands", () => {
  it("is deterministic and numbers tiles 1..n in data order", () => {
    const a = layoutIslands(topics);
    expect(a).toEqual(layoutIslands(topics));
    expect(a.map((p) => p.index)).toEqual(topics.map((_, i) => i + 1));
  });

  it.each([1, 7, 19, 37])("never stacks two tiles on one cell (%i topics)", (n) => {
    const placements = layoutIslands(Array.from({ length: n }, (_, i) => ({ id: `t${i}` })));
    const keys = new Set(placements.map((p) => `${p.q},${p.r}`));
    expect(keys.size).toBe(n);
  });

  it("bounds contain every tile", () => {
    const placements = layoutIslands(topics);
    const bounds = computeWorldBounds(placements);
    for (const p of placements) {
      expect(Math.hypot(p.x - bounds.center[0], p.z - bounds.center[2]) + p.radius).toBeLessThanOrEqual(bounds.radius + 1e-9);
    }
  });
});

describe("camera", () => {
  const placements = layoutIslands(topics);
  const bounds = computeWorldBounds(placements);
  const dist = (p: CameraPose) => Math.hypot(...p.position.map((v, i) => v - p.target[i]!));

  /** Fraction of tile centres that land inside the viewport for a pose. */
  function tilesOnScreen(pose: CameraPose, aspect: number) {
    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, aspect, 0.5, 2000);
    camera.position.set(...pose.position);
    camera.lookAt(...pose.target);
    camera.updateMatrixWorld();
    return placements.filter((p) => {
      const v = new THREE.Vector3(p.x, 0, p.z).project(camera);
      return Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1;
    }).length;
  }

  it("overview and bird's-eye poses are deterministic", () => {
    expect(overviewPose(bounds, 16 / 9)).toEqual(overviewPose(bounds, 16 / 9));
    expect(birdseyePose(bounds, 16 / 9)).toEqual(birdseyePose(bounds, 16 / 9));
  });

  it.each([
    ["desktop canvas", 1080 / 900],
    ["mobile canvas", 390 / 420],
  ])("overview keeps every tile centre on screen (%s)", (_, aspect) => {
    expect(tilesOnScreen(overviewPose(bounds, aspect), aspect)).toBe(placements.length);
    expect(tilesOnScreen(birdseyePose(bounds, aspect), aspect)).toBe(placements.length);
  });

  it("pulls back further on portrait screens", () => {
    expect(dist(overviewPose(bounds, 390 / 500))).toBeGreaterThan(dist(overviewPose(bounds, 16 / 9)));
  });

  it("handles invalid aspect ratios", () => {
    const pose = overviewPose(bounds, Number.NaN);
    expect([...pose.position, ...pose.target].every(Number.isFinite)).toBe(true);
  });

  it("overview distance is within orbit limits for every reasonable aspect", () => {
    const limits = orbitLimits(bounds);
    for (const aspect of [0.5, 1, 16 / 9, 2.4]) {
      const d = dist(overviewPose(bounds, aspect));
      expect(d).toBeGreaterThan(limits.minDistance);
      expect(d).toBeLessThan(limits.maxDistance);
    }
  });

  it("clamps pan targets that leave the city", () => {
    const limits = orbitLimits(bounds);
    expect(clampTargetDelta([0, 0, 0], bounds, limits.panRadius)).toEqual([0, 0, 0]);
    const far: [number, number, number] = [limits.panRadius * 3, 0, 0];
    const delta = clampTargetDelta(far, bounds, limits.panRadius);
    const corrected = far.map((v, i) => v + delta[i]!);
    expect(Math.hypot(corrected[0]! - bounds.center[0], corrected[2]! - bounds.center[2])).toBeCloseTo(limits.panRadius, 6);
    expect(clampTargetDelta([0, 100, 0], bounds, limits.panRadius)[1]).toBeLessThan(0);
  });
});
