"use client";

import { computeWorldBounds, layoutIslands } from "@/lib/layout";
import type { Topic } from "@/lib/schema";
import { useAtlasStore } from "@/store/atlas-store";

export type FallbackReason = "unsupported" | "error" | "context-lost";

const MESSAGES: Record<FallbackReason, string> = {
  unsupported: "此瀏覽器或裝置未啟用 WebGL，因此改以 2D 平面圖顯示。所有事件、來源與關聯仍可透過列表與詳情面板瀏覽。",
  error: "3D 場景載入失敗，已改以 2D 平面圖顯示。所有事件、來源與關聯仍可透過列表與詳情面板瀏覽。",
  "context-lost": "圖形裝置暫時中斷（WebGL context lost），已改以 2D 平面圖顯示。",
};

interface WebGLFallbackProps {
  topics: readonly Topic[];
  reason: FallbackReason;
  onRetry?: () => void;
}

/**
 * Accessible 2D replacement for the 3D world. Positions mirror the 3D
 * layout; each island is a real button so selection still works.
 */
export function WebGLFallback({ topics, reason, onRetry }: WebGLFallbackProps) {
  const selectedTopicId = useAtlasStore((s) => s.selectedTopicId);
  const selectTopic = useAtlasStore((s) => s.selectTopic);
  const placements = layoutIslands(topics);
  const bounds = computeWorldBounds(placements);
  const half = bounds.radius + 2;
  const toPct = (v: number, c: number) => `${((v - (c - half)) / (half * 2)) * 100}%`;

  return (
    <div
      role="region"
      aria-labelledby="webgl-fallback-heading"
      data-testid="webgl-fallback"
      className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-4 pb-20"
    >
      <div className="max-w-xl">
        <h2 id="webgl-fallback-heading" className="text-base font-semibold text-[var(--ui-text)]">
          2D 主題地圖
        </h2>
        <p className="mt-1 text-sm text-[var(--ui-muted)]">{MESSAGES[reason]}</p>
        {onRetry && (
          <button type="button" onClick={onRetry} className="ui-button mt-2 border border-[var(--ui-border)]">
            重新載入 3D 場景
          </button>
        )}
      </div>
      <div className="relative mx-auto aspect-square w-full max-w-[min(28rem,34dvh)] lg:max-w-[min(28rem,60dvh)]" aria-label="主題島嶼平面配置（位置僅為視覺排版，不代表地理位置）" role="group">
        {placements.map((p, i) => {
          const topic = topics[i];
          if (!topic) return null;
          const size = `${((p.radius * 2) / (half * 2)) * 100}%`;
          return (
            <button
              key={p.topicId}
              type="button"
              aria-pressed={selectedTopicId === topic.id}
              onClick={() => selectTopic(topic.id)}
              style={{ left: toPct(p.x, bounds.center[0]), top: toPct(p.z, bounds.center[2]), width: size, height: size }}
              className="absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-raised)] p-1 text-center text-xs text-[var(--ui-text)] aria-pressed:border-atlas-highlight aria-pressed:bg-atlas-highlight aria-pressed:text-[#101b2b]"
            >
              {topic.category}
            </button>
          );
        })}
      </div>
    </div>
  );
}
