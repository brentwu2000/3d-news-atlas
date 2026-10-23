"use client";

import { Html } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { memo, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { ArtSwatches } from "@/lib/art-tokens";
import { isTap } from "@/lib/gestures";
import { buildBaseGeometry, buildOutlineGeometry, buildTerrainGeometry, getPrimitiveGeometry } from "@/lib/island-geometry";
import { groupPartsByPrimitive, type IslandSpec, type PrimitiveKey, type PrimitivePart } from "@/lib/island-generator";
import type { IslandPlacement } from "@/lib/layout";
import type { MarkerPlacement } from "@/lib/markers";
import type { QualitySettings } from "@/lib/quality";
import { hashString } from "@/lib/random";
import type { Topic } from "@/lib/schema";
import { useAtlasStore } from "@/store/atlas-store";
import { EventMarkers } from "./EventMarker";
import { getOutlineHoverMaterial, getOutlineMaterial, getPropMaterial, getTerrainMaterial } from "./materials";

interface IslandProps {
  topic: Topic;
  spec: IslandSpec;
  placement: IslandPlacement;
  quality: QualitySettings;
  swatches: ArtSwatches;
  /** Idle bob allowed (false under reduced motion or while anything is selected). */
  bob: boolean;
  reducedMotion: boolean;
  selected: boolean;
  hovered: boolean;
  markers: readonly MarkerPlacement[];
  selectedEventId: string | null;
  hoveredEventId: string | null;
}

/** POLISH-V1: amplitude <= 0.12 world units, period >= 6 s. */
export const BOB_AMPLITUDE = 0.1;
export const BOB_PERIOD_S = 8;
const BOB_SPEED = (Math.PI * 2) / BOB_PERIOD_S;
/** Bob fades in/out over roughly half a second instead of snapping. */
const BOB_EASE_PER_S = 3;
/** Above the tallest landmark (city towers ≈ 4.1 incl. antenna) and the event markers. */
const LABEL_HEIGHT = 4.8;

function IslandImpl(props: IslandProps) {
  const { topic, spec, placement, quality, swatches, bob, reducedMotion, selected, hovered, markers, selectedEventId, hoveredEventId } = props;
  const groupRef = useRef<THREE.Group>(null);
  const amplitude = useRef(bob ? BOB_AMPLITUDE : 0);
  const terrain = useMemo(() => buildTerrainGeometry(spec), [spec]);
  const base = useMemo(() => buildBaseGeometry(spec), [spec]);
  const outline = useMemo(() => buildOutlineGeometry(spec), [spec]);
  const partGroups = useMemo(() => groupPartsByPrimitive(spec.props, swatches.trunk), [spec, swatches.trunk]);
  const phase = useMemo(() => (hashString(topic.id) % 1000) / 159.15, [topic.id]);

  // Only resources this island owns are disposed; shared primitives/materials are not.
  useEffect(
    () => () => {
      terrain.dispose();
      base.dispose();
      outline.dispose();
    },
    [terrain, base, outline],
  );

  // Mutates the Object3D directly: no React state per frame.
  useFrame(({ clock }, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const target = bob ? BOB_AMPLITUDE : 0;
    amplitude.current = reducedMotion
      ? 0
      : amplitude.current + (target - amplitude.current) * Math.min(1, delta * BOB_EASE_PER_S);
    group.position.y = placement.y + Math.sin(clock.elapsedTime * BOB_SPEED + phase) * amplitude.current;
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (!isTap(e.delta)) return;
    e.stopPropagation();
    useAtlasStore.getState().selectTopic(topic.id);
  };
  const onOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    useAtlasStore.getState().hoverTopic(topic.id);
    document.body.style.cursor = "pointer";
  };
  const onOut = () => {
    if (useAtlasStore.getState().hoveredTopicId === topic.id) useAtlasStore.getState().hoverTopic(null);
    document.body.style.cursor = "";
  };

  return (
    <group
      ref={groupRef}
      position={[placement.x, placement.y, placement.z]}
      name={`island:${topic.id}`}
      userData={{ topicId: topic.id }}
      dispose={null}
    >
      <group onClick={onClick} onPointerOver={onOver} onPointerOut={onOut}>
        <mesh geometry={terrain} material={getTerrainMaterial()} receiveShadow />
        <mesh geometry={base} material={getTerrainMaterial()} castShadow={quality.shadows} />
        {partGroups.map((group) => (
          <PropInstances
            key={group.key}
            primitive={group.primitive}
            parts={group.parts}
            castShadow={quality.shadows && group.castShadow}
            receiveShadow={quality.shadows}
          />
        ))}
      </group>
      {(selected || hovered) && (
        <mesh
          geometry={outline}
          material={selected ? getOutlineMaterial(swatches.highlight) : getOutlineHoverMaterial(swatches.sandLight)}
          raycast={() => null}
          dispose={null}
        />
      )}
      <EventMarkers markers={markers} selectedEventId={selectedEventId} hoveredEventId={hoveredEventId} swatches={swatches} />
      <Html position={[0, LABEL_HEIGHT, 0]} center zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
        <div
          aria-hidden="true"
          data-selected={selected || undefined}
          className="w-max max-w-56 truncate rounded-full bg-slate-950/70 px-3 py-1 text-center text-xs font-medium text-slate-50 shadow-sm ring-1 ring-white/15 backdrop-blur-sm data-selected:bg-atlas-highlight data-selected:text-slate-950"
        >
          <span className="sm:hidden">{topic.category}</span>
          <span className="hidden sm:inline">{topic.title}</span>
        </div>
      </Html>
    </group>
  );
}

export const Island = memo(IslandImpl);

interface PropInstancesProps {
  primitive: PrimitiveKey;
  parts: PrimitivePart[];
  castShadow: boolean;
  receiveShadow: boolean;
}

const tmpObject = new THREE.Object3D();
const tmpColor = new THREE.Color();

function PropInstances({ primitive, parts, castShadow, receiveShadow }: PropInstancesProps) {
  const ref = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    parts.forEach((part, i) => {
      tmpObject.position.set(...part.position);
      tmpObject.rotation.set(0, part.rotationY, 0);
      tmpObject.scale.set(...part.scale);
      tmpObject.updateMatrix();
      mesh.setMatrixAt(i, tmpObject.matrix);
      mesh.setColorAt(i, tmpColor.set(part.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [parts]);

  return (
    <instancedMesh
      ref={ref}
      args={[getPrimitiveGeometry(primitive), getPropMaterial(), parts.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      dispose={null}
    />
  );
}
