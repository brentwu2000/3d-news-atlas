"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo } from "react";
import { useIsClient, usePrefersReducedMotion } from "@/lib/hooks";
import type { AtlasData } from "@/lib/normalize";
import { qualitySettings, readDeviceHints, resolveQuality, type QualityLevel, type QualityPreference } from "@/lib/quality";
import { detectWebGL, type WebGLSupport } from "@/lib/webgl";
import { useAtlasStore } from "@/store/atlas-store";
import { PERF_OUTPUT_ID } from "./PerfProbe";
import { SceneErrorBoundary } from "./SceneErrorBoundary";
import { WebGLFallback } from "./WebGLFallback";

const WorldScene = dynamic(() => import("./WorldScene"), { ssr: false, loading: () => null });

interface ClientEnvironment {
  webgl: WebGLSupport;
  qualityOverride: QualityLevel | null;
  debug: boolean;
  deviceHints: ReturnType<typeof readDeviceHints>;
}

/**
 * Reads browser-only facts once. QA switches: `?webgl=0` forces the fallback,
 * `?quality=low|high` overrides detection, `?debug=1` shows renderer stats
 * and exposes `window.__ATLAS_DEBUG__` for E2E tests.
 */
function readEnvironment(): ClientEnvironment {
  const params = new URLSearchParams(window.location.search);
  const q = params.get("quality");
  return {
    webgl: params.get("webgl") === "0" ? "none" : detectWebGL(),
    qualityOverride: q === "low" || q === "high" ? q : null,
    debug: params.get("debug") === "1",
    deviceHints: readDeviceHints(),
  };
}

interface AtlasClientProps {
  data: AtlasData;
  /** Width of the desktop drawer currently covering the canvas' right edge. */
  occludedRightPx: number;
  desktop: boolean;
}

export function AtlasClient({ data, occludedRightPx, desktop }: AtlasClientProps) {
  const isClient = useIsClient();
  const env = useMemo(() => (isClient ? readEnvironment() : null), [isClient]);
  const reducedMotion = usePrefersReducedMotion();

  const qualityPreference = useAtlasStore((s) => s.qualityPreference);
  const sceneStatus = useAtlasStore((s) => s.sceneStatus);
  const sceneGeneration = useAtlasStore((s) => s.sceneGeneration);
  const cameraMode = useAtlasStore((s) => s.cameraMode);
  const setSceneStatus = useAtlasStore((s) => s.setSceneStatus);
  const retryScene = useAtlasStore((s) => s.retryScene);

  const quality = useMemo(() => {
    if (!env) return null;
    const preference: QualityPreference = qualityPreference !== "auto" ? qualityPreference : (env.qualityOverride ?? "auto");
    return qualitySettings(resolveQuality(preference, env.deviceHints));
  }, [env, qualityPreference]);

  const handleReady = useCallback(() => setSceneStatus("ready"), [setSceneStatus]);
  const handleContextLost = useCallback(() => setSceneStatus("context-lost"), [setSceneStatus]);
  const handleError = useCallback(
    (error: unknown) => {
      console.error("[atlas] 3D scene failed", error);
      setSceneStatus("error");
    },
    [setSceneStatus],
  );

  if (!env || !quality) {
    return <SceneShell status="loading" />;
  }

  if (env.webgl === "none") {
    return (
      <SceneShell status="fallback">
        <WebGLFallback topics={data.topics} reason="unsupported" />
      </SceneShell>
    );
  }

  if (sceneStatus === "error" || sceneStatus === "context-lost") {
    return (
      <SceneShell status="fallback">
        <WebGLFallback topics={data.topics} reason={sceneStatus} onRetry={retryScene} />
      </SceneShell>
    );
  }

  return (
    <SceneShell status={sceneStatus} quality={quality.level} cameraMode={cameraMode}>
      <div
        className="absolute inset-0"
        role="img"
        aria-label="由十九格六邊形組成的 3D 城市地圖。點選一格聚焦主題、點選光柱開啟事件；所有內容亦可透過右側清單以鍵盤瀏覽。"
      >
        <SceneErrorBoundary key={sceneGeneration} onError={handleError} fallback={null}>
          <WorldScene
            key={`${quality.level}:${sceneGeneration}`}
            data={data}
            quality={quality}
            reducedMotion={reducedMotion}
            debug={env.debug}
            occludedRightPx={occludedRightPx}
            desktop={desktop}
            onReady={handleReady}
            onContextLost={handleContextLost}
          />
        </SceneErrorBoundary>
      </div>

      {env.debug && (
        <output
          id={PERF_OUTPUT_ID}
          className="pointer-events-none absolute bottom-3 left-3 z-10 rounded bg-black/70 px-2 py-1 font-mono text-[11px] text-white"
        />
      )}

      {sceneStatus === "loading" && <LoadingOverlay />}
    </SceneShell>
  );
}

function SceneShell({
  status,
  quality,
  cameraMode,
  children,
}: {
  status: string;
  quality?: QualityLevel;
  cameraMode?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      data-testid="atlas-scene"
      data-scene-status={status}
      data-quality={quality}
      data-camera-mode={cameraMode}
      className="relative h-full min-h-0 w-full overflow-hidden bg-[var(--scene-bg)]"
    >
      {children ?? <LoadingOverlay />}
    </div>
  );
}

function LoadingOverlay() {
  return (
    <div role="status" aria-live="polite" className="absolute inset-0 grid place-items-center">
      <p className="card rounded-full px-4 py-2 text-sm">載入 3D 城市中…</p>
    </div>
  );
}
