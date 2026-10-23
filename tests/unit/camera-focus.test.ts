import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  CAMERA_FOV,
  FOCUS_MIN_DISTANCE,
  FOCUS_WIDTH_DESKTOP,
  FOCUS_WIDTH_MOBILE,
  focusPose,
  isPoseSafe,
  overviewPose,
  posesEqual,
  type CameraPose,
} from "@/lib/camera";
import { datasetResult } from "@/lib/data";
import { DRAG_THRESHOLD_PX, isTap } from "@/lib/gestures";
import { generateIsland } from "@/lib/island-generator";
import { computeWorldBounds, layoutIslands } from "@/lib/layout";
import { layoutMarkers, MARKER_CAPACITY, MARKER_HEIGHT } from "@/lib/markers";
import { ISLAND_PRESETS } from "@/lib/schema";

if (!datasetResult.ok) throw new Error("fixtures invalid");
const data = datasetResult.data;
const placements = layoutIslands(data.topics);
const bounds = computeWorldBounds(placements);

function projectedWidthFraction(pose: CameraPose, aspect: number, island: (typeof placements)[number]) {
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, aspect, 0.5, 1000);
  camera.position.set(...pose.position);
  camera.lookAt(...pose.target);
  camera.updateMatrixWorld();
  const xs: number[] = [];
  for (let k = 0; k < 64; k++) {
    const a = (k / 64) * Math.PI * 2;
    const p = new THREE.Vector3(island.x + Math.cos(a) * island.radius, island.y, island.z + Math.sin(a) * island.radius).project(camera);
    xs.push((p.x + 1) / 2);
  }
  return { width: Math.max(...xs) - Math.min(...xs), center: (Math.max(...xs) + Math.min(...xs)) / 2 };
}

describe("focusPose", () => {
  const desktopAspect = 1120 / 847;
  const mobileAspect = 390 / 420;

  it.each(placements.map((p) => [p.topicId, p] as const))("frames %s at 35–55%% of the desktop canvas width", (_, island) => {
    const pose = focusPose(island, desktopAspect, { widthFraction: FOCUS_WIDTH_DESKTOP });
    const { width, center } = projectedWidthFraction(pose, desktopAspect, island);
    expect(width).toBeGreaterThanOrEqual(0.35);
    expect(width).toBeLessThanOrEqual(0.55);
    expect(center).toBeCloseTo(0.5, 1);
  });

  it("uses a smaller share on mobile and never gets closer than the minimum distance", () => {
    const island = placements[0]!;
    const mobile = focusPose(island, mobileAspect, { widthFraction: FOCUS_WIDTH_MOBILE });
    const d = Math.hypot(...mobile.position.map((v, i) => v - mobile.target[i]!));
    expect(d).toBeGreaterThanOrEqual(FOCUS_MIN_DISTANCE);
    expect(projectedWidthFraction(mobile, mobileAspect, island).width).toBeLessThan(
      projectedWidthFraction(focusPose(island, desktopAspect, { widthFraction: FOCUS_WIDTH_DESKTOP }), desktopAspect, island).width + 0.05,
    );
  });

  it("centres the island in the unoccluded area when a drawer covers the right side", () => {
    const island = placements[2]!;
    const occludedRight = 384 / 1120;
    const pose = focusPose(island, desktopAspect, { widthFraction: FOCUS_WIDTH_DESKTOP, occludedRight });
    const { center } = projectedWidthFraction(pose, desktopAspect, island);
    expect(center).toBeCloseTo((1 - occludedRight) / 2, 1);
  });

  it("is deterministic", () => {
    const island = placements[1]!;
    const a = focusPose(island, desktopAspect, { widthFraction: 0.45, occludedRight: 0.3 });
    const b = focusPose(island, desktopAspect, { widthFraction: 0.45, occludedRight: 0.3 });
    expect(posesEqual(a, b, 0)).toBe(true);
  });

  it("produces safe poses; rejects poses outside orbit limits", () => {
    for (const island of placements) {
      expect(isPoseSafe(focusPose(island, desktopAspect, { widthFraction: 0.45 }), bounds)).toBe(true);
    }
    expect(isPoseSafe(overviewPose(bounds, desktopAspect), bounds)).toBe(true);
    const underneath: CameraPose = { position: [0, -40, 1], target: [0, 0, 0] };
    expect(isPoseSafe(underneath, bounds)).toBe(false);
    const tooFar: CameraPose = { position: [0, 999, 999], target: [0, 0, 0] };
    expect(isPoseSafe(tooFar, bounds)).toBe(false);
    const panned: CameraPose = { position: [500, 30, 520], target: [500, 0, 500] };
    expect(isPoseSafe(panned, bounds)).toBe(false);
    expect(isPoseSafe({ position: [Number.NaN, 0, 0], target: [0, 0, 0] }, bounds)).toBe(false);
  });
});

describe("gesture arbitration", () => {
  it("treats < 6 CSS px as a tap and anything more as a drag", () => {
    expect(DRAG_THRESHOLD_PX).toBeGreaterThanOrEqual(6);
    expect(isTap(0)).toBe(true);
    expect(isTap(5.9)).toBe(true);
    expect(isTap(6)).toBe(false);
    expect(isTap(40)).toBe(false);
    expect(isTap(undefined)).toBe(false);
    expect(isTap(Number.NaN)).toBe(false);
  });
});

describe("marker layout", () => {
  it.each(data.topics.map((t) => [t.id, t] as const))("places markers above terrain, apart and stable (%s)", (_, topic) => {
    const spec = generateIsland({ seed: topic.seed, preset: topic.theme });
    const ids = (data.eventsByTopic.get(topic.id) ?? []).map((e) => e.id);
    const markers = layoutMarkers(spec, ids);
    expect(markers).toHaveLength(ids.length);
    expect(layoutMarkers(spec, ids)).toEqual(markers);
    for (const m of markers) {
      expect(m.head[1] - m.groundY).toBeCloseTo(MARKER_HEIGHT, 6);
      expect(Math.hypot(m.head[0], m.head[2])).toBeLessThan(spec.radius);
    }
    for (let i = 0; i < markers.length; i++) {
      for (let j = i + 1; j < markers.length; j++) {
        const a = markers[i]!.head;
        const b = markers[j]!.head;
        expect(Math.hypot(a[0] - b[0], a[2] - b[2])).toBeGreaterThan(1.2);
      }
    }
  });
});

describe("marker capacity", () => {
  it.each(ISLAND_PRESETS)("fits %s islands with MARKER_CAPACITY events without overlap", (preset) => {
    for (const seed of [1, 99, 12345]) {
      const spec = generateIsland({ seed, preset, segments: 16 });
      const ids = Array.from({ length: MARKER_CAPACITY }, (_, i) => `e${i}`);
      const markers = layoutMarkers(spec, ids);
      for (let i = 0; i < markers.length; i++) {
        expect(Math.hypot(markers[i]!.head[0], markers[i]!.head[2])).toBeLessThan(spec.radius);
        for (let j = i + 1; j < markers.length; j++) {
          const a = markers[i]!.head;
          const b = markers[j]!.head;
          expect(Math.hypot(a[0] - b[0], a[2] - b[2])).toBeGreaterThanOrEqual(0.95 - 1e-9);
        }
      }
    }
  });
});
