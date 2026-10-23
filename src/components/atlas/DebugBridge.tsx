"use client";

import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import * as THREE from "three";
import type { Vec3 } from "@/lib/island-generator";
import type { WorldModel } from "./WorldScene";

export interface AtlasDebugApi {
  /** CSS-pixel point (page coordinates) of an island's top centre, or null. */
  islandScreenPoint(topicId: string): { x: number; y: number } | null;
  /** CSS-pixel point of an event marker head, or null if not rendered/visible. */
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
  const scene = useThree((s) => s.scene);
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
        const island = scene.getObjectByName(`island:${topicId}`);
        if (!island) return null;
        // Slightly above the rim plane so the ray hits terrain, not a marker.
        return toPage(island.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.3, 0)));
      },
      markerScreenPoint(eventId) {
        if (!visibleIds.has(eventId)) return null;
        for (const [topicId, list] of world.markers) {
          const marker = list.find((m) => m.eventId === eventId);
          if (!marker) continue;
          const island = scene.getObjectByName(`island:${topicId}`);
          return island ? toPage(island.localToWorld(new THREE.Vector3(...marker.head))) : null;
        }
        return null;
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
  }, [camera, gl, scene, controls, world, visibleIds]);

  return null;
}
