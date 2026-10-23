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
  const hasSelection = useAtlasStore((s) => s.selectedTopicId !== null);
  const setQualityPreference = useAtlasStore((s) => s.setQualityPreference);
  const setSceneStatus = useAtlasStore((s) => s.setSceneStatus);
  const requestOverview = useAtlasStore((s) => s.requestOverview);
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
        aria-label="3D 主題島嶼地圖。點選島嶼聚焦主題、點選標記開啟事件；所有內容亦可透過主題列表以鍵盤瀏覽。"
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

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
        <div className="ui-surface pointer-events-auto flex flex-wrap items-center gap-1 rounded-lg p-1">
          <button type="button" onClick={requestOverview} className="ui-button">
            {hasSelection ? "返回總覽" : "重設視角"}
          </button>
          <label className="flex items-center gap-1 pr-1 text-sm text-[var(--ui-muted)]">
            <span>畫質</span>
            <select
              value={qualityPreference}
              onChange={(e) => setQualityPreference(e.target.value as QualityPreference)}
              className="ui-input py-1"
            >
              <option value="auto">自動（{quality.level === "high" ? "高" : "低"}）</option>
              <option value="high">高</option>
              <option value="low">低</option>
            </select>
          </label>
        </div>
        <p className="ui-surface hidden rounded-lg px-2.5 py-1.5 text-xs text-[var(--ui-muted)] md:block">
          <span className="pointer-coarse:hidden">拖曳旋轉 · 右鍵平移 · 滾輪縮放 · Esc 返回</span>
          <span className="hidden pointer-coarse:inline">單指旋轉 · 雙指平移與縮放</span>
        </p>
      </div>

      {env.debug && (
        <output
          id={PERF_OUTPUT_ID}
          className="pointer-events-none absolute top-14 left-3 rounded bg-black/70 px-2 py-1 font-mono text-[11px] text-white"
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
      className="atlas-backdrop relative h-full min-h-0 w-full overflow-hidden"
    >
      {children ?? <LoadingOverlay />}
    </div>
  );
}

function LoadingOverlay() {
  return (
    <div role="status" aria-live="polite" className="absolute inset-0 grid place-items-center">
      <p className="ui-surface rounded-full px-4 py-2 text-sm text-[var(--ui-text)]">載入 3D 場景中…</p>
    </div>
  );
}
