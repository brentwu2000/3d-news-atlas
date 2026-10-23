"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { CAMERA_FOV, overviewPose } from "@/lib/camera";
import { useDocumentHidden } from "@/lib/hooks";
import { computeWorldBounds, layoutIslands, type IslandPlacement, type WorldBounds } from "@/lib/layout";
import { layoutMarkers, type MarkerPlacement } from "@/lib/markers";
import { filterEvents, type AtlasData } from "@/lib/normalize";
import { generateParticlePositions } from "@/lib/particles";
import type { QualitySettings } from "@/lib/quality";
import { generateTile, expandProp, groupParts, placeParts, type PartGroup, type TileSpec, type Vec3 } from "@/lib/tile-generator";
import { TIME_PRESETS, type TimePreset } from "@/lib/time-of-day";
import { useAtlasStore } from "@/store/atlas-store";
import { CameraDirector } from "./CameraDirector";
import { CityMeshes } from "./CityMeshes";
import { DebugBridge } from "./DebugBridge";
import { Beacons, type BeaconInstance } from "./EventMarker";
import { getParticleMaterial, setGlow } from "./materials";
import { PerfProbe } from "./PerfProbe";
import { RelationArc } from "./RelationArc";
import { Surroundings } from "./Surroundings";
import { TileLabels, TileOutlines } from "./TileOverlays";

export interface WorldSceneProps {
  data: AtlasData;
  quality: QualitySettings;
  reducedMotion: boolean;
  debug?: boolean;
  /** Width in CSS px of the desktop detail card covering the canvas (0 when closed). */
  occludedRightPx: number;
  desktop: boolean;
  onReady: () => void;
  onContextLost: () => void;
}

export interface WorldModel {
  placements: IslandPlacement[];
  bounds: WorldBounds;
  tiles: Map<string, TileSpec>;
  /** World-space prop parts of every tile, grouped for instancing. */
  groups: PartGroup[];
  /** Beacon layout per topic over the topic's *full* event list (stable under filtering). */
  markers: Map<string, MarkerPlacement[]>;
  /** World-space beacon pick positions. */
  markerWorld: Map<string, Vec3>;
  smoke: Vec3[];
}

export function buildWorldModel(data: AtlasData, quality: QualitySettings): WorldModel {
  const placements = layoutIslands(data.topics);
  const bounds = computeWorldBounds(placements);
  const tiles = new Map<string, TileSpec>();
  const markers = new Map<string, MarkerPlacement[]>();
  const markerWorld = new Map<string, Vec3>();
  const smoke: Vec3[] = [];
  const owned: { parts: ReturnType<typeof expandProp>; owner: number }[] = [];
  data.topics.forEach((topic, i) => {
    const p = placements[i];
    if (!p) return;
    const spec = generateTile({ seed: topic.seed, preset: topic.theme, density: quality.propDensity });
    tiles.set(topic.id, spec);
    owned.push({ parts: placeParts(spec.props.flatMap(expandProp), p.x, p.z), owner: i });
    for (const s of spec.smoke) smoke.push([s[0] + p.x, s[1], s[2] + p.z]);
    const list = layoutMarkers(spec, (data.eventsByTopic.get(topic.id) ?? []).map((e) => e.id));
    markers.set(topic.id, list);
    for (const m of list) markerWorld.set(m.eventId, [p.x + m.head[0], m.head[1], p.z + m.head[2]]);
  });
  return { placements, bounds, tiles, groups: groupParts(owned), markers, markerWorld, smoke };
}

