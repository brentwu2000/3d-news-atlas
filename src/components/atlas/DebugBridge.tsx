"use client";

import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import * as THREE from "three";
import type { Vec3 } from "@/lib/tile-generator";
import type { WorldModel } from "./WorldScene";

export interface AtlasDebugApi {
  /** CSS-pixel point (page coordinates) on a tile's open ground near its centre, or null. */
  islandScreenPoint(topicId: string): { x: number; y: number } | null;
  /** CSS-pixel point of an event beacon, or null if not rendered/visible. */
  markerScreenPoint(eventId: string): { x: number; y: number } | null;
  cameraPose(): { position: Vec3; target: Vec3 };
  visibleMarkerIds(): string[];
}

declare global {
  interface Window {
    __ATLAS_DEBUG__?: AtlasDebugApi;
  }
}

/** `?debug=1` only: lets E2E tests aim real pointer events at 3D objects. */
export function DebugBridge({ world, visibleIds }: { world: WorldModel; visibleIds: ReadonlySet<string> }) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const controls = useThree((s) => s.controls) as unknown as { target?: THREE.Vector3 } | null;

  useEffect(() => {
    const toPage = (v: THREE.Vector3) => {
      const p = v.clone().project(camera);
      if (p.z > 1) return null;
      const rect = gl.domElement.getBoundingClientRect();
      return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
    };
    window.__ATLAS_DEBUG__ = {
      islandScreenPoint(topicId) {
        const p = world.placements.find((pl) => pl.topicId === topicId);
        if (!p) return null;
        // Road ring near the tile's east corner: always tile geometry, never a beacon,
        // a tall prop or the number label (which sits at the front edge).
        return toPage(new THREE.Vector3(p.x + p.radius * 0.86, 0.03, p.z));
      },
      markerScreenPoint(eventId) {
        if (!visibleIds.has(eventId)) return null;
        const head = world.markerWorld.get(eventId);
        return head ? toPage(new THREE.Vector3(...head)) : null;
      },
      cameraPose() {
        const t = controls?.target ?? new THREE.Vector3();
        return { position: [camera.position.x, camera.position.y, camera.position.z], target: [t.x, t.y, t.z] };
      },
      visibleMarkerIds() {
        return [...visibleIds];
      },
    };
    return () => {
      delete window.__ATLAS_DEBUG__;
    };
  }, [camera, gl, controls, world, visibleIds]);

  return null;
}
