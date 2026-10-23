"use client";

import { useFrame } from "@react-three/fiber";
import { memo, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { getPrimitiveGeometry } from "@/lib/city-geometry";
import { generateHills, generateTrees, railRadius, RAIL_HEIGHT } from "@/lib/environment";
import type { WorldBounds } from "@/lib/layout";
import { PALETTE } from "@/lib/palette";
import type { QualitySettings } from "@/lib/quality";
import type { TimePreset } from "@/lib/time-of-day";
import type { Vec3 } from "@/lib/tile-generator";
import { getFoliageMaterial, getGroundMaterial, getPoleMaterial, getPropMaterial, getSmokeMaterial } from "./materials";

const tmp = new THREE.Object3D();
const tmpColor = new THREE.Color();

interface SurroundingsProps {
  bounds: WorldBounds;
  quality: QualitySettings;
  preset: TimePreset;
  animate: boolean;
  smoke: readonly Vec3[];
}

/** Ground plane, forest, hills, elevated rail loop with a train, chimney smoke. */
function SurroundingsImpl({ bounds, quality, preset, animate, smoke }: SurroundingsProps) {
  const groundMaterial = getGroundMaterial();
  useLayoutEffect(() => {
    (groundMaterial as THREE.MeshStandardMaterial).color.set(preset.ground);
  }, [groundMaterial, preset.ground]);

  return (
    <group name="surroundings" raycast={() => null}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[bounds.center[0], -0.62, bounds.center[2]]} receiveShadow={quality.shadows} material={groundMaterial} raycast={() => null}>
        <circleGeometry args={[bounds.radius * 7, 48]} />
      </mesh>
      {/* Forest sits outside the shadow camera; casting would only cost a second pass. */}
      <Forest bounds={bounds} count={quality.level === "high" ? 150 : 70} shadows={false} />
      <Hills bounds={bounds} />
      <Railway bounds={bounds} animate={animate} />
      {smoke.length > 0 && <Smoke emitters={smoke} animate={animate} />}
    </group>
  );
}

export const Surroundings = memo(SurroundingsImpl);

function Forest({ bounds, count, shadows }: { bounds: WorldBounds; count: number; shadows: boolean }) {
  const trees = useMemo(() => generateTrees(bounds, count), [bounds, count]);
  const pines = useMemo(() => trees.filter((t) => t.kind === "pine"), [trees]);
  const rounds = useMemo(() => trees.filter((t) => t.kind === "round"), [trees]);
  const pineRef = useRef<THREE.InstancedMesh>(null);
  const roundRef = useRef<THREE.InstancedMesh>(null);
  const trunkRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    pines.forEach((t, i) => {
      tmp.position.set(t.position[0], -0.6 + 0.4 * t.scale, t.position[2]);
      tmp.rotation.set(0, i, 0);
      tmp.scale.set(1.3 * t.scale, 2.6 * t.scale, 1.3 * t.scale);
      tmp.updateMatrix();
      pineRef.current?.setMatrixAt(i, tmp.matrix);
      pineRef.current?.setColorAt(i, tmpColor.set(i % 3 ? PALETTE.treeDark : PALETTE.tree));
    });
    rounds.forEach((t, i) => {
      tmp.position.set(t.position[0], -0.6 + 0.6 * t.scale, t.position[2]);
      tmp.rotation.set(0, i, 0);
      tmp.scale.set(1.4 * t.scale, 1.3 * t.scale, 1.4 * t.scale);
      tmp.updateMatrix();
      roundRef.current?.setMatrixAt(i, tmp.matrix);
      roundRef.current?.setColorAt(i, tmpColor.set(i % 2 ? PALETTE.treeLight : PALETTE.tree));
    });
    trees.forEach((t, i) => {
      tmp.position.set(t.position[0], -0.6, t.position[2]);
      tmp.rotation.set(0, 0, 0);
      tmp.scale.set(0.22 * t.scale, 0.7 * t.scale, 0.22 * t.scale);
      tmp.updateMatrix();
      trunkRef.current?.setMatrixAt(i, tmp.matrix);
      trunkRef.current?.setColorAt(i, tmpColor.set(PALETTE.trunk));
    });
    for (const mesh of [pineRef.current, roundRef.current, trunkRef.current]) {
      if (!mesh) continue;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, [pines, rounds, trees]);

  return (
    <>
      <instancedMesh ref={pineRef} args={[getPrimitiveGeometry("cone"), getFoliageMaterial(), Math.max(1, pines.length)]} castShadow={shadows} raycast={() => null} dispose={null} />
      <instancedMesh ref={roundRef} args={[getPrimitiveGeometry("blob"), getFoliageMaterial(), Math.max(1, rounds.length)]} castShadow={shadows} raycast={() => null} dispose={null} />
      <instancedMesh ref={trunkRef} args={[getPrimitiveGeometry("cylinder"), getFoliageMaterial(), Math.max(1, trees.length)]} raycast={() => null} dispose={null} />
    </>
  );
}

