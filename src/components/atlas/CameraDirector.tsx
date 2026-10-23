"use client";

import { OrbitControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import gsap from "gsap";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import {
  clampTargetDelta,
  FOCUS_WIDTH_DESKTOP,
  FOCUS_WIDTH_MOBILE,
  focusPose,
  isPoseSafe,
  orbitLimits,
  overviewPose,
  type CameraPose,
} from "@/lib/camera";
import type { IslandPlacement, WorldBounds } from "@/lib/layout";
import { useAtlasStore, type CameraMode } from "@/store/atlas-store";

interface CameraDirectorProps {
  bounds: WorldBounds;
  placements: readonly IslandPlacement[];
  reducedMotion: boolean;
  /** Width in CSS px of a drawer covering the right edge of the canvas (0 = none). */
  occludedRightPx: number;
  /** Desktop framing (island ≈ 45% of width) vs. mobile (≈ 40%). */
  desktop: boolean;
}

/** POLISH-V1: 0.9–1.3 s, power2.inOut. */
export const FLY_DURATION = 1.1;

/**
 * Sole owner of the camera pose and OrbitControls target.
 *
 * States: overview → focusing → focused → returning → overview.
 * Every programmatic move goes through `flyTo`, which kills the previous
 * tween and starts from the *current* pose, so rapid selection changes can
 * never leave the camera between two targets. Completion snaps exactly onto
 * the deterministic pose. User input (OrbitControls "start") cancels a tween.
 */
export function CameraDirector({ bounds, placements, reducedMotion, occludedRightPx, desktop }: CameraDirectorProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const tweenRef = useRef<gsap.core.Tween | null>(null);
  const modeRef = useRef<CameraMode>("overview");
  /** User orbit captured when leaving the overview, restored on return if still safe. */
  const savedOverview = useRef<CameraPose | null>(null);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const selectedTopicId = useAtlasStore((s) => s.selectedTopicId);
  const overviewRequest = useAtlasStore((s) => s.overviewRequest);
  const limits = useMemo(() => orbitLimits(bounds), [bounds]);

  const aspect = width / Math.max(1, height);
  const occludedRight = desktop && width > 0 ? Math.min(0.6, occludedRightPx / width) : 0;

  // Latest values for imperative callbacks without re-subscribing effects.
  const latest = useRef({ bounds, aspect, reducedMotion });
  useLayoutEffect(() => {
    latest.current = { bounds, aspect, reducedMotion };
  });

  const api = useMemo(() => {
    const setMode = (mode: CameraMode) => {
      modeRef.current = mode;
      useAtlasStore.getState().setCameraMode(mode);
    };
    const currentPose = (): CameraPose => {
      const t = controlsRef.current?.target;
      return {
        position: [camera.position.x, camera.position.y, camera.position.z],
        target: t ? [t.x, t.y, t.z] : latest.current.bounds.center,
      };
    };
    const applyPose = (pose: CameraPose) => {
      camera.position.set(...pose.position);
      const controls = controlsRef.current;
      if (controls) {
        controls.target.set(...pose.target);
        controls.update();
      } else {
        camera.lookAt(...pose.target);
      }
      invalidate();
    };
    const kill = () => {
      tweenRef.current?.kill();
      tweenRef.current = null;
    };
    const flyTo = (pose: CameraPose, during: CameraMode, after: CameraMode) => {
      kill();
      const controls = controlsRef.current;
      if (latest.current.reducedMotion || !controls) {
        applyPose(pose);
        setMode(after);
        return;
      }
      setMode(during);
      const from = currentPose();
      const state = { p: 0 };
      tweenRef.current = gsap.to(state, {
        p: 1,
        duration: FLY_DURATION,
        ease: "power2.inOut",
        onUpdate: () => {
          const k = state.p;
          camera.position.set(
            from.position[0] + (pose.position[0] - from.position[0]) * k,
            from.position[1] + (pose.position[1] - from.position[1]) * k,
            from.position[2] + (pose.position[2] - from.position[2]) * k,
          );
          controls.target.set(
            from.target[0] + (pose.target[0] - from.target[0]) * k,
            from.target[1] + (pose.target[1] - from.target[1]) * k,
            from.target[2] + (pose.target[2] - from.target[2]) * k,
          );
          controls.update();
          invalidate();
        },
        onComplete: () => {
          tweenRef.current = null;
          applyPose(pose);
          setMode(after);
        },
      });
    };
    return { setMode, currentPose, applyPose, kill, flyTo };
  }, [camera, invalidate]);

  // Initial deterministic pose (no animation).
  useLayoutEffect(() => {
    api.applyPose(overviewPose(latest.current.bounds, latest.current.aspect));
    api.setMode("overview");
  }, [api, bounds]);

  // Selection drives focus / return. Re-runs if the drawer or canvas size changes while focused.
  useEffect(() => {
    if (selectedTopicId) {
      const placement = placements.find((p) => p.topicId === selectedTopicId);
      if (!placement) return;
      if (modeRef.current === "overview") savedOverview.current = api.currentPose();
      const pose = focusPose(placement, aspect, {
        widthFraction: desktop ? FOCUS_WIDTH_DESKTOP : FOCUS_WIDTH_MOBILE,
        occludedRight,
      });
      api.flyTo(pose, "focusing", "focused");
    } else if (modeRef.current !== "overview") {
      const saved = savedOverview.current;
      const pose = saved && isPoseSafe(saved, latest.current.bounds) ? saved : overviewPose(latest.current.bounds, aspect);
      savedOverview.current = null;
      api.flyTo(pose, "returning", "overview");
    }
    // `aspect` is intentionally read from the render scope: a resize while focused re-frames.
  }, [api, selectedTopicId, placements, aspect, occludedRight, desktop]);

  // Explicit "back to overview" with nothing selected: canonical pose.
  useEffect(() => {
    if (overviewRequest === 0) return;
    savedOverview.current = null;
    api.flyTo(overviewPose(latest.current.bounds, latest.current.aspect), "returning", "overview");
  }, [api, overviewRequest]);

  // User input cancels any in-flight transition; panning is clamped to the world.
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const onStart = () => {
      if (!tweenRef.current) return;
      api.kill();
      // The user took over mid-flight: settle into the state we were heading to.
      api.setMode(modeRef.current === "focusing" ? "focused" : "overview");
    };
    const onChange = () => {
      const t = controls.target;
      const [dx, dy, dz] = clampTargetDelta([t.x, t.y, t.z], latest.current.bounds, limits.panRadius);
      if (dx !== 0 || dy !== 0 || dz !== 0) {
        t.x += dx;
        t.y += dy;
        t.z += dz;
        camera.position.x += dx;
        camera.position.y += dy;
        camera.position.z += dz;
      }
    };
    controls.addEventListener("start", onStart);
    controls.addEventListener("change", onChange);
    return () => {
      controls.removeEventListener("start", onStart);
      controls.removeEventListener("change", onChange);
    };
  }, [api, camera, limits.panRadius]);

  useEffect(() => () => api.kill(), [api]);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping={!reducedMotion}
      dampingFactor={0.08}
      rotateSpeed={0.6}
      zoomSpeed={0.8}
      panSpeed={0.8}
      screenSpacePanning={false}
      minDistance={limits.minDistance}
      maxDistance={limits.maxDistance}
      minPolarAngle={limits.minPolarAngle}
      maxPolarAngle={limits.maxPolarAngle}
    />
  );
}
