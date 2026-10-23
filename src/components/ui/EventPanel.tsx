"use client";

import { useEffect, useRef } from "react";
import { RELATION_DESCRIPTIONS, RELATION_LABELS, STATUS_DESCRIPTIONS, STATUS_LABELS, THEME_LABELS } from "@/lib/labels";
import type { AtlasData } from "@/lib/normalize";
import type { NewsEvent, Source, Topic } from "@/lib/schema";
import { formatDate, formatDateTime } from "@/lib/timeline";
import { useAtlasStore } from "@/store/atlas-store";
import { Icon } from "./icons";

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
          <li key={source.id} className={compact ? "" : "rounded-xl border border-line bg-[#fffdf8] p-3"}>
            <p className="text-[11.5px] text-muted">
              {source.publisher} · <time dateTime={source.publishedAt}>{formatDate(source.publishedAt)}</time>
            </p>
            {href ? (
              <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="link text-[13.5px] font-semibold">
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
 * Floating detail card (desktop) / bottom sheet (mobile). Shows the selected
 * topic's legend card, or a selected event. Focus moves to the heading on
 * open and back to the matching index item on close.
 */
export function EventPanel({ data, visibleIds }: EventPanelProps) {
  const selectedTopicId = useAtlasStore((s) => s.selectedTopicId);
  const selectedEventId = useAtlasStore((s) => s.selectedEventId);
  const back = useAtlasStore((s) => s.back);
  const requestOverview = useAtlasStore((s) => s.requestOverview);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const event = selectedEventId ? data.eventById.get(selectedEventId) : undefined;
  const topic = selectedTopicId ? data.topicById.get(selectedTopicId) : undefined;
  const index = topic ? data.topics.indexOf(topic) : -1;

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [selectedEventId, selectedTopicId]);

  if (!topic) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="event-panel">
      <div className="flex items-start justify-between gap-2 px-5 pt-4">
        <p className="kicker pt-1.5">
          {event ? (
            <>Event · {String(index + 1).padStart(2, "0")}</>
          ) : (
            <>Legend {String(index + 1).padStart(2, "0")}</>
          )}
        </p>
        <div className="flex items-center gap-1">
          {event && (
            <button type="button" onClick={back} className="btn !px-2.5 !py-1 text-[13px]" aria-keyshortcuts="Escape">
              ← 返回主題
            </button>
          )}
          <button type="button" onClick={requestOverview} className="grid h-9 w-9 place-items-center rounded-full hover:bg-paper-strong" aria-label="關閉詳細資料（返回總覽）">
            <Icon name="close" />
          </button>
        </div>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 pb-4">
        {event ? (
          <EventDetail data={data} event={event} topic={topic} visibleIds={visibleIds} headingRef={headingRef} />
        ) : (
          <TopicDetail data={data} topic={topic} visibleIds={visibleIds} headingRef={headingRef} />
        )}
      </div>
      {!event && <PrevNext data={data} index={index} />}
    </div>
  );
}

function PrevNext({ data, index }: { data: AtlasData; index: number }) {
  const selectTopic = useAtlasStore((s) => s.selectTopic);
  const n = data.topics.length;
  const prev = data.topics[(index - 1 + n) % n];
  const next = data.topics[(index + 1) % n];
  return (
    <div className="grid grid-cols-2 gap-2 border-t border-line px-5 py-3">
      <button type="button" className="btn" onClick={() => prev && selectTopic(prev.id)}>
        ← 上一格
      </button>
      <button type="button" className="btn btn-dark" onClick={() => next && selectTopic(next.id)}>
        下一格 →
      </button>
    </div>
  );
}

