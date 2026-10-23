"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";

export interface AtlasStats {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
  dpr: number;
  samples: number;
}

declare global {
  interface Window {
    __ATLAS_STATS__?: AtlasStats;
  }
}

const SAMPLE_WINDOW_MS = 1000;
export const PERF_OUTPUT_ID = "atlas-perf";

/**
 * Debug-only (`?debug=1`) renderer instrumentation. Publishes stats to
 * `window.__ATLAS_STATS__` and an optional DOM node, never to React state.
 * `renderer.info` auto-resets at the start of each render, so reading it in
 * useFrame (before the next render) yields the previous frame's counts.
 */
export function PerfProbe() {
  const gl = useThree((s) => s.gl);
  const frames = useRef(0);
  const windowStart = useRef(0);
  const samples = useRef(0);

  useEffect(() => () => void delete window.__ATLAS_STATS__, []);

  useFrame(() => {
    const now = performance.now();
    if (windowStart.current === 0) windowStart.current = now;
    frames.current++;
    const elapsed = now - windowStart.current;
    if (elapsed < SAMPLE_WINDOW_MS) return;

    const info = gl.info;
    samples.current++;
    const stats: AtlasStats = {
      fps: Math.round((frames.current * 1000) / elapsed),
      frameMs: Math.round((elapsed / frames.current) * 10) / 10,
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs?.length ?? 0,
      dpr: gl.getPixelRatio(),
      samples: samples.current,
    };
    window.__ATLAS_STATS__ = stats;
    const output = document.getElementById(PERF_OUTPUT_ID);
    if (output) {
      output.textContent = `${stats.fps} fps · ${stats.frameMs} ms · ${stats.drawCalls} calls · ${stats.triangles} tris · ${stats.geometries} geo · dpr ${stats.dpr}`;
    }
    frames.current = 0;
    windowStart.current = now;
  });

  return null;
}
