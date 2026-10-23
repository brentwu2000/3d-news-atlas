"use client";

import { useEffect, useMemo } from "react";
import type { AtlasData, EventFilters } from "@/lib/normalize";
import { filterEventsIgnoringDate } from "@/lib/normalize";
import { cutoffForIndex, cutoffIndex, dayKey, formatDay, nextPlaybackCutoff } from "@/lib/timeline";
import { useAtlasStore } from "@/store/atlas-store";

/** Playback advances one event-day per tick. Discrete steps, so also fine under reduced motion. */
export const PLAYBACK_STEP_MS = 1200;

interface TimelineProps {
  data: AtlasData;
  filters: EventFilters;
  visibleCount: number;
}

/**
 * Date cutoff over the days that have events (after search/category filters).
 * The range input is natively keyboard accessible; aria-valuetext announces
 * the date and how many events are shown.
 */
export function Timeline({ data, filters, visibleCount }: TimelineProps) {
  const playing = useAtlasStore((s) => s.playing);
  const setPlaying = useAtlasStore((s) => s.setPlaying);
  const setUntil = useAtlasStore((s) => s.setUntil);

  const matching = useMemo(() => filterEventsIgnoringDate(data, { ...filters, until: null }), [data, filters]);
  const days = useMemo(() => [...new Set(matching.map((e) => dayKey(e.occurredAt)))].sort(), [matching]);
  const index = cutoffIndex(days, filters.until);
  const label = filters.until ? `至 ${formatDay(filters.until)}` : "全部日期";
  const valueText = `${label}，顯示 ${visibleCount} / ${matching.length} 則事件`;

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      const state = useAtlasStore.getState();
      const next = nextPlaybackCutoff(days, state.filters.until);
      state.setUntil(next.until);
      if (next.done) state.setPlaying(false);
    }, PLAYBACK_STEP_MS);
    return () => window.clearInterval(timer);
  }, [playing, days]);

  const disabled = days.length < 2;

  return (
    <div role="group" aria-label="時間軸" className="flex w-full items-center gap-2 rounded-lg py-0.5 lg:border lg:border-[var(--ui-border)] lg:bg-[var(--ui-surface)] lg:px-2 lg:py-1.5 lg:backdrop-blur-sm">
      <button
        type="button"
        onClick={() => setPlaying(!playing)}
        aria-pressed={playing}
        disabled={disabled}
        className="ui-button shrink-0"
      >
        {playing ? "暫停" : "播放"}
      </button>
      <label htmlFor="timeline-range" className="sr-only">
        依發生日期篩選
      </label>
      <input
        id="timeline-range"
        type="range"
        min={0}
        max={Math.max(0, days.length - 1)}
        step={1}
        value={index}
        disabled={disabled}
        aria-valuetext={valueText}
        onChange={(e) => {
          setPlaying(false);
          setUntil(cutoffForIndex(days, Number(e.target.value)));
        }}
        className="min-w-0 flex-1 accent-[var(--atlas-highlight)]"
      />
      <p className="w-28 shrink-0 text-right text-xs leading-tight text-[var(--ui-text)] sm:w-48" aria-live="polite" data-testid="timeline-label">
        <span className="block truncate">{label}</span>
        <span className="block text-[var(--ui-muted)]">
          {visibleCount} / {matching.length} 則
        </span>
      </p>
    </div>
  );
}