const Notice = () => (
  <div className="mt-4 flex gap-2.5 rounded-xl bg-paper-strong p-3.5 text-[12.5px] leading-relaxed text-ink-2">
    <span aria-hidden="true" className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-bold text-white">
      !
    </span>
    <div>
      <p className="font-bold text-ink">本格為虛構範例</p>
      <p>以下事件、出版者與連結皆為測試用的虛構內容。每則事件以文字標示查證狀態，色彩與大小不代表真偽或嚴重程度。</p>
    </div>
  </div>
);

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
  const relations = [...new Set((data.eventsByTopic.get(topic.id) ?? []).flatMap((e) => data.relationsByEvent.get(e.id) ?? []))];
  return (
    <article aria-labelledby="panel-heading">
      <h2 id="panel-heading" ref={headingRef} tabIndex={-1} className="display mt-1 text-[30px] leading-tight break-words">
        {topic.title}
      </h2>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{topic.description}</p>
      <p className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="tag">{topic.category}</span>
        <span className="badge">{THEME_LABELS[topic.theme]}</span>
        {topic.locationLabel && <span className="badge">{topic.locationLabel}</span>}
      </p>
      <Notice />
      <h3 className="mt-5 text-[15px] font-extrabold">
        事件 <span className="font-mono text-[12px] text-accent">{events.length}</span>
      </h3>
      {events.length === 0 ? (
        <p className="mt-2 text-sm text-muted">此主題目前沒有符合篩選條件的事件。</p>
      ) : (
        <ol className="mt-2 flex flex-col gap-2">
          {events.map((e) => (
            <li key={e.id}>
              <button type="button" onClick={() => selectEvent(e.id)} className="w-full rounded-xl border border-line bg-[#fffdf8] p-3 text-left hover:bg-white">
                <span className="block text-[14.5px] font-extrabold break-words">{e.title}</span>
                <span className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-muted">
                  <time dateTime={e.occurredAt}>{formatDate(e.occurredAt)}</time>
                  <span className="badge">{STATUS_LABELS[e.status]}</span>
                </span>
                <span className="mt-1 line-clamp-2 block text-[13px] text-ink-2">{e.summary}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
      {relations.length > 0 && (
        <>
          <h3 className="mt-5 text-[15px] font-extrabold">
            事件關聯 <span className="font-mono text-[12px] text-accent">{relations.length}</span>
          </h3>
          <ul className="mt-2 flex flex-col gap-1.5">
            {relations.map((r) => {
              const own = data.eventById.get(r.fromEventId)?.topicId === topic.id ? r.fromEventId : r.toEventId;
              const otherId = own === r.fromEventId ? r.toEventId : r.fromEventId;
              const other = data.eventById.get(otherId);
              const otherTopic = other ? data.topicById.get(other.topicId) : undefined;
              return (
                <li key={r.id}>
                  <button type="button" onClick={() => selectEvent(own)} disabled={!visibleIds.has(own)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-paper-strong disabled:opacity-50">
                    <span className="tag !bg-accent">{RELATION_LABELS[r.type]}</span>
                    <span className="truncate">
                      {otherTopic ? `${otherTopic.shortTitle}・` : ""}
                      {other?.title}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
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
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <span className="badge" data-testid="event-status">
          狀態：{STATUS_LABELS[event.status]}
        </span>
        {event.isFictional && <span className="badge">虛構範例</span>}
        <span className="tag">{topic.category}</span>
      </div>
      <h2 id="panel-heading" ref={headingRef} tabIndex={-1} className="display text-[24px] leading-snug break-words">
        {event.title}
      </h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12.5px]">
        <dt className="text-muted">發生時間</dt>
        <dd>
          <time dateTime={event.occurredAt}>{formatDateTime(event.occurredAt)}</time>
        </dd>
        <dt className="text-muted">首次刊出</dt>
        <dd>
          <time dateTime={event.publishedAt}>{formatDateTime(event.publishedAt)}</time>
        </dd>
        <dt className="text-muted">主題</dt>
        <dd className="break-words">{topic.title}</dd>
      </dl>
      <p className="text-[12.5px] text-muted">{STATUS_DESCRIPTIONS[event.status]}</p>
      {event.correctionNote && (
        <div role="note" className="rounded-xl border border-line bg-paper-strong p-3 text-[13.5px]">
          <p className="text-[12px] font-bold text-muted">更正說明</p>
          <p className="break-words">{event.correctionNote}</p>
        </div>
      )}
      <p className="text-[14.5px] leading-relaxed break-words">{event.summary}</p>
      {event.tags.length > 0 && (
        <ul aria-label="標籤" className="flex flex-wrap gap-1">
          {event.tags.map((tag) => (
            <li key={tag} className="badge">
              #{tag}
            </li>
          ))}
        </ul>
      )}

      <section aria-labelledby="sources-heading" className="flex flex-col gap-2">
        <h3 id="sources-heading" className="text-[15px] font-extrabold">
          來源 <span className="font-mono text-[12px] text-accent">{event.sources.length}</span>
        </h3>
        <SourceList sources={event.sources} />
        <p className="text-[12px] text-muted">本站僅提供摘要，完整內容請見原始來源。</p>
      </section>

      {relations.length > 0 && (
        <section aria-labelledby="relations-heading" className="flex flex-col gap-2">
          <h3 id="relations-heading" className="text-[15px] font-extrabold">
            人工整理的關聯 <span className="font-mono text-[12px] text-accent">{relations.length}</span>
          </h3>
          <ul className="flex flex-col gap-2">
            {relations.map((relation) => {
              const otherId = relation.fromEventId === event.id ? relation.toEventId : relation.fromEventId;
              const other = data.eventById.get(otherId);
              if (!other) return null;
              const cited = relation.sourceIds.map((id) => data.sourceById.get(id)).filter((s): s is Source => Boolean(s));
              const otherVisible = visibleIds.has(otherId);
              return (
                <li key={relation.id} className="rounded-xl border border-line bg-[#fffdf8] p-3 text-[13.5px]" data-testid="relation">
                  <p className="flex flex-wrap items-center gap-1.5">
                    <span className="tag !bg-accent">{RELATION_LABELS[relation.type]}</span>
                    <span className="text-[12px] text-muted">{RELATION_DESCRIPTIONS[relation.type]}</span>
                  </p>
                  <p className="mt-1 break-words">{relation.explanation}</p>
                  {cited.length > 0 && (
                    <div className="mt-1">
                      <p className="text-[12px] text-muted">引用來源：</p>
                      <SourceList sources={cited} compact />
                    </div>
                  )}
                  <button type="button" onClick={() => selectEvent(otherId)} disabled={!otherVisible} className="mt-2 text-left text-[13px] font-bold text-accent hover:underline disabled:text-muted">
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
