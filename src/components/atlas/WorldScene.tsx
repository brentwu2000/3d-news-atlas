"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { deriveSwatches, readArtTokens, type ArtSwatches } from "@/lib/art-tokens";
import { CAMERA_FOV, overviewPose } from "@/lib/camera";
import { useDocumentHidden } from "@/lib/hooks";
import { generateIsland, type IslandSpec, type Vec3 } from "@/lib/island-generator";
import { computeWorldBounds, layoutIslands, type IslandPlacement, type WorldBounds } from "@/lib/layout";
import { layoutMarkers, type MarkerPlacement } from "@/lib/markers";
import { filterEvents, type AtlasData } from "@/lib/normalize";
import { generateParticlePositions } from "@/lib/particles";
import type { QualitySettings } from "@/lib/quality";
import { useAtlasStore } from "@/store/atlas-store";
import { CameraDirector } from "./CameraDirector";
import { DebugBridge } from "./DebugBridge";
import { Island } from "./Island";
import { getParticleMaterial } from "./materials";
import { PerfProbe } from "./PerfProbe";
import { RelationArc } from "./RelationArc";

export interface WorldSceneProps {
  data: AtlasData;
  quality: QualitySettings;
  reducedMotion: boolean;
  debug?: boolean;
  /** Width in CSS px of the desktop detail drawer covering the canvas (0 when closed). */
  occludedRightPx: number;
  desktop: boolean;
  onReady: () => void;
  onContextLost: () => void;
}

export interface WorldModel {
  placements: IslandPlacement[];
  bounds: WorldBounds;
  specs: Map<string, IslandSpec>;
  /** Marker layout per topic over the topic's *full* event list (stable under filtering). */
  markers: Map<string, MarkerPlacement[]>;
  /** World-space marker head positions at rest (no bob). */
  markerWorld: Map<string, Vec3>;
}

export function buildWorldModel(data: AtlasData, quality: QualitySettings): WorldModel {
  const placements = layoutIslands(data.topics);
  const bounds = computeWorldBounds(placements);
  const specs = new Map<string, IslandSpec>();
  const markers = new Map<string, MarkerPlacement[]>();
  const markerWorld = new Map<string, Vec3>();
  data.topics.forEach((topic, i) => {
    const spec = generateIsland({ seed: topic.seed, preset: topic.theme, density: quality.propDensity, segments: quality.terrainSegments });
    specs.set(topic.id, spec);
    const list = layoutMarkers(spec, (data.eventsByTopic.get(topic.id) ?? []).map((e) => e.id));
    markers.set(topic.id, list);
    const p = placements[i];
    if (p) for (const m of list) markerWorld.set(m.eventId, [p.x + m.head[0], p.y + m.head[1], p.z + m.head[2]]);
  });
  return { placements, bounds, specs, markers, markerWorld };
}

