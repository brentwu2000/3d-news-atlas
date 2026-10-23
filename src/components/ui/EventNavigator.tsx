"use client";

import { STATUS_LABELS } from "@/lib/labels";
import type { AtlasData } from "@/lib/normalize";
import type { NewsEvent } from "@/lib/schema";
import { formatDate } from "@/lib/timeline";
import { useAtlasStore } from "@/store/atlas-store";
import { SourceList } from "./EventPanel";

interface EventNavigatorProps {
  data: AtlasData;
  visible: readonly NewsEvent[];
  totalMatching: number;
}

/**
 * Keyboard-accessible equivalent of the 3D world: every island and marker
 * pick has a button here. Rendered on the server too, and each event carries
 * a native <details> with summary + sources so content is readable without
 * JavaScript or WebGL.
 */
export function EventNavigator({ data, visible, totalMatching }: EventNavigatorProps) {
  const selectedTopicId = useAtlasStore((s) => s.selectedTopicId);
  const selectedEventId = useAtlasStore((s) => s.selectedEventId);
  const selectTopic = useAtlasStore((s) => s.selectTopic);
  const selectEvent = useAtlasStore((s) => s.selectEvent);
  const hoverTopic = useAtlasStore((s) => s.hoverTopic);
  const hoverEvent = useAtlasStore((s) => s.hoverEvent);
  const clearFilters = useAtlasStore((s) => s.clearFilters);
  const filtersActive = useAtlasStore((s) => s.filters.query !== "" || s.filters.categories.length > 0 || s.filters.until !== null);

  const byTopic = new Map<string, NewsEvent[]>();
  for (const event of visible) {
    const list = byTopic.get(event.topicId);
    if (list) list.push(event);
    else byTopic.set(event.topicId, [event]);
  }

  return (
    <nav aria-label="主題與事件" className="flex min-h-0 flex-col gap-3">
      <p className="text-xs text-[var(--ui-muted)]" aria-live="polite" data-testid="visible-count">
        顯示 {visible.length} / {data.events.length} 則事件
        {filtersActive && totalMatching !== visible.length && `（時間軸外另有 ${totalMatching - visible.length} 則）`}
      </p>

      {visible.length === 0 && (
        <div role="status" className="rounded-lg border border-[var(--ui-border)] p-3 text-sm text-[var(--ui-text)]">
          <p>沒有符合目前搜尋、分類或時間條件的事件。</p>
          <button type="button" onClick={clearFilters} className="ui-button mt-2 border border-[var(--ui-border)]">
            清除所有篩選
          </button>
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {data.topics.map((topic) => {
          const events = byTopic.get(topic.id) ?? [];
          const topicSelected = selectedTopicId === topic.id;
          return (
            <li key={topic.id} className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-solid)]">
              <button
                type="button"
                id={`nav-topic-${topic.id}`}
                aria-current={topicSelected && !selectedEventId ? "true" : undefined}
                onClick={() => selectTopic(topic.id)}
                onPointerEnter={() => hoverTopic(topic.id)}
                onPointerLeave={() => hoverTopic(null)}
                onFocus={() => hoverTopic(topic.id)}
                onBlur={() => hoverTopic(null)}
                className="flex w-full items-start justify-between gap-2 rounded-t-lg px-3 py-2 text-left hover:bg-white/5 aria-[current=true]:bg-white/10"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold break-words text-[var(--ui-text)]">{topic.title}</span>
                  <span className="block text-xs text-[var(--ui-muted)]">{topic.category}</span>
                </span>
                <span className="shrink-0 text-xs text-[var(--ui-muted)]">{events.length} 則</span>
              </button>
              {events.length > 0 && (
                <ul className="border-t border-[var(--ui-border)] px-1.5 py-1.5">
                  {events.map((event) => (
                    <li key={event.id}>
                      <button
                        type="button"
                        id={`nav-event-${event.id}`}
                        aria-current={selectedEventId === event.id ? "true" : undefined}
                        onClick={() => selectEvent(event.id)}
                        onPointerEnter={() => hoverEvent(event.id)}
                        onPointerLeave={() => hoverEvent(null)}
                        onFocus={() => hoverEvent(event.id)}
                        onBlur={() => hoverEvent(null)}
                        className="w-full rounded-md px-2 py-1.5 text-left hover:bg-white/5 aria-[current=true]:bg-[var(--ui-accent)] aria-[current=true]:text-[#101b2b]"
                      >
                        <span className="block text-sm break-words">{event.title}</span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs opacity-80">
                          <time dateTime={event.occurredAt}>{formatDate(event.occurredAt)}</time>
                          <span>{STATUS_LABELS[event.status]}</span>
                        </span>
                      </button>
                      <details className="px-2 pb-1 text-xs text-[var(--ui-muted)]">
                        <summary className="cursor-pointer py-0.5">摘要與來源</summary>
                        <p className="mt-1 break-words text-[var(--ui-text)]">{event.summary}</p>
                        <SourceList sources={event.sources} compact />
                      </details>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