function Hills({ bounds }: { bounds: WorldBounds }) {
  const hills = useMemo(() => generateHills(bounds, 7), [bounds]);
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    hills.forEach((h, i) => {
      tmp.position.set(h.position[0], -0.6, h.position[2]);
      tmp.rotation.set(0, h.rotationY, 0);
      tmp.scale.set(h.radius * 2, h.height, h.radius * 1.6);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
      mesh.setColorAt(i, tmpColor.set(PALETTE.hill));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [hills]);
  return <instancedMesh ref={ref} args={[getPrimitiveGeometry("rock"), getFoliageMaterial(), hills.length]} raycast={() => null} dispose={null} />;
}

const TRAIN_CARS = 7;
const CAR_SPACING_RAD = 0.034;
const TRAIN_SPEED_RAD_PER_S = 0.05;

function Railway({ bounds, animate }: { bounds: WorldBounds; animate: boolean }) {
  const r = railRadius(bounds);
  const deck = useMemo(() => new THREE.TorusGeometry(r, 0.45, 3, 128).rotateX(Math.PI / 2), [r]);
  useEffect(() => () => deck.dispose(), [deck]);
  const pillarRef = useRef<THREE.InstancedMesh>(null);
  const carsRef = useRef<THREE.InstancedMesh>(null);
  const stripeRef = useRef<THREE.InstancedMesh>(null);
  const trainRef = useRef<THREE.Group>(null);
  const pillars = 48;

  useLayoutEffect(() => {
    for (let i = 0; i < pillars; i++) {
      const a = (i / pillars) * Math.PI * 2;
      tmp.position.set(bounds.center[0] + Math.cos(a) * r, -0.6, bounds.center[2] + Math.sin(a) * r);
      tmp.rotation.set(0, 0, 0);
      tmp.scale.set(0.35, RAIL_HEIGHT + 0.6, 0.35);
      tmp.updateMatrix();
      pillarRef.current?.setMatrixAt(i, tmp.matrix);
    }
    for (let i = 0; i < TRAIN_CARS; i++) {
      const a = i * CAR_SPACING_RAD;
      tmp.position.set(Math.cos(a) * r, RAIL_HEIGHT + 0.12, Math.sin(a) * r);
      tmp.rotation.set(0, -a, 0);
      tmp.scale.set(0.9, 0.85, r * CAR_SPACING_RAD * 0.92);
      tmp.updateMatrix();
      carsRef.current?.setMatrixAt(i, tmp.matrix);
      carsRef.current?.setColorAt(i, tmpColor.set(PALETTE.train));
      tmp.position.y = RAIL_HEIGHT + 0.42;
      tmp.scale.set(0.92, 0.16, r * CAR_SPACING_RAD * 0.93);
      tmp.updateMatrix();
      stripeRef.current?.setMatrixAt(i, tmp.matrix);
      stripeRef.current?.setColorAt(i, tmpColor.set(PALETTE.trainStripe));
    }
    for (const mesh of [pillarRef.current, carsRef.current, stripeRef.current]) {
      if (!mesh) continue;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, [bounds, r]);

  // The whole train rotates around the city centre: one matrix update per frame.
  useFrame((_, delta) => {
    if (animate && trainRef.current) trainRef.current.rotation.y -= delta * TRAIN_SPEED_RAD_PER_S;
  });

  return (
    <group>
      <mesh geometry={deck} position={[bounds.center[0], RAIL_HEIGHT, bounds.center[2]]} material={getPoleMaterial()} raycast={() => null} />
      <instancedMesh ref={pillarRef} args={[getPrimitiveGeometry("box"), getPoleMaterial(), pillars]} raycast={() => null} dispose={null} />
      <group ref={trainRef} position={[bounds.center[0], 0, bounds.center[2]]}>
        <instancedMesh ref={carsRef} args={[getPrimitiveGeometry("box"), getPropMaterial("facade"), TRAIN_CARS]} raycast={() => null} dispose={null} />
        <instancedMesh ref={stripeRef} args={[getPrimitiveGeometry("box"), getPropMaterial("standard"), TRAIN_CARS]} raycast={() => null} dispose={null} />
      </group>
    </group>
  );
}

const PUFFS = 6;

function Smoke({ emitters, animate }: { emitters: readonly Vec3[]; animate: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const count = emitters.length * PUFFS;

  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = animate ? clock.elapsedTime : 0;
    emitters.forEach((e, ei) => {
      for (let k = 0; k < PUFFS; k++) {
        const phase = (t * 0.18 + k / PUFFS + ei * 0.37) % 1;
        const s = 0.35 + phase * 1.1;
        tmp.position.set(e[0] + phase * 0.8, e[1] + phase * 3.2, e[2] - phase * 0.3);
        tmp.rotation.set(0, k, 0);
        tmp.scale.setScalar(s * (1 - phase * 0.35));
        tmp.updateMatrix();
        mesh.setMatrixAt(ei * PUFFS + k, tmp.matrix);
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={ref} args={[getPrimitiveGeometry("blob"), getSmokeMaterial(), count]} frustumCulled={false} raycast={() => null} dispose={null} />;
}
