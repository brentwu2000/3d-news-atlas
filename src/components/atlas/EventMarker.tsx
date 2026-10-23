"use client";

import type { ThreeEvent } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { ArtSwatches } from "@/lib/art-tokens";
import { isTap } from "@/lib/gestures";
import { MARKER_HEAD_SIZE, MARKER_HIT_RADIUS, type MarkerPlacement } from "@/lib/markers";
import { useAtlasStore } from "@/store/atlas-store";
import { getMarkerHaloMaterial, getMarkerHeadMaterial, getMarkerStemMaterial } from "./materials";

/*
 * All markers of one island are drawn with three InstancedMeshes (stem, head,
 * invisible hit proxy) so the cost is constant per island, not per event.
 * Every marker looks identical: neither colour nor size encodes status.
 */

let headGeometry: THREE.BufferGeometry | null = null;
let stemGeometry: THREE.BufferGeometry | null = null;
let hitGeometry: THREE.BufferGeometry | null = null;
let haloGeometry: THREE.BufferGeometry | null = null;

function geometries() {
  headGeometry ??= new THREE.OctahedronGeometry(MARKER_HEAD_SIZE, 0);
  stemGeometry ??= new THREE.CylinderGeometry(0.04, 0.04, 1, 5).translate(0, 0.5, 0);
  hitGeometry ??= new THREE.SphereGeometry(MARKER_HIT_RADIUS, 8, 6);
  haloGeometry ??= new THREE.TorusGeometry(MARKER_HEAD_SIZE * 1.7, 0.06, 6, 24).rotateX(Math.PI / 2);
  return { head: headGeometry, stem: stemGeometry, hit: hitGeometry, halo: haloGeometry };
}

const tmp = new THREE.Object3D();

interface EventMarkersProps {
  /** Only the currently visible (filtered) markers, in stable order. */
  markers: readonly MarkerPlacement[];
  selectedEventId: string | null;
  hoveredEventId: string | null;
  swatches: ArtSwatches;
}

export function EventMarkers({ markers, selectedEventId, hoveredEventId, swatches }: EventMarkersProps) {
  const headRef = useRef<THREE.InstancedMesh>(null);
  const stemRef = useRef<THREE.InstancedMesh>(null);
  const hitRef = useRef<THREE.InstancedMesh>(null);
  const g = geometries();
  const capacity = Math.max(1, markers.length);

  useLayoutEffect(() => {
    const head = headRef.current;
    const stem = stemRef.current;
    const hit = hitRef.current;
    if (!head || !stem || !hit) return;
    markers.forEach((m, i) => {
      tmp.position.set(...m.head);
      tmp.rotation.set(0, 0, 0);
      tmp.scale.set(1, 1, 1);
      tmp.updateMatrix();
      head.setMatrixAt(i, tmp.matrix);
      hit.setMatrixAt(i, tmp.matrix);
      const stemHeight = Math.max(0.1, m.head[1] - m.groundY - MARKER_HEAD_SIZE);
      tmp.position.set(m.head[0], m.groundY, m.head[2]);
      tmp.scale.set(1, stemHeight, 1);
      tmp.updateMatrix();
      stem.setMatrixAt(i, tmp.matrix);
    });
    for (const mesh of [head, stem, hit]) {
      mesh.count = markers.length;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, [markers]);

  // Selected marker wins; otherwise show the hovered one (if it lives on this island).
  const halo = useMemo(() => {
    const haloId = markers.some((m) => m.eventId === selectedEventId) ? selectedEventId : hoveredEventId;
    return markers.find((m) => m.eventId === haloId);
  }, [markers, selectedEventId, hoveredEventId]);

  const idAt = (e: ThreeEvent<PointerEvent | MouseEvent>) => (e.instanceId === undefined ? undefined : markers[e.instanceId]?.eventId);

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    // Marker picks take priority over the parent island.
    e.stopPropagation();
    if (!isTap(e.delta)) return;
    const id = idAt(e);
    if (id) useAtlasStore.getState().selectEvent(id);
  };
  const onOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const id = idAt(e);
    if (id) useAtlasStore.getState().hoverEvent(id);
    document.body.style.cursor = "pointer";
  };
  const onOut = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    useAtlasStore.getState().hoverEvent(null);
    document.body.style.cursor = "";
  };

  return (
    <group name="markers">
      <instancedMesh ref={stemRef} args={[g.stem, getMarkerStemMaterial(swatches.stoneLight), capacity]} dispose={null} />
      <instancedMesh ref={headRef} args={[g.head, getMarkerHeadMaterial(swatches.highlight), capacity]} dispose={null} />
      {/* Invisible but raycastable (three's Raycaster ignores `visible`); costs no draw call. */}
      <instancedMesh
        ref={hitRef}
        name="marker-hits"
        args={[g.hit, getMarkerHeadMaterial(swatches.highlight), capacity]}
        visible={false}
        onClick={onClick}
        onPointerOver={onOver}
        onPointerOut={onOut}
        dispose={null}
      />
      {halo && <mesh geometry={g.halo} material={getMarkerHaloMaterial(swatches.highlight)} position={halo.head} dispose={null} />}
    </group>
  );
}