export default function WorldScene({ data, quality, reducedMotion, debug = false, occludedRightPx, desktop, onReady, onContextLost }: WorldSceneProps) {
  const hidden = useDocumentHidden();
  const world = useMemo(() => buildWorldModel(data, quality), [data, quality]);
  const initialPose = useMemo(() => overviewPose(world.bounds, 16 / 9), [world.bounds]);
  // Palette comes from CSS custom properties so it can be re-themed without code changes.
  const swatches = useMemo(() => deriveSwatches(readArtTokens()), []);

  const filters = useAtlasStore((s) => s.filters);
  const selectedTopicId = useAtlasStore((s) => s.selectedTopicId);
  const selectedEventId = useAtlasStore((s) => s.selectedEventId);
  const hoveredTopicId = useAtlasStore((s) => s.hoveredTopicId);
  const hoveredEventId = useAtlasStore((s) => s.hoveredEventId);

  // Same pure filter as the list and timeline → markers always match the list.
  const visibleIds = useMemo(() => new Set(filterEvents(data, filters).map((e) => e.id)), [data, filters]);
  const visibleMarkers = useMemo(() => {
    const out = new Map<string, MarkerPlacement[]>();
    for (const [topicId, list] of world.markers) out.set(topicId, list.filter((m) => visibleIds.has(m.eventId)));
    return out;
  }, [world.markers, visibleIds]);

  const arcs = useMemo(() => {
    if (!selectedEventId) return [];
    return (data.relationsByEvent.get(selectedEventId) ?? []).flatMap((relation) => {
      if (!visibleIds.has(relation.fromEventId) || !visibleIds.has(relation.toEventId)) return [];
      const from = world.markerWorld.get(relation.fromEventId);
      const to = world.markerWorld.get(relation.toEventId);
      return from && to ? [{ relation, from, to }] : [];
    });
  }, [data, selectedEventId, visibleIds, world.markerWorld]);

  // Islands stop bobbing while anything is selected so focus, picking and arcs stay stable.
  const bob = !reducedMotion && !selectedTopicId;
  const animate = !reducedMotion;
  // Hidden tab: stop rendering entirely. Reduced motion: render on demand only.
  const frameloop = hidden ? "never" : animate ? "always" : "demand";

  return (
    <Canvas
      frameloop={frameloop}
      dpr={quality.dpr}
      // three r186 removed PCFSoftShadowMap; PCF + shadow.radius gives the soft edge.
      shadows={quality.shadows ? "percentage" : false}
      gl={{ antialias: quality.antialias, alpha: true, powerPreference: "high-performance" }}
      camera={{ fov: CAMERA_FOV, near: 0.5, far: world.bounds.radius * 14, position: initialPose.position }}
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
      <fog attach="fog" args={[swatches.fog, world.bounds.radius * 2.6, world.bounds.radius * 7.5]} />
      <Lights bounds={world.bounds} quality={quality} swatches={swatches} />
      {data.topics.map((topic, i) => {
        const placement = world.placements[i];
        const spec = world.specs.get(topic.id);
        if (!placement || !spec) return null;
        return (
          <Island
            key={topic.id}
            topic={topic}
            spec={spec}
            placement={placement}
            quality={quality}
            swatches={swatches}
            bob={bob}
            reducedMotion={reducedMotion}
            selected={selectedTopicId === topic.id}
            hovered={hoveredTopicId === topic.id}
            markers={visibleMarkers.get(topic.id) ?? EMPTY_MARKERS}
            selectedEventId={selectedEventId}
            hoveredEventId={hoveredEventId}
          />
        );
      })}
      {arcs.map(({ relation, from, to }) => (
        <RelationArc key={relation.id} from={from} to={to} type={relation.type} color={swatches.highlight} />
      ))}
      <Dust bounds={world.bounds} count={quality.particles} color={swatches.highlight} animate={animate} />
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

const EMPTY_MARKERS: MarkerPlacement[] = [];

function Lights({ bounds, quality, swatches }: { bounds: WorldBounds; quality: QualitySettings; swatches: ArtSwatches }) {
  const r = bounds.radius;
  const [cx, , cz] = bounds.center;
  return (
    <>
      {/* Fill: cool sky, warm-dark ground bounce. */}
      <hemisphereLight args={[swatches.skyLight, swatches.groundLight, 1.6]} />
      {/* Warm key from upper front-left; the only shadow caster. */}
      <directionalLight
        position={[cx + r * 0.7, r * 1.25, cz + r * 0.35]}
        intensity={3.0}
        color={swatches.keyLight}
        castShadow={quality.shadows}
        shadow-mapSize={[quality.shadowMapSize, quality.shadowMapSize]}
        shadow-camera-left={-r * 1.1}
        shadow-camera-right={r * 1.1}
        shadow-camera-top={r * 1.1}
        shadow-camera-bottom={-r * 1.1}
        shadow-camera-near={1}
        shadow-camera-far={r * 4}
        shadow-radius={3}
        shadow-bias={-0.0005}
        shadow-normalBias={0.04}
      />
      {/* Subtle cool rim from behind to separate silhouettes from the navy backdrop. */}
      {quality.rimLight && <directionalLight position={[cx - r * 0.8, r * 0.5, cz - r * 1.1]} intensity={1.2} color={swatches.rimLight} />}
    </>
  );
}

const DUST_DRIFT_RAD_PER_S = 0.006;
const DUST_SWAY = 0.35;

function Dust({ bounds, count, color, animate }: { bounds: WorldBounds; count: number; color: string; animate: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(generateParticlePositions(bounds, count), 3));
    g.computeBoundingSphere();
    return g;
  }, [bounds, count]);
  const material = useMemo(() => getParticleMaterial(color), [color]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  // Whole-field drift: one matrix update per frame, no per-particle CPU work.
  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group || !animate) return;
    group.rotation.y = clock.elapsedTime * DUST_DRIFT_RAD_PER_S;
    group.position.y = Math.sin(clock.elapsedTime * 0.25) * DUST_SWAY;
  });

  if (count <= 0) return null;
  return (
    <group ref={groupRef} raycast={() => null}>
      <points geometry={geometry} material={material} raycast={() => null} dispose={null} />
    </group>
  );
}
