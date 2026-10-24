"use client";

import { useFrame } from "@react-three/fiber";
import { memo, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { getPrimitiveGeometry } from "@/lib/city-geometry";
import { generateCars, generateCrossings, generateWalkers, pathLength, pathPoint, travelled } from "@/lib/crowd";
import type { IslandPlacement } from "@/lib/layout";
import type { QualitySettings } from "@/lib/quality";
import type { TileSpec } from "@/lib/tile-generator";
import { getLineMaterial, getPropMaterial } from "./materials";

/*
 * Ambient pedestrians, zebra crossings and traffic. Each body part is one
 * InstancedMesh for the whole city; per frame we only rewrite instance
 * matrices (no React state). With reduced motion / paused animations the
 * crowd freezes, so frames stay deterministic.
 */

const tmp = new THREE.Object3D();
const color = new THREE.Color();

/** Chibi proportions before WALKER_SCALE (world units). */
const HIP = 0.26;
const BODY_H = 0.3;
const HEAD = 0.34;
const STEP_HZ = 2.2;
/** Stylised, larger-than-life figures so people read at overview distance (≈ 1.4 units tall). */
const WALKER_SCALE = 1.6;

let legGeometry: THREE.BufferGeometry | null = null;
/** Leg pivots at the hip: box hangs down from y = 0. */
function getLegGeometry() {
  legGeometry ??= new THREE.BoxGeometry(1, 1, 1).translate(0, -0.5, 0);
  return legGeometry;
}

function setColors(mesh: THREE.InstancedMesh | null, colors: readonly string[]) {
  if (!mesh) return;
  colors.forEach((c, i) => mesh.setColorAt(i, color.set(c)));
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

interface CrowdProps {
  placements: readonly IslandPlacement[];
  tiles: ReadonlyMap<string, TileSpec>;
  quality: QualitySettings;
  animate: boolean;
}

function CrowdImpl({ placements, tiles, quality, animate }: CrowdProps) {
  const walkers = useMemo(
    () =>
      generateWalkers(placements, tiles, {
        perTile: quality.walkersPerTile,
        interiorPerTile: quality.interiorWalkers,
        crossingShare: quality.crossingShare,
      }).map((w) => ({ ...w, length: pathLength(w.path) })),
    [placements, tiles, quality.walkersPerTile, quality.interiorWalkers, quality.crossingShare],
  );
  const cars = useMemo(() => generateCars(placements, quality.cars).map((c) => ({ ...c, length: pathLength(c.path) })), [placements, quality.cars]);
  const stripes = useMemo(() => generateCrossings(placements).flatMap((c) => c.stripes), [placements]);
  const shadows = quality.shadows;

  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const headRef = useRef<THREE.InstancedMesh>(null);
  const hairRef = useRef<THREE.InstancedMesh>(null);
  const legRef = useRef<THREE.InstancedMesh>(null);
  const carRef = useRef<THREE.InstancedMesh>(null);
  const cabinRef = useRef<THREE.InstancedMesh>(null);
  const stripeRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    setColors(bodyRef.current, walkers.map((w) => w.shirt));
    setColors(headRef.current, walkers.map((w) => w.skin));
    setColors(hairRef.current, walkers.map((w) => w.hair));
    setColors(legRef.current, walkers.flatMap((w) => [w.pants, w.pants]));
    setColors(carRef.current, cars.map((c) => c.body));
    setColors(cabinRef.current, cars.map(() => "#cfe3f0"));
  }, [walkers, cars]);

  // Zebra stripes are static.
  useLayoutEffect(() => {
    const mesh = stripeRef.current;
    if (!mesh) return;
    stripes.forEach((s, i) => {
      tmp.position.set(s.x, 0.04, s.z);
      tmp.rotation.set(0, s.rotationY, 0);
      tmp.scale.set(1.15, 0.02, 0.2);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [stripes]);

  const place = useMemo(
    () => (t: number) => {
      const body = bodyRef.current;
      const head = headRef.current;
      const hair = hairRef.current;
      const legs = legRef.current;
      const moving = t > 0;
      walkers.forEach((w, i) => {
        const { x, z, heading } = pathPoint(w.path, travelled(w.start, w.speed, w.length, t));
        const phase = (t * STEP_HZ + w.start * 10) * Math.PI * 2;
        const swing = moving ? Math.sin(phase) * 0.55 : 0;
        const bounce = moving ? Math.abs(Math.sin(phase)) * 0.035 : 0;
        const s = w.scale * WALKER_SCALE;

        // Torso (slightly tapered), sitting on the hips.
        tmp.position.set(x, (HIP + bounce) * s, z);
        tmp.rotation.set(0, heading, 0);
        tmp.scale.set(0.24 * s, BODY_H * s, 0.18 * s);
        tmp.updateMatrix();
        body?.setMatrixAt(i, tmp.matrix);

        // Big round head + hair cap: the chibi read.
        tmp.position.set(x, (HIP + BODY_H + bounce - 0.02) * s, z);
        tmp.scale.set(HEAD * s, HEAD * s, HEAD * s);
        tmp.updateMatrix();
        head?.setMatrixAt(i, tmp.matrix);
        tmp.position.y += HEAD * s * 0.42;
        tmp.scale.set(HEAD * 1.06 * s, HEAD * 0.62 * s, HEAD * 1.06 * s);
        tmp.updateMatrix();
        hair?.setMatrixAt(i, tmp.matrix);

        // Two legs swinging in opposite phase around the hip.
        const cos = Math.cos(heading);
        const sin = Math.sin(heading);
        for (const side of [-1, 1] as const) {
          const ox = side * 0.055 * s;
          tmp.position.set(x + ox * cos, (HIP + bounce) * s, z - ox * sin);
          tmp.rotation.set(side * swing, heading, 0, "YXZ");
          tmp.scale.set(0.08 * s, HIP * s, 0.09 * s);
          tmp.updateMatrix();
          legs?.setMatrixAt(i * 2 + (side === -1 ? 0 : 1), tmp.matrix);
          tmp.rotation.order = "XYZ";
        }
      });

      const car = carRef.current;
      const cabin = cabinRef.current;
      cars.forEach((c, i) => {
        const { x, z, heading } = pathPoint(c.path, travelled(c.start, c.speed, c.length, t));
        tmp.position.set(x, 0.04, z);
        tmp.rotation.set(0, heading, 0);
        tmp.scale.set(0.42, 0.26, 0.85);
        tmp.updateMatrix();
        car?.setMatrixAt(i, tmp.matrix);
        tmp.position.y = 0.3;
        tmp.scale.set(0.36, 0.2, 0.44);
        tmp.updateMatrix();
        cabin?.setMatrixAt(i, tmp.matrix);
      });

      for (const mesh of [body, head, hair, legs, car, cabin]) {
        if (mesh) mesh.instanceMatrix.needsUpdate = true;
      }
    },
    [walkers, cars],
  );

  // Static first frame (also the frozen pose under reduced motion).
  const elapsed = useRef(0);
  useLayoutEffect(() => {
    place(elapsed.current);
    for (const mesh of [bodyRef.current, headRef.current, hairRef.current, legRef.current, carRef.current, cabinRef.current]) {
      mesh?.computeBoundingSphere();
    }
  }, [place]);

  useFrame((_, delta) => {
    if (!animate) return;
    // Own clock so pausing resumes where it stopped instead of jumping ahead.
    elapsed.current += Math.min(delta, 0.1);
    place(elapsed.current);
  });

  const n = Math.max(1, walkers.length);
  const m = Math.max(1, cars.length);
  const mat = getPropMaterial("standard");
  return (
    <group name="crowd" raycast={() => null}>
      <instancedMesh ref={stripeRef} args={[getPrimitiveGeometry("box"), getLineMaterial(), Math.max(1, stripes.length)]} raycast={() => null} dispose={null} />
      <instancedMesh ref={bodyRef} args={[getPrimitiveGeometry("frustum"), mat, n]} castShadow={shadows} frustumCulled={false} raycast={() => null} dispose={null} />
      <instancedMesh ref={headRef} args={[getPrimitiveGeometry("sphere"), mat, n]} castShadow={shadows} frustumCulled={false} raycast={() => null} dispose={null} />
      <instancedMesh ref={hairRef} args={[getPrimitiveGeometry("dome"), mat, n]} frustumCulled={false} raycast={() => null} dispose={null} />
      <instancedMesh ref={legRef} args={[getLegGeometry(), mat, n * 2]} frustumCulled={false} raycast={() => null} dispose={null} />
      <instancedMesh ref={carRef} args={[getPrimitiveGeometry("box"), mat, m]} castShadow={shadows} frustumCulled={false} raycast={() => null} dispose={null} />
      <instancedMesh ref={cabinRef} args={[getPrimitiveGeometry("box"), getPropMaterial("facade"), m]} frustumCulled={false} raycast={() => null} dispose={null} />
    </group>
  );
}

export const Crowd = memo(CrowdImpl);
