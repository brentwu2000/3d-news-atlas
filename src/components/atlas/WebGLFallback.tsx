"use client";

import { SQRT3, TILE_SIZE } from "@/lib/hex";
import { computeWorldBounds, layoutIslands } from "@/lib/layout";
import type { Topic } from "@/lib/schema";
import { useAtlasStore } from "@/store/atlas-store";

export type FallbackReason = "unsupported" | "error" | "context-lost";

const MESSAGES: Record<FallbackReason, string> = {
  unsupported: "此瀏覽器或裝置未啟用 WebGL，因此改以 2D 平面圖顯示。所有事件、來源與關聯仍可透過清單與詳情卡片瀏覽。",
  error: "3D 城市載入失敗，已改以 2D 平面圖顯示。所有事件、來源與關聯仍可透過清單與詳情卡片瀏覽。",
  "context-lost": "圖形裝置暫時中斷（WebGL context lost），已改以 2D 平面圖顯示。",
};

/** Flat-top hexagon clip path. */
const HEX_CLIP = "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)";

interface WebGLFallbackProps {
  topics: readonly Topic[];
  reason: FallbackReason;
  onRetry?: () => void;
}

/**
 * Accessible 2D replacement for the 3D city. Positions mirror the 3D hex
 * layout; each tile is a real button, so selection still works.
 */
export function WebGLFallback({ topics, reason, onRetry }: WebGLFallbackProps) {
  const selectedTopicId = useAtlasStore((s) => s.selectedTopicId);
  const selectTopic = useAtlasStore((s) => s.selectTopic);
  const placements = layoutIslands(topics);
  const bounds = computeWorldBounds(placements);
  const half = bounds.radius + 1;
  const pct = (v: number, c: number) => `${((v - (c - half)) / (half * 2)) * 100}%`;
  const w = `${((TILE_SIZE * 2) / (half * 2)) * 100 * 0.97}%`;
  const h = `${((TILE_SIZE * SQRT3) / (half * 2)) * 100 * 0.97}%`;

  return (
    <div role="region" aria-labelledby="webgl-fallback-heading" data-testid="webgl-fallback" className="flex h-full min-h-0 flex-col items-center gap-4 overflow-y-auto p-4 pt-[132px] lg:pt-24">
      <div className="card max-w-lg px-5 py-4">
        <h2 id="webgl-fallback-heading" className="display text-[20px]">
          2D 城市平面圖
        </h2>
        <p className="mt-1 text-[13.5px] text-ink-2">{MESSAGES[reason]}</p>
        {onRetry && (
          <button type="button" onClick={onRetry} className="btn btn-dark mt-3">
            重新載入 3D 城市
          </button>
        )}
      </div>
      <div role="group" aria-label="主題六邊形配置（位置僅為視覺排版，不代表地理位置）" className="relative aspect-square w-full max-w-[min(34rem,40dvh)] shrink-0 lg:max-w-[min(34rem,62dvh)]">
        {placements.map((p, i) => {
          const topic = topics[i];
          if (!topic) return null;
          return (
            <button
              key={p.topicId}
              type="button"
              aria-pressed={selectedTopicId === topic.id}
              aria-label={`${String(p.index).padStart(2, "0")} ${topic.shortTitle}`}
              onClick={() => selectTopic(topic.id)}
              style={{ left: pct(p.x, bounds.center[0]), top: pct(p.z, bounds.center[2]), width: w, height: h, clipPath: HEX_CLIP }}
              className="absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center bg-[#b8b4cc] text-center text-ink hover:bg-[#cbc7dc] aria-pressed:bg-accent aria-pressed:text-white"
            >
              <span className="leading-tight">
                <span className="block font-mono text-[10px] text-accent">{String(p.index).padStart(2, "0")}</span>
                <span className="block text-[11px] font-extrabold">{topic.shortTitle}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
