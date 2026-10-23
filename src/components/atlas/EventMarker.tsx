"use client";

import type { ThreeEvent } from "@react-three/fiber";
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { isTap } from "@/lib/gestures";
import type { Vec3 } from "@/lib/tile-generator";
import { BEACON_RADIUS, BEAM_HEIGHT, MARKER_HIT_RADIUS } from "@/lib/markers";
import { useAtlasStore } from "@/store/atlas-store";
import { getBeaconBeamMaterial, getBeaconHitMaterial, getBeaconRingMaterial, getHaloMaterial } from "./materials";

/*
 * Every visible event beacon in the city, drawn with three InstancedMeshes
 * (ground ring, light beam, invisible hit proxy). All beacons look the same:
 * neither colour nor size encodes status or importance.
 */

let ringGeometry: THREE.BufferGeometry | null = null;
let beamGeometry: THREE.BufferGeometry | null = null;
let hitGeometry: THREE.BufferGeometry | null = null;
let haloGeometry: THREE.BufferGeometry | null = null;

function geometries() {
  ringGeometry ??= new THREE.TorusGeometry(BEACON_RADIUS, 0.07, 3, 18).rotateX(Math.PI / 2);
  beamGeometry ??= new THREE.CylinderGeometry(0.12, BEACON_RADIUS * 0.9, BEAM_HEIGHT, 10, 1, true).translate(0, BEAM_HEIGHT / 2, 0);
  hitGeometry ??= new THREE.SphereGeometry(MARKER_HIT_RADIUS, 8, 6);
  haloGeometry ??= new THREE.TorusGeometry(BEACON_RADIUS * 1.7, 0.06, 4, 32).rotateX(Math.PI / 2);
  return { ring: ringGeometry, beam: beamGeometry, hit: hitGeometry, halo: haloGeometry };
}

const tmp = new THREE.Object3D();

export interface BeaconInstance {
  eventId: string;
  /** World position of the beam centre (pick target). */
  head: Vec3;
}

interface BeaconsProps {
  beacons: readonly BeaconInstance[];
  selectedEventId: string | null;
  hoveredEventId: string | null;
  animate: boolean;
}

export function Beacons({ beacons, selectedEventId, hoveredEventId, animate }: BeaconsProps) {
  const ringRef = useRef<THREE.InstancedMesh>(null);
  const beamRef = useRef<THREE.InstancedMesh>(null);
  const hitRef = useRef<THREE.InstancedMesh>(null);
  const haloRef = useRef<THREE.Mesh>(null);
  const g = geometries();
  const capacity = Math.max(1, beacons.length);

  useLayoutEffect(() => {
    const meshes = [ringRef.current, beamRef.current, hitRef.current];
    beacons.forEach((b, i) => {
      tmp.position.set(b.head[0], 0.07, b.head[2]);
      tmp.scale.set(1, 1, 1);
      tmp.updateMatrix();
      ringRef.current?.setMatrixAt(i, tmp.matrix);
      beamRef.current?.setMatrixAt(i, tmp.matrix);
      tmp.position.set(...b.head);
      tmp.updateMatrix();
      hitRef.current?.setMatrixAt(i, tmp.matrix);
    });
    for (const mesh of meshes) {
      if (!mesh) continue;
      mesh.count = beacons.length;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, [beacons]);

  // Selected beacon wins; otherwise the hovered one.
  const halo = useMemo(() => {
    const id = beacons.some((b) => b.eventId === selectedEventId) ? selectedEventId : hoveredEventId;
    return beacons.find((b) => b.eventId === id);
  }, [beacons, selectedEventId, hoveredEventId]);

  // Gentle halo pulse (disabled with reduced motion / paused animations).
  useFrame(({ clock }) => {
    const mesh = haloRef.current;
    if (!mesh) return;
    const s = animate ? 1 + Math.sin(clock.elapsedTime * 3) * 0.12 : 1;
    mesh.scale.set(s, 1, s);
  });

  const idAt = (e: ThreeEvent<PointerEvent | MouseEvent>) => (e.instanceId === undefined ? undefined : beacons[e.instanceId]?.eventId);

  return (
    <group name="beacons">
      <instancedMesh ref={ringRef} args={[g.ring, getBeaconRingMaterial(), capacity]} raycast={() => null} dispose={null} />
      <instancedMesh ref={beamRef} args={[g.beam, getBeaconBeamMaterial(), capacity]} raycast={() => null} renderOrder={2} dispose={null} />
      {/* Invisible but raycastable (three's Raycaster ignores `visible`); costs no draw call. */}
      <instancedMesh
        ref={hitRef}
        name="beacon-hits"
        args={[g.hit, getBeaconHitMaterial(), capacity]}
        visible={false}
        onClick={(e) => {
          // Beacon picks take priority over the tile underneath.
          e.stopPropagation();
          if (!isTap(e.delta)) return;
          const id = idAt(e);
          if (id) useAtlasStore.getState().selectEvent(id);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          const id = idAt(e);
          if (id) useAtlasStore.getState().hoverEvent(id);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          useAtlasStore.getState().hoverEvent(null);
          document.body.style.cursor = "";
        }}
        dispose={null}
      />
      {halo && (
        <mesh ref={haloRef} geometry={g.halo} material={getHaloMaterial()} position={[halo.head[0], 0.09, halo.head[2]]} raycast={() => null} dispose={null} />
      )}
    </group>
  );
}
