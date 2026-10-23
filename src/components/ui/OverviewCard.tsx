"use client";

import { STATUS_LABELS } from "@/lib/labels";
import type { AtlasData } from "@/lib/normalize";
import { EVENT_STATUSES, type NewsEvent } from "@/lib/schema";
import { useAtlasStore } from "@/store/atlas-store";
import { Icon } from "./icons";

/**
 * Overview statistics. Bars use one neutral colour: they show counts only,
 * never importance, truth or severity.
 */
export function OverviewCard({ data, visible }: { data: AtlasData; visible: readonly NewsEvent[] }) {
  const setOverviewOpen = useAtlasStore((s) => s.setOverviewOpen);
  const selectTopic = useAtlasStore((s) => s.selectTopic);
  const counts = data.topics.map((t) => ({ topic: t, n: visible.filter((e) => e.topicId === t.id).length }));
  const max = Math.max(1, ...counts.map((c) => c.n));
  const byStatus = EVENT_STATUSES.map((s) => ({ status: s, n: visible.filter((e) => e.status === s).length }));

  const stats: [string, number][] = [
    ["個主題", data.topics.length],
    ["則事件", visible.length],
    ["個來源連結", data.sourceById.size],
    ["條人工關聯", data.relations.length],
  ];

  return (
    <section aria-labelledby="overview-heading" className="card flex max-h-full min-h-0 flex-col">
      <div className="flex items-start justify-between px-5 pt-4">
        <div>
          <p className="kicker">Overview</p>
          <h2 id="overview-heading" className="display mt-1 text-[24px]">
            總覽
          </h2>
          <p className="text-[12.5px] font-semibold text-accent">依目前篩選條件統計</p>
        </div>
        <button type="button" onClick={() => setOverviewOpen(false)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-paper-strong" aria-label="關閉總覽">
          <Icon name="close" />
        </button>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 pb-5">
        <dl className="mt-3 grid grid-cols-2 gap-2">
          {stats.map(([label, n]) => (
            <div key={label} className="card-sunk px-3 py-2.5">
              <dd className="display text-[28px] leading-none text-accent">{n.toLocaleString("zh-TW")}</dd>
              <dt className="mt-1 text-[12px] text-muted">{label}</dt>
            </div>
          ))}
        </dl>
        <h3 className="mt-5 text-[13px] font-extrabold">各主題事件數</h3>
        <ul className="mt-2 flex flex-col gap-1">
          {counts.map(({ topic, n }, i) => (
            <li key={topic.id}>
              <button type="button" onClick={() => selectTopic(topic.id)} className="grid w-full grid-cols-[6.5rem_1fr_1.75rem] items-center gap-2 rounded px-1 py-0.5 text-left text-[12.5px] hover:bg-paper-strong">
                <span className="truncate">
                  <span className="font-mono text-[10.5px] text-accent">{String(i + 1).padStart(2, "0")}</span> {topic.shortTitle}
                </span>
                <span className="h-2 overflow-hidden rounded-full bg-paper-sunk" aria-hidden="true">
                  <span className="block h-full rounded-full bg-ink-2" style={{ width: `${(n / max) * 100}%` }} />
                </span>
                <span className="text-right font-mono text-[11px]">{n}</span>
              </button>
            </li>
          ))}
        </ul>
        <h3 className="mt-5 text-[13px] font-extrabold">查證狀態</h3>
        <ul className="mt-2 grid grid-cols-2 gap-2">
          {byStatus.map(({ status, n }) => (
            <li key={status} className="card-sunk flex items-center justify-between px-3 py-2 text-[12.5px]">
              <span>{STATUS_LABELS[status]}</span>
              <span className="font-mono font-semibold">{n}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
