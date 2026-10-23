"use client";

import { useEffect, useMemo } from "react";
import type { AtlasData, EventFilters } from "@/lib/normalize";
import { filterEventsIgnoringDate } from "@/lib/normalize";
import { cutoffForIndex, cutoffIndex, dayKey, formatDay, nextPlaybackCutoff } from "@/lib/timeline";
import { useAtlasStore } from "@/store/atlas-store";
import { CategoryChips } from "./Filters";
import { Icon } from "./icons";

/** Playback advances one event-day per tick. Discrete steps, so also fine under reduced motion. */
export const PLAYBACK_STEP_MS = 1200;

interface TimelineProps {
  data: AtlasData;
  filters: EventFilters;
  visibleCount: number;
  onClose?: () => void;
}

/**
 * "時間軸與篩選": category filter + date cutoff over the days that have
 * events. The range input is natively keyboard accessible; aria-valuetext
 * announces the date and how many events are shown.
 */
export function Timeline({ data, filters, visibleCount, onClose }: TimelineProps) {
  const playing = useAtlasStore((s) => s.playing);
  const setPlaying = useAtlasStore((s) => s.setPlaying);
  const setUntil = useAtlasStore((s) => s.setUntil);

  const matching = useMemo(() => filterEventsIgnoringDate(data, { ...filters, until: null }), [data, filters]);
  const days = useMemo(() => [...new Set(matching.map((e) => dayKey(e.occurredAt)))].sort(), [matching]);
  const index = cutoffIndex(days, filters.until);
  const label = filters.until ? `至 ${formatDay(filters.until)}` : "全部日期";
  const valueText = `${label}，顯示 ${visibleCount} / ${matching.length} 則事件`;

  // Monthly histogram of matching events (counts only).
  const months = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of matching) {
      const m = dayKey(e.occurredAt).slice(0, 7);
      map.set(m, (map.get(m) ?? 0) + 1);
    }
    return [...map].sort(([a], [b]) => a.localeCompare(b));
  }, [matching]);
  const maxMonth = Math.max(1, ...months.map(([, n]) => n));
  const untilMonth = filters.until?.slice(0, 7) ?? null;

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
    <section role="group" aria-labelledby="timeline-heading" className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="kicker">Timeline</p>
          <h2 id="timeline-heading" className="display mt-0.5 text-[20px]">
            時間軸與篩選
          </h2>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full hover:bg-paper-strong" aria-label="關閉時間軸">
            <Icon name="close" />
          </button>
        )}
      </div>
      <CategoryChips categories={data.categories} className="flex-wrap" />
      <div aria-hidden="true" className="flex h-12 items-end gap-1">
        {months.map(([m, n]) => (
          <div key={m} className="flex flex-1 flex-col items-center gap-1">
            <div
              className={`w-full rounded-t ${untilMonth && m > untilMonth ? "bg-paper-sunk" : "bg-ink-2"}`}
              style={{ height: `${(n / maxMonth) * 32 + 4}px` }}
            />
            <span className="font-mono text-[9.5px] text-muted">{Number(m.slice(5))}月</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setPlaying(!playing)} aria-pressed={playing} disabled={disabled} className="btn btn-dark shrink-0 !px-3">
          <Icon name={playing ? "pause" : "play"} size={14} />
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
          className="min-w-0 flex-1 accent-[var(--accent)]"
        />
      </div>
      <p className="flex items-center justify-between text-[12.5px]" aria-live="polite" data-testid="timeline-label">
        <span className="font-semibold">{label}</span>
        <span className="font-mono text-muted">
          {visibleCount} / {matching.length} 則
        </span>
      </p>
    </section>
  );
}
