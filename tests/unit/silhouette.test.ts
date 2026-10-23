import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { CAMERA_FOV, overviewPose } from "@/lib/camera";
import { topics } from "@/lib/data";
import { expandProp, generateIsland } from "@/lib/island-generator";
import { computeWorldBounds, layoutIslands } from "@/lib/layout";

/**
 * POLISH-V1: islands must not overlap in silhouette in the standard overview
 * camera, and must keep a minimum on-screen size on mobile. We project each
 * island's outline, underside and tallest prop through the real overview
 * pose and test the convex hulls for separation.
 */

type P2 = [number, number];

/** Worst-case vertical offset from the idle bob (see Island.tsx). */
const BOB = 0.12;

function convexHull(points: P2[]): P2[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: P2, a: P2, b: P2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: P2[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: P2[] = [];
  for (const p of pts.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Separating-axis test for two convex polygons; returns the separation gap in px (negative = overlap). */
function separation(a: P2[], b: P2[]): number {
  let best = -Infinity;
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!;
      const q = poly[(i + 1) % poly.length]!;
      const len = Math.hypot(q[1] - p[1], q[0] - p[0]) || 1;
      const axis: P2 = [-(q[1] - p[1]) / len, (q[0] - p[0]) / len];
      const project = (poly2: P2[]) => poly2.map((v) => v[0] * axis[0] + v[1] * axis[1]);
      const pa = project(a);
      const pb = project(b);
      const gap = Math.max(Math.min(...pb) - Math.max(...pa), Math.min(...pa) - Math.max(...pb));
      best = Math.max(best, gap);
    }
  }
  return best;
}

function islandHullsPx(width: number, height: number) {
  const placements = layoutIslands(topics);
  const bounds = computeWorldBounds(placements);
  const pose = overviewPose(bounds, width / height);
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, width / height, 0.5, 1000);
  camera.position.set(...pose.position);
  camera.lookAt(...pose.target);
  camera.updateMatrixWorld();

  const toPx = (v: THREE.Vector3): P2 => {
    const n = v.clone().project(camera);
    return [((n.x + 1) / 2) * width, ((1 - n.y) / 2) * height];
  };

  return topics.map((topic, i) => {
    const pl = placements[i]!;
    const spec = generateIsland({ seed: topic.seed, preset: topic.theme });
    const tallest = Math.max(
      ...spec.props.flatMap((p) => expandProp(p).map((part) => part.position[1] + part.scale[1])),
    );
    const points: P2[] = [];
    for (const dy of [-BOB, BOB]) {
      const y = pl.y + dy;
      // Footprint (incl. pier) at rim height and at the height of the tallest prop.
      for (let k = 0; k < 32; k++) {
        const a = (k / 32) * Math.PI * 2;
        const r = pl.radius;
        points.push(toPx(new THREE.Vector3(pl.x + Math.cos(a) * r, y, pl.z + Math.sin(a) * r)));
      }
      points.push(toPx(new THREE.Vector3(pl.x, y + tallest, pl.z)));
      for (const ring of spec.baseRings) {
        for (let k = 0; k < spec.segments; k++) {
          const a = (k / spec.segments) * Math.PI * 2;
          const r = spec.radius * (spec.rim[k] ?? 1) * ring.scale * (ring.jitter[k] ?? 1);
          points.push(toPx(new THREE.Vector3(pl.x + Math.cos(a) * r, y + ring.y, pl.z + Math.sin(a) * r)));
        }
      }
      points.push(toPx(new THREE.Vector3(pl.x + spec.tip[0], y + spec.tip[1], pl.z + spec.tip[2])));
    }
    return { id: topic.id, hull: convexHull(points) };
  });
}

// Canvas sizes from the actual page layout (header / side panel subtracted).
const VIEWPORTS = [
  { name: "desktop 1440x900", width: 1088, height: 847 },
  { name: "mobile 390x844", width: 390, height: 506 },
];

describe("overview silhouettes", () => {
  it.each(VIEWPORTS)("islands do not overlap on screen ($name)", ({ width, height }) => {
    const hulls = islandHullsPx(width, height);
    for (let i = 0; i < hulls.length; i++) {
      for (let j = i + 1; j < hulls.length; j++) {
        const gap = separation(hulls[i]!.hull, hulls[j]!.hull);
        expect(gap, `${hulls[i]!.id} vs ${hulls[j]!.id}`).toBeGreaterThan(0);
      }
    }
  });

  it.each(VIEWPORTS)("every island stays on screen ($name)", ({ width, height }) => {
    for (const { hull } of islandHullsPx(width, height)) {
      for (const [x, y] of hull) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(width);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(height);
      }
    }
  });

  it("keeps a minimum touch target size on mobile", () => {
    for (const { hull } of islandHullsPx(390, 506)) {
      const xs = hull.map((p) => p[0]);
      // Well above the 44px touch-target guideline.
      expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThanOrEqual(64);
    }
  });
});
