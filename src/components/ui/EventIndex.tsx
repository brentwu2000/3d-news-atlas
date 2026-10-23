"use client";

import { useState } from "react";
import { RELATION_LABELS, STATUS_LABELS } from "@/lib/labels";
import type { AtlasData } from "@/lib/normalize";
import type { NewsEvent } from "@/lib/schema";
import { formatDate } from "@/lib/timeline";
import { useAtlasStore } from "@/store/atlas-store";
import { SourceList } from "./EventPanel";
import { SearchField } from "./Filters";

interface EventIndexProps {
  data: AtlasData;
  visible: readonly NewsEvent[];
  totalMatching: number;
}

/**
 * "THE EVENT INDEX": keyboard-accessible equivalent of the 3D city. Every
 * tile and beacon pick has a button here. Server-rendered too, and each event
 * carries a native <details> with summary + sources so content is readable
 * without JavaScript or WebGL.
 */
export function EventIndex({ data, visible, totalMatching }: EventIndexProps) {
  const [tab, setTab] = useState<"topics" | "relations">("topics");
  const filtersActive = useAtlasStore((s) => s.filters.query !== "" || s.filters.categories.length > 0 || s.filters.until !== null);
  const clearFilters = useAtlasStore((s) => s.clearFilters);
  const sources = data.sourceById.size;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-5 pt-2 pb-3 lg:pt-5">
        <p className="kicker max-lg:hidden">The Event Index</p>
        <h2 className="display mt-1.5 text-[26px] leading-tight max-lg:mt-0 max-lg:text-[19px]">
          這座城，發生過什麼<span className="text-accent">。</span>
        </h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted lg:mt-1.5 lg:text-[13px]" data-testid="visible-count" aria-live="polite">
          {data.topics.length} 個主題 ／ 顯示 {visible.length} / {data.events.length} 則事件 ／ {sources} 個來源
          {filtersActive && totalMatching !== visible.length && `（時間軸外另有 ${totalMatching - visible.length} 則）`}
        </p>
        <div className="mt-2.5 flex gap-2 lg:mt-3 lg:block">
          <SearchField className="min-w-0 flex-1" />
          <div role="tablist" aria-label="清單檢視" className="flex shrink-0 gap-2 lg:mt-3 lg:grid lg:grid-cols-2">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "topics"}
            onClick={() => setTab("topics")}
            className="btn aria-selected:bg-ink aria-selected:text-paper max-lg:!px-2.5 max-lg:text-[13px]"
          >
            <span className="lg:hidden">主題</span>
            <span className="max-lg:hidden">主題與事件</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "relations"}
            onClick={() => setTab("relations")}
            className="btn aria-selected:bg-ink aria-selected:text-paper max-lg:!px-2.5 max-lg:text-[13px]"
          >
            <span className="lg:hidden">關聯</span>
            <span className="max-lg:hidden">事件關聯 {data.relations.length}</span>
          </button>
          </div>
        </div>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto border-t border-line px-3 pb-3">
        {visible.length === 0 && (
          <div role="status" className="m-2 rounded-xl border border-line bg-paper-strong p-3 text-sm">
            <p>沒有符合目前搜尋、分類或時間條件的事件。</p>
            <button type="button" onClick={clearFilters} className="btn mt-2">
              清除所有篩選
            </button>
          </div>
        )}
        {tab === "topics" ? <TopicList data={data} visible={visible} /> : <RelationList data={data} visible={visible} />}
        <p className="mt-3 px-2 text-[12px] leading-relaxed text-muted lg:hidden">
          所有主題、事件與來源皆為測試用的<strong className="text-ink">虛構範例</strong>，並非真實新聞。
        </p>
      </div>

      <p className="border-t border-line px-5 py-3 text-[12px] leading-relaxed text-muted max-lg:hidden">
        所有主題、事件與來源皆為測試用的<strong className="text-ink">虛構範例</strong>，並非真實新聞。文字只提供摘要並附上來源；地圖上的 3D 場景是示意插畫，色彩與大小不代表事件的真偽或嚴重程度。
      </p>
    </div>
  );
}

