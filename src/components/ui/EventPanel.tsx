"use client";

import { useEffect, useRef } from "react";
import { RELATION_DESCRIPTIONS, RELATION_LABELS, STATUS_DESCRIPTIONS, STATUS_LABELS } from "@/lib/labels";
import type { AtlasData } from "@/lib/normalize";
import type { NewsEvent, Source, Topic } from "@/lib/schema";
import { formatDate, formatDateTime } from "@/lib/timeline";
import { useAtlasStore } from "@/store/atlas-store";

/** Defence in depth: the schema already rejects non-http(s) URLs. */
export function safeHref(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}

export function SourceList({ sources, compact = false }: { sources: readonly Source[]; compact?: boolean }) {
  return (
    <ul className={compact ? "mt-1 flex flex-col gap-1" : "flex flex-col gap-2"}>
      {sources.map((source) => {
        const href = safeHref(source.url);
        return (
          <li key={source.id} id={`source-${source.id}`} className={compact ? "" : "rounded-md border border-[var(--ui-border)] p-2"}>
            <p className="text-xs text-[var(--ui-muted)]">
              {source.publisher} · <time dateTime={source.publishedAt}>{formatDate(source.publishedAt)}</time>
            </p>
            {href ? (
              <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="ui-link text-sm">
                {source.title}
                <span className="sr-only">（另開新視窗）</span>
              </a>
            ) : (
              <span className="text-sm">{source.title}（連結無效）</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

interface EventPanelProps {
  data: AtlasData;
  visibleIds: ReadonlySet<string>;
}

/**
 * Detail drawer (desktop: right side; mobile: bottom sheet). Shows the
 * selected event, or the selected topic's overview. Focus moves to the
 * heading on open and back to the matching list item on close.
 */
export function EventPanel({ data, visibleIds }: EventPanelProps) {
  const selectedTopicId = useAtlasStore((s) => s.selectedTopicId);
  const selectedEventId = useAtlasStore((s) => s.selectedEventId);
  const back = useAtlasStore((s) => s.back);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const event = selectedEventId ? data.eventById.get(selectedEventId) : undefined;
  const topic = selectedTopicId ? data.topicById.get(selectedTopicId) : undefined;

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [selectedEventId, selectedTopicId]);

  if (!topic) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="event-panel">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--ui-border)] px-4 py-2">
        <p className="text-xs text-[var(--ui-muted)]">{event ? "事件詳情" : "主題概覽"}</p>
        <button type="button" onClick={back} className="ui-button" aria-keyshortcuts="Escape">
          {event ? "返回主題" : "關閉"}
          <span className="sr-only">（Esc）</span>
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {event ? (
          <EventDetail data={data} event={event} topic={topic} visibleIds={visibleIds} headingRef={headingRef} />
        ) : (
          <TopicDetail data={data} topic={topic} visibleIds={visibleIds} headingRef={headingRef} />
        )}
      </div>
    </div>
  );
}

function TopicDetail({
  data,
  topic,
  visibleIds,
  headingRef,
}: {
  data: AtlasData;
  topic: Topic;
  visibleIds: ReadonlySet<string>;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const selectEvent = useAtlasStore((s) => s.selectEvent);
  const events = (data.eventsByTopic.get(topic.id) ?? []).filter((e) => visibleIds.has(e.id));
  return (
    <article aria-labelledby="panel-heading" className="flex flex-col gap-3">
      <h2 id="panel-heading" ref={headingRef} tabIndex={-1} className="text-lg font-semibold break-words text-[var(--ui-text)]">
        {topic.title}
      </h2>
      <p className="text-xs text-[var(--ui-muted)]">
        {topic.category}
        {topic.locationLabel && ` · ${topic.locationLabel}`}
      </p>
      <p className="text-sm break-words text-[var(--ui-text)]">{topic.description}</p>
      <h3 className="mt-1 text-sm font-semibold text-[var(--ui-text)]">事件（{events.length}）</h3>
      {events.length === 0 ? (
        <p className="text-sm text-[var(--ui-muted)]">此主題目前沒有符合篩選條件的事件。</p>
      ) : (
        <ol className="flex flex-col gap-1">
          {events.map((e) => (
            <li key={e.id}>
              <button type="button" onClick={() => selectEvent(e.id)} className="w-full rounded-md px-2 py-1.5 text-left hover:bg-white/5">
                <span className="block text-sm break-words text-[var(--ui-text)]">{e.title}</span>
                <span className="text-xs text-[var(--ui-muted)]">
                  {formatDate(e.occurredAt)} · {STATUS_LABELS[e.status]}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}

function EventDetail({
  data,
  event,
  topic,
  visibleIds,
  headingRef,
}: {
  data: AtlasData;
  event: NewsEvent;
  topic: Topic;
  visibleIds: ReadonlySet<string>;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const selectEvent = useAtlasStore((s) => s.selectEvent);
  const relations = data.relationsByEvent.get(event.id) ?? [];

  return (
    <article aria-labelledby="panel-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="ui-badge" data-testid="event-status">
          狀態：{STATUS_LABELS[event.status]}
        </span>
        {event.isFictional && <span className="ui-badge">虛構範例</span>}
      </div>
      <h2 id="panel-heading" ref={headingRef} tabIndex={-1} className="text-lg font-semibold break-words text-[var(--ui-text)]">
        {event.title}
      </h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-[var(--ui-muted)]">發生時間</dt>
        <dd className="text-[var(--ui-text)]">
          <time dateTime={event.occurredAt}>{formatDateTime(event.occurredAt)}</time>
        </dd>
        <dt className="text-[var(--ui-muted)]">首次刊出</dt>
        <dd className="text-[var(--ui-text)]">
          <time dateTime={event.publishedAt}>{formatDateTime(event.publishedAt)}</time>
        </dd>
        <dt className="text-[var(--ui-muted)]">主題</dt>
        <dd className="break-words text-[var(--ui-text)]">{topic.title}</dd>
      </dl>
      <p className="text-xs text-[var(--ui-muted)]">{STATUS_DESCRIPTIONS[event.status]}</p>
      {event.correctionNote && (
        <div role="note" className="rounded-md border border-[var(--ui-border)] p-2 text-sm text-[var(--ui-text)]">
          <p className="text-xs font-semibold text-[var(--ui-muted)]">更正說明</p>
          <p className="break-words">{event.correctionNote}</p>
        </div>
      )}
      <p className="text-sm break-words text-[var(--ui-text)]">{event.summary}</p>
      {event.tags.length > 0 && (
        <ul aria-label="標籤" className="flex flex-wrap gap-1">
          {event.tags.map((tag) => (
            <li key={tag} className="ui-badge">
              #{tag}
            </li>
          ))}
        </ul>
      )}

      <section aria-labelledby="sources-heading" className="flex flex-col gap-2">
        <h3 id="sources-heading" className="text-sm font-semibold text-[var(--ui-text)]">
          來源（{event.sources.length}）
        </h3>
        <SourceList sources={event.sources} />
        <p className="text-xs text-[var(--ui-muted)]">本站僅提供摘要，完整內容請見原始來源。</p>
      </section>

      {relations.length > 0 && (
        <section aria-labelledby="relations-heading" className="flex flex-col gap-2">
          <h3 id="relations-heading" className="text-sm font-semibold text-[var(--ui-text)]">
            人工整理的關聯（{relations.length}）
          </h3>
          <ul className="flex flex-col gap-2">
            {relations.map((relation) => {
              const otherId = relation.fromEventId === event.id ? relation.toEventId : relation.fromEventId;
              const other = data.eventById.get(otherId);
              if (!other) return null;
              const cited = relation.sourceIds.map((id) => data.sourceById.get(id)).filter((s): s is Source => Boolean(s));
              const otherVisible = visibleIds.has(otherId);
              return (
                <li key={relation.id} className="rounded-md border border-[var(--ui-border)] p-2 text-sm" data-testid="relation">
                  <p className="flex flex-wrap items-center gap-1.5">
                    <span className="ui-badge">{RELATION_LABELS[relation.type]}</span>
                    <span className="text-xs text-[var(--ui-muted)]">{RELATION_DESCRIPTIONS[relation.type]}</span>
                  </p>
                  <p className="mt-1 break-words text-[var(--ui-text)]">{relation.explanation}</p>
                  {cited.length > 0 && (
                    <div className="mt-1">
                      <p className="text-xs text-[var(--ui-muted)]">引用來源：</p>
                      <SourceList sources={cited} compact />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => selectEvent(otherId)}
                    disabled={!otherVisible}
                    className="ui-button mt-1 -ml-2 text-left"
                  >
                    {relation.fromEventId === event.id ? "→ " : "← "}
                    {other.title}
                    {!otherVisible && "（已被篩選隱藏）"}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </article>
  );
}
