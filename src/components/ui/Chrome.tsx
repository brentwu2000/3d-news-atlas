"use client";

import { TIME_PRESETS, TIMES_OF_DAY } from "@/lib/time-of-day";
import type { Topic } from "@/lib/schema";
import { useAtlasStore } from "@/store/atlas-store";
import { Icon } from "./icons";

/** Top-left brand card. Original identity for this fictional atlas. */
export function BrandCard() {
  return (
    <div className="card flex items-center gap-3 px-4 py-2.5 lg:px-5 lg:py-3">
      <p className="display text-[22px] leading-[0.95] tracking-tight lg:text-[30px]" aria-hidden="true">
        <span className="block text-accent">NEWS</span>
        <span className="block">ATLAS.</span>
      </p>
      <div className="leading-tight">
        <h1 className="display text-[15px] lg:text-[19px]">海港市事件地圖</h1>
        <p className="mt-0.5 text-[11px] font-bold tracking-wide">
          <span className="font-mono text-accent">FICTION</span> <span className="text-ink-2">虛構範例</span>
        </p>
      </div>
    </div>
  );
}

/** Large overlay heading on the map (decorative; the same text exists in the index). */
export function Hero({ count }: { count: number }) {
  return (
    <div className="pointer-events-none select-none text-paper [text-shadow:0_2px_10px_rgb(0_0_0/0.55)]" aria-hidden="true">
      <p className="display text-[84px] leading-none text-accent [text-shadow:0_3px_0_rgb(0_0_0/0.35)]">{count}</p>
      <p className="display mt-1 text-[26px] leading-tight">一格一個主題</p>
      <p className="display text-[26px] leading-tight">一格一串新聞</p>
      <p className="mt-2 text-[13px] font-semibold opacity-90">
        點開一格，
        <br />
        看看這座虛構城市發生過什麼。
      </p>
    </div>
  );
}

/** Time-of-day switch + scene feature toggles. */
export function Toolbar() {
  const timeOfDay = useAtlasStore((s) => s.timeOfDay);
  const setTimeOfDay = useAtlasStore((s) => s.setTimeOfDay);
  const showAllRelations = useAtlasStore((s) => s.showAllRelations);
  const toggleRelations = useAtlasStore((s) => s.toggleRelations);
  const timelineOpen = useAtlasStore((s) => s.timelineOpen);
  const setTimelineOpen = useAtlasStore((s) => s.setTimelineOpen);
  const paused = useAtlasStore((s) => s.animationsPaused);
  const toggleAnimations = useAtlasStore((s) => s.toggleAnimations);
  const birdseye = useAtlasStore((s) => s.birdseye);
  const toggleBirdseye = useAtlasStore((s) => s.toggleBirdseye);
  const overviewOpen = useAtlasStore((s) => s.overviewOpen);
  const setOverviewOpen = useAtlasStore((s) => s.setOverviewOpen);

  return (
    <div className="flex items-center gap-2">
      <div role="group" aria-label="時段光線" className="card flex items-center gap-0.5 rounded-full p-1">
        {TIMES_OF_DAY.map((t) => (
          <button
            key={t}
            type="button"
            className="tool !min-w-10 !px-0"
            aria-pressed={timeOfDay === t}
            onClick={() => setTimeOfDay(t)}
            title={`${TIME_PRESETS[t].label} ${TIME_PRESETS[t].clock}`}
          >
            <Icon name={t} />
            <span className="sr-only">
              {TIME_PRESETS[t].label} {TIME_PRESETS[t].clock}
            </span>
          </button>
        ))}
      </div>
      <div role="group" aria-label="地圖功能" className="card flex items-center gap-0.5 rounded-full p-1">
        <button type="button" className="tool" aria-pressed={showAllRelations} onClick={toggleRelations}>
          <Icon name="relations" size={16} />
          關聯
        </button>
        <button type="button" className="tool" aria-pressed={timelineOpen} onClick={() => setTimelineOpen(!timelineOpen)}>
          <Icon name="timeline" size={16} />
          時間軸
        </button>
        <button type="button" className="tool" aria-pressed={paused} onClick={toggleAnimations}>
          <Icon name={paused ? "play" : "pause"} size={16} />
          {paused ? "播放" : "暫停"}
        </button>
        <button type="button" className="tool" aria-pressed={birdseye} onClick={toggleBirdseye}>
          <Icon name="birdseye" size={16} />
          鳥瞰
        </button>
        <button type="button" className="tool" aria-pressed={overviewOpen} onClick={() => setOverviewOpen(!overviewOpen)}>
          <Icon name="overview" size={16} />
          總覽
        </button>
      </div>
    </div>
  );
}