function TopicList({ data, visible }: { data: AtlasData; visible: readonly NewsEvent[] }) {
  const selectedTopicId = useAtlasStore((s) => s.selectedTopicId);
  const selectedEventId = useAtlasStore((s) => s.selectedEventId);
  const selectTopic = useAtlasStore((s) => s.selectTopic);
  const selectEvent = useAtlasStore((s) => s.selectEvent);
  const hoverTopic = useAtlasStore((s) => s.hoverTopic);
  const hoverEvent = useAtlasStore((s) => s.hoverEvent);

  const byTopic = new Map<string, NewsEvent[]>();
  for (const e of visible) {
    const list = byTopic.get(e.topicId);
    if (list) list.push(e);
    else byTopic.set(e.topicId, [e]);
  }

  return (
    <nav aria-label="主題與事件">
      <ul>
        {data.topics.map((topic, i) => {
          const events = byTopic.get(topic.id) ?? [];
          const open = selectedTopicId === topic.id;
          return (
            <li key={topic.id} className="border-b border-line">
              <button
                type="button"
                id={`nav-topic-${topic.id}`}
                aria-expanded={open}
                aria-current={open && !selectedEventId ? "true" : undefined}
                onClick={() => selectTopic(topic.id)}
                onPointerEnter={() => hoverTopic(topic.id)}
                onPointerLeave={() => hoverTopic(null)}
                onFocus={() => hoverTopic(topic.id)}
                onBlur={() => hoverTopic(null)}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-paper-strong aria-expanded:bg-paper-strong"
              >
                <span className="display w-9 shrink-0 text-[24px] leading-none font-black text-accent italic">{String(i + 1).padStart(2, "0")}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[15px] font-extrabold">{topic.shortTitle}</span>
                    <span className="tag">{topic.category}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-[12px] text-muted">{topic.title}</span>
                </span>
                <span className="shrink-0 font-mono text-[11px] text-muted">{events.length} ↗</span>
              </button>
              {open && events.length > 0 && (
                <ul className="mb-2 ml-11 border-l-2 border-accent/40 pl-2">
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
                        className="w-full rounded-md px-2 py-1.5 text-left hover:bg-paper-strong aria-[current=true]:bg-ink aria-[current=true]:text-paper"
                      >
                        <span className="block text-[13px] font-semibold break-words">{event.title}</span>
                        <span className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] opacity-75">
                          <time dateTime={event.occurredAt}>{formatDate(event.occurredAt)}</time>
                          <span>{STATUS_LABELS[event.status]}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {/* No-JS / crawler-friendly content: every event's summary and sources. */}
              {!open && events.length > 0 && (
                <details className="mb-2 ml-11 text-[12px] text-muted">
                  <summary className="cursor-pointer py-0.5">展開 {events.length} 則事件摘要</summary>
                  <ul className="mt-1 flex flex-col gap-2">
                    {events.map((event) => (
                      <li key={event.id}>
                        <p className="font-semibold text-ink">{event.title}</p>
                        <p className="break-words">{event.summary}</p>
                        <SourceList sources={event.sources} compact />
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function RelationList({ data, visible }: { data: AtlasData; visible: readonly NewsEvent[] }) {
  const selectEvent = useAtlasStore((s) => s.selectEvent);
  const visibleIds = new Set(visible.map((e) => e.id));
  return (
    <ul aria-label="人工整理的事件關聯" className="flex flex-col gap-2 pt-3">
      {data.relations.map((r) => {
        const from = data.eventById.get(r.fromEventId);
        const to = data.eventById.get(r.toEventId);
        if (!from || !to) return null;
        const enabled = visibleIds.has(from.id);
        return (
          <li key={r.id}>
            <button
              type="button"
              disabled={!enabled}
              onClick={() => selectEvent(from.id)}
              className="w-full rounded-xl border border-line bg-[#fffdf8] p-3 text-left hover:bg-white disabled:opacity-50"
            >
              <span className="flex items-center gap-2">
                <span className="tag !bg-accent">{RELATION_LABELS[r.type]}</span>
                <span className="font-mono text-[10.5px] text-muted">{r.id}</span>
              </span>
              <span className="mt-1 block text-[13px] font-semibold">
                {from.title} → {to.title}
              </span>
              <span className="mt-0.5 block text-[12px] text-muted">{r.explanation}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
