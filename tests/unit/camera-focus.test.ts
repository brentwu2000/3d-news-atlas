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
import { insideHex, TILE_SIZE } from "@/lib/hex";
import { computeWorldBounds, layoutIslands } from "@/lib/layout";
import { layoutMarkers, MARKER_CAPACITY, MARKER_HEIGHT } from "@/lib/markers";
import { ISLAND_PRESETS } from "@/lib/schema";
import { generateTile } from "@/lib/tile-generator";

if (!datasetResult.ok) throw new Error("fixtures invalid");
const data = datasetResult.data;
const placements = layoutIslands(data.topics);
const bounds = computeWorldBounds(placements);

function projectedWidthFraction(pose: CameraPose, aspect: number, tile: (typeof placements)[number]) {
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, aspect, 0.5, 2000);
  camera.position.set(...pose.position);
  camera.lookAt(...pose.target);
  camera.updateMatrixWorld();
  const xs: number[] = [];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const p = new THREE.Vector3(tile.x + Math.cos(a) * tile.radius, 0, tile.z + Math.sin(a) * tile.radius).project(camera);
    xs.push((p.x + 1) / 2);
  }
  return { width: Math.max(...xs) - Math.min(...xs), center: (Math.max(...xs) + Math.min(...xs)) / 2 };
}

describe("focusPose", () => {
  // Map area next to the 360px index on a 1440×900 screen.
  const desktopAspect = 1080 / 900;
  const mobileAspect = 390 / 420;

  it.each(placements.map((p) => [p.topicId, p] as const))("frames %s at 35–55%% of the desktop canvas width", (_, tile) => {
    const pose = focusPose(tile, desktopAspect, { widthFraction: FOCUS_WIDTH_DESKTOP });
    const { width, center } = projectedWidthFraction(pose, desktopAspect, tile);
    expect(width).toBeGreaterThanOrEqual(0.35);
    expect(width).toBeLessThanOrEqual(0.55);
    expect(center).toBeCloseTo(0.5, 1);
  });

  it("uses a smaller share on mobile and never gets closer than the minimum distance", () => {
    const tile = placements[0]!;
    const mobile = focusPose(tile, mobileAspect, { widthFraction: FOCUS_WIDTH_MOBILE });
    const d = Math.hypot(...mobile.position.map((v, i) => v - mobile.target[i]!));
    expect(d).toBeGreaterThanOrEqual(FOCUS_MIN_DISTANCE);
    expect(FOCUS_WIDTH_MOBILE).toBeLessThan(FOCUS_WIDTH_DESKTOP);
  });

  it("centres the tile in the unoccluded area when the detail card covers the right side", () => {
    const tile = placements[2]!;
    const occludedRight = 400 / 1080;
    const pose = focusPose(tile, desktopAspect, { widthFraction: FOCUS_WIDTH_DESKTOP, occludedRight });
    const { center } = projectedWidthFraction(pose, desktopAspect, tile);
    expect(center).toBeCloseTo((1 - occludedRight) / 2, 1);
  });

  it("is deterministic", () => {
    const tile = placements[1]!;
    const a = focusPose(tile, desktopAspect, { widthFraction: 0.45, occludedRight: 0.3 });
    const b = focusPose(tile, desktopAspect, { widthFraction: 0.45, occludedRight: 0.3 });
    expect(posesEqual(a, b, 0)).toBe(true);
  });

  it("produces safe poses; rejects poses outside orbit limits", () => {
    for (const tile of placements) {
      expect(isPoseSafe(focusPose(tile, desktopAspect, { widthFraction: FOCUS_WIDTH_DESKTOP }), bounds)).toBe(true);
    }
    expect(isPoseSafe(overviewPose(bounds, desktopAspect), bounds)).toBe(true);
    expect(isPoseSafe({ position: [0, -40, 1], target: [0, 0, 0] }, bounds)).toBe(false);
    expect(isPoseSafe({ position: [0, 999, 999], target: [0, 0, 0] }, bounds)).toBe(false);
    expect(isPoseSafe({ position: [500, 30, 520], target: [500, 0, 500] }, bounds)).toBe(false);
    // Too close to the horizon: the city must always be seen from above.
    expect(isPoseSafe({ position: [0, 2, 40], target: [0, 0, 0] }, bounds)).toBe(false);
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

describe("beacon layout", () => {
  it.each(data.topics.map((t) => [t.id, t] as const))("places beacons inside the tile, apart and stable (%s)", (_, topic) => {
    const spec = generateTile({ seed: topic.seed, preset: topic.theme });
    const ids = (data.eventsByTopic.get(topic.id) ?? []).map((e) => e.id);
    const markers = layoutMarkers(spec, ids);
    expect(markers).toHaveLength(ids.length);
    expect(layoutMarkers(spec, ids)).toEqual(markers);
    for (const m of markers) {
      expect(m.head[1]).toBe(MARKER_HEIGHT);
      expect(insideHex(m.head[0], m.head[2], TILE_SIZE * 0.8)).toBe(true);
    }
    for (let i = 0; i < markers.length; i++) {
      for (let j = i + 1; j < markers.length; j++) {
        const a = markers[i]!.head;
        const b = markers[j]!.head;
        expect(Math.hypot(a[0] - b[0], a[2] - b[2])).toBeGreaterThanOrEqual(1.5 - 1e-9);
      }
    }
  });

  it.each(ISLAND_PRESETS)("fits MARKER_CAPACITY events on a %s tile without overlap", (preset) => {
    for (const seed of [1, 99, 12345]) {
      const spec = generateTile({ seed, preset });
      const markers = layoutMarkers(spec, Array.from({ length: MARKER_CAPACITY }, (_, i) => `e${i}`));
      for (let i = 0; i < markers.length; i++) {
        for (let j = i + 1; j < markers.length; j++) {
          const a = markers[i]!.head;
          const b = markers[j]!.head;
          expect(Math.hypot(a[0] - b[0], a[2] - b[2])).toBeGreaterThanOrEqual(0.9 - 1e-9);
        }
      }
    }
  });
});