/** Right-hand floating buttons: tour, reset view, index toggle, about, help. */
export function SideButtons({ vertical = true, compact = false }: { vertical?: boolean; compact?: boolean }) {
  const touring = useAtlasStore((s) => s.touring);
  const setTouring = useAtlasStore((s) => s.setTouring);
  const requestOverview = useAtlasStore((s) => s.requestOverview);
  const indexOpen = useAtlasStore((s) => s.indexOpen);
  const setIndexOpen = useAtlasStore((s) => s.setIndexOpen);
  const setDialog = useAtlasStore((s) => s.setDialog);
  const hasSelection = useAtlasStore((s) => s.selectedTopicId !== null);

  return (
    <nav aria-label="地圖操作" className={`flex gap-2 ${vertical ? "flex-col items-end" : "items-center"}`}>
      <button type="button" data-tour-toggle className="pill-btn" aria-pressed={touring} onClick={() => setTouring(!touring)} title="自動依序瀏覽每一格">
        <Icon name="tour" size={14} className="text-accent" />
        {touring ? "停止" : "導覽"}
      </button>
      <button type="button" className="pill-btn" onClick={requestOverview}>
        <Icon name="home" size={14} />
        {hasSelection ? "返回總覽" : "全景"}
      </button>
      {!compact && (
        <>
          <button type="button" className="pill-btn max-lg:hidden" aria-expanded={indexOpen} aria-controls="atlas-index" onClick={() => setIndexOpen(!indexOpen)}>
            <Icon name="list" size={14} />
            清單
          </button>
          <button type="button" className="pill-btn" onClick={() => setDialog("about")}>
            關於
          </button>
          <button type="button" className="pill-btn !px-3" onClick={() => setDialog("help")} aria-label="操作說明">
            ?
          </button>
        </>
      )}
    </nav>
  );
}

/** Numbered quick-jump grid (mouse/keyboard shortcut to each tile). */
export function QuickJump({ topics }: { topics: readonly Topic[] }) {
  const selectedTopicId = useAtlasStore((s) => s.selectedTopicId);
  const selectTopic = useAtlasStore((s) => s.selectTopic);
  return (
    <nav aria-label="快速前往主題" className="grid grid-cols-9 gap-1.5">
      {topics.map((topic, i) => (
        <button
          key={topic.id}
          type="button"
          title={topic.shortTitle}
          aria-label={`${String(i + 1).padStart(2, "0")} ${topic.shortTitle}`}
          aria-pressed={selectedTopicId === topic.id}
          onClick={() => selectTopic(topic.id)}
          className="h-8 w-8 rounded-lg bg-paper font-mono text-[11px] font-semibold text-ink shadow-md hover:bg-white aria-pressed:bg-accent aria-pressed:text-white"
        >
          {String(i + 1).padStart(2, "0")}
        </button>
      ))}
    </nav>
  );
}

export function HintBubble({ text }: { text: string }) {
  return (
    <p className="pointer-events-none flex items-center gap-2 rounded-full bg-ink/85 px-3.5 py-2 text-[13px] font-semibold text-paper shadow-lg">
      <span aria-hidden="true" className="grid h-5 w-5 place-items-center rounded-full bg-accent text-[11px] text-white">
        i
      </span>
      {text}
    </p>
  );
}
