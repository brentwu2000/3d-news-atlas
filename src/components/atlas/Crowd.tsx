"use client";

import { useFrame } from "@react-three/fiber";
import { memo, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { getPrimitiveGeometry } from "@/lib/city-geometry";
import { generateCars, generateWalkers, loopPoint, travelled, type Car, type Walker } from "@/lib/crowd";
import type { IslandPlacement } from "@/lib/layout";
import { getPropMaterial } from "./materials";

/*
 * Ambient pedestrians and traffic. Each body part is one InstancedMesh for
 * the whole city; per frame we only rewrite instance matrices (no React
 * state). With reduced motion / paused animations the crowd freezes at t = 0,
 * so frames stay deterministic.
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
  walkersPerTile: number;
  cars: number;
  animate: boolean;
  shadows: boolean;
}

function CrowdImpl({ placements, walkersPerTile, cars: carCount, animate, shadows }: CrowdProps) {
  const walkers = useMemo(() => generateWalkers(placements, walkersPerTile), [placements, walkersPerTile]);
  const cars = useMemo(() => generateCars(placements, carCount), [placements, carCount]);

  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const headRef = useRef<THREE.InstancedMesh>(null);
  const hairRef = useRef<THREE.InstancedMesh>(null);
  const legRef = useRef<THREE.InstancedMesh>(null);
  const carRef = useRef<THREE.InstancedMesh>(null);
  const cabinRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    setColors(bodyRef.current, walkers.map((w) => w.shirt));
    setColors(headRef.current, walkers.map((w) => w.skin));
    setColors(hairRef.current, walkers.map((w) => w.hair));
    setColors(legRef.current, walkers.flatMap((w) => [w.pants, w.pants]));
    setColors(carRef.current, cars.map((c) => c.body));
    setColors(cabinRef.current, cars.map(() => "#cfe3f0"));
  }, [walkers, cars]);

  const place = useMemo(
    () => (t: number) => {
      const body = bodyRef.current;
      const head = headRef.current;
      const hair = hairRef.current;
      const legs = legRef.current;
      walkers.forEach((w: Walker, i) => {
        const p = placements[w.tile];
        if (!p) return;
        const u = travelled(w.start, w.speed, w.radius, w.direction, t);
        const { x, z, heading } = loopPoint(w.radius + w.lateral, u, w.direction);
        const phase = (t * STEP_HZ + w.start * 10) * Math.PI * 2;
        const swing = animateSwing(t) ? Math.sin(phase) * 0.55 : 0;
        const bounce = animateSwing(t) ? Math.abs(Math.sin(phase)) * 0.035 : 0;
        const s = w.scale * WALKER_SCALE;
        const wx = p.x + x;
        const wz = p.z + z;

        // Torso (slightly tapered), sitting on the hips.
        tmp.position.set(wx, (HIP + bounce) * s, wz);
        tmp.rotation.set(0, heading, 0);
        tmp.scale.set(0.24 * s, BODY_H * s, 0.18 * s);
        tmp.updateMatrix();
        body?.setMatrixAt(i, tmp.matrix);

        // Big round head + hair cap: the chibi read.
        tmp.position.set(wx, (HIP + BODY_H + bounce - 0.02) * s, wz);
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
          tmp.position.set(wx + ox * cos, (HIP + bounce) * s, wz - ox * sin);
          tmp.rotation.set(side * swing, heading, 0, "YXZ");
          tmp.scale.set(0.08 * s, HIP * s, 0.09 * s);
          tmp.updateMatrix();
          legs?.setMatrixAt(i * 2 + (side === -1 ? 0 : 1), tmp.matrix);
          tmp.rotation.order = "XYZ";
        }
      });

      const car = carRef.current;
      const cabin = cabinRef.current;
      cars.forEach((c: Car, i) => {
        const p = placements[c.tile];
        if (!p) return;
        const u = travelled(c.start, c.speed, c.radius, c.direction, t);
        const { x, z, heading } = loopPoint(c.radius, u, c.direction);
        tmp.position.set(p.x + x, 0.04, p.z + z);
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
    [walkers, cars, placements],
  );

  // Static first frame (also the frozen pose under reduced motion).
  useLayoutEffect(() => {
    place(0);
    for (const mesh of [bodyRef.current, headRef.current, hairRef.current, legRef.current, carRef.current, cabinRef.current]) {
      mesh?.computeBoundingSphere();
    }
  }, [place]);

  const elapsed = useRef(0);
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
      <instancedMesh ref={bodyRef} args={[getPrimitiveGeometry("frustum"), mat, n]} castShadow={shadows} frustumCulled={false} raycast={() => null} dispose={null} />
      <instancedMesh ref={headRef} args={[getPrimitiveGeometry("sphere"), mat, n]} castShadow={shadows} frustumCulled={false} raycast={() => null} dispose={null} />
      <instancedMesh ref={hairRef} args={[getPrimitiveGeometry("dome"), mat, n]} frustumCulled={false} raycast={() => null} dispose={null} />
      <instancedMesh ref={legRef} args={[getLegGeometry(), mat, n * 2]} frustumCulled={false} raycast={() => null} dispose={null} />
      <instancedMesh ref={carRef} args={[getPrimitiveGeometry("box"), mat, m]} castShadow={shadows} frustumCulled={false} raycast={() => null} dispose={null} />
      <instancedMesh ref={cabinRef} args={[getPrimitiveGeometry("box"), getPropMaterial("facade"), m]} frustumCulled={false} raycast={() => null} dispose={null} />
    </group>
  );
}

/** Legs only swing once time is moving (frozen pose stands still). */
function animateSwing(t: number) {
  return t > 0;
}

export const Crowd = memo(CrowdImpl);
