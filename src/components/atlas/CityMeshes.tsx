"use client";

import type { ThreeEvent } from "@react-three/fiber";
import { memo, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { buildHexRingGeometry, buildKerbGeometry, buildRoadGeometry, buildSlabGeometry, getPrimitiveGeometry, lampPositions, roadDashes } from "@/lib/city-geometry";
import { isTap } from "@/lib/gestures";
import { ROAD_INNER } from "@/lib/city-geometry";
import type { PartGroup } from "@/lib/tile-generator";
import type { TimePreset } from "@/lib/time-of-day";
import { PALETTE } from "@/lib/palette";
import type { QualitySettings } from "@/lib/quality";
import { useAtlasStore } from "@/store/atlas-store";
import {
  getKerbMaterial,
  getLampMaterial,
  getLineMaterial,
  getPoleMaterial,
  getPropMaterial,
  getRoadMaterial,
  getSlabMaterial,
} from "./materials";
import type { WorldModel } from "./WorldScene";

const tmp = new THREE.Object3D();
tmp.rotation.order = "YXZ";
const tmpColor = new THREE.Color();
const tint = new THREE.Color();

/** Resolve the tile index of an instanced hit (owners stored in userData). */
function ownerOf(e: ThreeEvent<PointerEvent | MouseEvent>): number | undefined {
  const owners = e.object.userData.owners as number[] | undefined;
  return e.instanceId === undefined || !owners ? undefined : owners[e.instanceId];
}

interface CityMeshesProps {
  world: WorldModel;
  quality: QualitySettings;
  preset: TimePreset;
}

/**
 * All tiles of the city in a constant number of draw calls: one instanced
 * mesh per shared geometry (slab, inner ground, road, kerb, dashes, lamps)
 * plus one per prop primitive/material group.
 */
function CityMeshesImpl({ world, quality, preset }: CityMeshesProps) {
  const n = world.placements.length;
  const slab = useMemo(() => buildSlabGeometry(), []);
  const inner = useMemo(() => buildHexRingGeometry(0, ROAD_INNER - 0.02, 0.03), []);
  const road = useMemo(() => buildRoadGeometry(), []);
  const kerb = useMemo(() => buildKerbGeometry(), []);
  useEffect(
    () => () => {
      for (const g of [slab, inner, road, kerb]) g.dispose();
    },
    [slab, inner, road, kerb],
  );

  const tileOwners = useMemo(() => world.placements.map((_, i) => i), [world.placements]);
  const dashes = useMemo(() => {
    const local = roadDashes();
    return world.placements.flatMap((p, i) => local.map((d) => ({ ...d, x: d.x + p.x, z: d.z + p.z, owner: i })));
  }, [world.placements]);
  const lamps = useMemo(() => {
    const local = lampPositions();
    return world.placements.flatMap((p, i) => local.map((l) => ({ ...l, x: l.x + p.x, z: l.z + p.z, owner: i })));
  }, [world.placements]);

  const slabRef = useRef<THREE.InstancedMesh>(null);
  const innerRef = useRef<THREE.InstancedMesh>(null);
  const roadRef = useRef<THREE.InstancedMesh>(null);
  const kerbRef = useRef<THREE.InstancedMesh>(null);
  const dashRef = useRef<THREE.InstancedMesh>(null);
  const poleRef = useRef<THREE.InstancedMesh>(null);
  const lampRef = useRef<THREE.InstancedMesh>(null);

  // Tile transforms (translation only).
  useLayoutEffect(() => {
    world.placements.forEach((p, i) => {
      tmp.position.set(p.x, 0, p.z);
      tmp.rotation.set(0, 0, 0);
      tmp.scale.set(1, 1, 1);
      tmp.updateMatrix();
      for (const ref of [slabRef, innerRef, roadRef, kerbRef]) ref.current?.setMatrixAt(i, tmp.matrix);
    });
    for (const ref of [slabRef, innerRef, roadRef, kerbRef]) {
      const mesh = ref.current;
      if (!mesh) continue;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.userData.owners = tileOwners;
    }
    dashes.forEach((d, i) => {
      tmp.position.set(d.x, 0.035, d.z);
      tmp.rotation.set(0, d.rotationY, 0);
      tmp.scale.set(0.55, 0.02, 0.09);
      tmp.updateMatrix();
      dashRef.current?.setMatrixAt(i, tmp.matrix);
    });
    lamps.forEach((l, i) => {
      tmp.position.set(l.x, 0.05, l.z);
      tmp.rotation.set(0, 0, 0);
      tmp.scale.set(0.07, 1.25, 0.07);
      tmp.updateMatrix();
      poleRef.current?.setMatrixAt(i, tmp.matrix);
      tmp.position.set(l.x, 1.25, l.z);
      tmp.scale.set(0.24, 0.24, 0.24);
      tmp.updateMatrix();
      lampRef.current?.setMatrixAt(i, tmp.matrix);
    });
    for (const ref of [dashRef, poleRef, lampRef]) {
      const mesh = ref.current;
      if (!mesh) continue;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, [world.placements, tileOwners, dashes, lamps]);

  // Per-tile colours, re-tinted for the time of day.
  useLayoutEffect(() => {
    tint.set(preset.tileTint);
    world.placements.forEach((p, i) => {
      slabRef.current?.setColorAt(i, tmpColor.set(PALETTE.tile).multiply(tint));
      innerRef.current?.setColorAt(i, tmpColor.set(world.tiles.get(p.topicId)?.ground ?? PALETTE.plaza).multiply(tint));
    });
    for (const ref of [slabRef, innerRef]) {
      const mesh = ref.current;
      if (mesh?.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }, [world, preset.tileTint]);

  const pick = {
    onClick: (e: ThreeEvent<MouseEvent>) => {
      if (!isTap(e.delta)) return;
      const owner = ownerOf(e);
      const placement = owner === undefined ? undefined : world.placements[owner];
      if (!placement) return;
      e.stopPropagation();
      useAtlasStore.getState().selectTopic(placement.topicId);
    },
    onPointerMove: (e: ThreeEvent<PointerEvent>) => {
      const owner = ownerOf(e);
      const placement = owner === undefined ? undefined : world.placements[owner];
      if (!placement) return;
      e.stopPropagation();
      useAtlasStore.getState().hoverTopic(placement.topicId);
      document.body.style.cursor = "pointer";
    },
    onPointerOut: () => {
      useAtlasStore.getState().hoverTopic(null);
      document.body.style.cursor = "";
    },
  };

  const shadows = quality.shadows;
  return (
    <group name="city">
      <group {...pick}>
        <instancedMesh ref={slabRef} args={[slab, getSlabMaterial(), n]} receiveShadow={shadows} castShadow={shadows} dispose={null} />
        <instancedMesh ref={innerRef} args={[inner, getPropMaterial("standard"), n]} receiveShadow={shadows} dispose={null} />
        <instancedMesh ref={roadRef} args={[road, getRoadMaterial(), n]} receiveShadow={shadows} dispose={null} />
        <instancedMesh ref={kerbRef} args={[kerb, getKerbMaterial(), n]} receiveShadow={shadows} dispose={null} />
        {world.groups.map((group) => (
          <PropGroup key={group.key} group={group} castShadow={shadows && group.castShadow} receiveShadow={shadows} />
        ))}
      </group>
      <instancedMesh ref={dashRef} args={[getPrimitiveGeometry("box"), getLineMaterial(), dashes.length]} raycast={() => null} dispose={null} />
      <instancedMesh ref={poleRef} args={[getPrimitiveGeometry("cylinder"), getPoleMaterial(), lamps.length]} raycast={() => null} dispose={null} />
      <instancedMesh ref={lampRef} args={[getPrimitiveGeometry("sphere"), getLampMaterial(), lamps.length]} raycast={() => null} dispose={null} />
    </group>
  );
}

export const CityMeshes = memo(CityMeshesImpl);

function PropGroup({ group, castShadow, receiveShadow }: { group: PartGroup; castShadow: boolean; receiveShadow: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    group.parts.forEach((part, i) => {
      tmp.position.set(...part.position);
      tmp.rotation.set(...part.rotation);
      tmp.scale.set(...part.scale);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
      mesh.setColorAt(i, tmpColor.set(part.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.userData.owners = group.owners;
  }, [group]);

  return (
    <instancedMesh
      ref={ref}
      args={[getPrimitiveGeometry(group.primitive), getPropMaterial(group.material), group.parts.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      dispose={null}
    />
  );
}