export default function WorldScene({ data, quality, reducedMotion, debug = false, occludedRightPx, desktop, onReady, onContextLost }: WorldSceneProps) {
  const hidden = useDocumentHidden();
  const world = useMemo(() => buildWorldModel(data, quality), [data, quality]);
  const initialPose = useMemo(() => overviewPose(world.bounds, 16 / 9), [world.bounds]);

  const filters = useAtlasStore((s) => s.filters);
  const selectedTopicId = useAtlasStore((s) => s.selectedTopicId);
  const selectedEventId = useAtlasStore((s) => s.selectedEventId);
  const hoveredTopicId = useAtlasStore((s) => s.hoveredTopicId);
  const hoveredEventId = useAtlasStore((s) => s.hoveredEventId);
  const timeOfDay = useAtlasStore((s) => s.timeOfDay);
  const showAllRelations = useAtlasStore((s) => s.showAllRelations);
  const paused = useAtlasStore((s) => s.animationsPaused);
  const preset = TIME_PRESETS[timeOfDay];

  useEffect(() => setGlow(preset.glow), [preset.glow]);

  // Same pure filter as the list and timeline → beacons always match the list.
  const visibleIds = useMemo(() => new Set(filterEvents(data, filters).map((e) => e.id)), [data, filters]);
  const beacons = useMemo<BeaconInstance[]>(
    () =>
      [...world.markerWorld]
        .filter(([id]) => visibleIds.has(id))
        .map(([eventId, head]) => ({ eventId, head })),
    [world.markerWorld, visibleIds],
  );

  const arcs = useMemo(() => {
    const relations = showAllRelations ? data.relations : selectedEventId ? (data.relationsByEvent.get(selectedEventId) ?? []) : [];
    return relations.flatMap((relation) => {
      if (!visibleIds.has(relation.fromEventId) || !visibleIds.has(relation.toEventId)) return [];
      const from = world.markerWorld.get(relation.fromEventId);
      const to = world.markerWorld.get(relation.toEventId);
      return from && to ? [{ relation, from, to }] : [];
    });
  }, [data, selectedEventId, showAllRelations, visibleIds, world.markerWorld]);

  const animate = !reducedMotion && !paused;
  // Hidden tab: stop rendering entirely. Static scene: render on demand only.
  const frameloop = hidden ? "never" : animate ? "always" : "demand";

  return (
    <Canvas
      frameloop={frameloop}
      dpr={quality.dpr}
      // three r186 removed PCFSoftShadowMap; PCF + shadow.radius gives the soft edge.
      shadows={quality.shadows ? "percentage" : false}
      gl={{ antialias: quality.antialias, powerPreference: "high-performance" }}
      camera={{ fov: CAMERA_FOV, near: 1, far: world.bounds.radius * 12, position: initialPose.position }}
      onPointerMissed={() => {
        document.body.style.cursor = "";
      }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener("webglcontextlost", (event) => {
          event.preventDefault();
          onContextLost();
        });
        onReady();
      }}
    >
      <color attach="background" args={[preset.sky]} />
      <fog attach="fog" args={[preset.sky, world.bounds.radius * 2.6, world.bounds.radius * 7]} />
      <Lights bounds={world.bounds} quality={quality} preset={preset} />
      <CityMeshes world={world} quality={quality} preset={preset} />
      <TileOutlines placements={world.placements} selectedTopicId={selectedTopicId} hoveredTopicId={hoveredTopicId} />
      <TileLabels topics={data.topics} placements={world.placements} selectedTopicId={selectedTopicId} />
      <Beacons beacons={beacons} selectedEventId={selectedEventId} hoveredEventId={hoveredEventId} animate={animate} />
      {arcs.map(({ relation, from, to }) => (
        <RelationArc key={relation.id} from={from} to={to} type={relation.type} labelled={!showAllRelations || relation.fromEventId === selectedEventId || relation.toEventId === selectedEventId} />
      ))}
      <Surroundings bounds={world.bounds} quality={quality} preset={preset} animate={animate} smoke={world.smoke} />
      <Dust bounds={world.bounds} count={quality.particles} animate={animate} />
      <CameraDirector
        bounds={world.bounds}
        placements={world.placements}
        reducedMotion={reducedMotion}
        occludedRightPx={occludedRightPx}
        desktop={desktop}
      />
      {debug && <PerfProbe />}
      {debug && <DebugBridge world={world} visibleIds={visibleIds} />}
    </Canvas>
  );
}

function Lights({ bounds, quality, preset }: { bounds: WorldBounds; quality: QualitySettings; preset: TimePreset }) {
  const r = bounds.radius;
  const [cx, , cz] = bounds.center;
  const [dx, dy, dz] = preset.keyDirection;
  const len = Math.hypot(dx, dy, dz) || 1;
  const dist = r * 1.6;
  return (
    <>
      <hemisphereLight args={[preset.hemiSky, preset.hemiGround, preset.hemiIntensity]} />
      {/* Key light: the only shadow caster. */}
      <directionalLight
        position={[cx + (dx / len) * dist, (dy / len) * dist, cz + (dz / len) * dist]}
        intensity={preset.keyIntensity}
        color={preset.keyColor}
        castShadow={quality.shadows}
        shadow-mapSize={[quality.shadowMapSize, quality.shadowMapSize]}
        shadow-camera-left={-r}
        shadow-camera-right={r}
        shadow-camera-top={r}
        shadow-camera-bottom={-r}
        shadow-camera-near={1}
        shadow-camera-far={r * 4}
        shadow-radius={3}
        shadow-bias={-0.0004}
        shadow-normalBias={0.05}
      />
    </>
  );
}

const DUST_DRIFT_RAD_PER_S = 0.01;

/** Fireflies at night, specks by day; positions are seeded. */
function Dust({ bounds, count, animate }: { bounds: WorldBounds; count: number; animate: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const positions = generateParticlePositions(bounds, count).map((v, i) => (i % 3 === 1 ? Math.abs(v) * 0.5 + 0.5 : v));
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.computeBoundingSphere();
    return g;
  }, [bounds, count]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group || !animate) return;
    group.rotation.y = clock.elapsedTime * DUST_DRIFT_RAD_PER_S;
    group.position.y = Math.sin(clock.elapsedTime * 0.4) * 0.25;
  });

  if (count <= 0) return null;
  return (
    <group ref={groupRef} position={[0, 0, 0]} raycast={() => null}>
      <points geometry={geometry} material={getParticleMaterial()} raycast={() => null} dispose={null} />
    </group>
  );
}
