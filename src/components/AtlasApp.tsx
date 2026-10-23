"use client";

import { useEffect, useMemo, useRef } from "react";
import { AtlasClient } from "@/components/atlas/AtlasClient";
import { BrandCard, Hero, HintBubble, QuickJump, SideButtons, Toolbar } from "@/components/ui/Chrome";
import { AboutDialog, HelpDialog, Onboarding, useOnboardingOnce } from "@/components/ui/Dialogs";
import { EventIndex } from "@/components/ui/EventIndex";
import { EventPanel } from "@/components/ui/EventPanel";
import { OverviewCard } from "@/components/ui/OverviewCard";
import { Timeline } from "@/components/ui/Timeline";
import { useMediaQuery } from "@/lib/hooks";
import { filterEvents, filterEventsIgnoringDate, type AtlasData } from "@/lib/normalize";
import { parseUrlState, serializeUrlState } from "@/lib/url-state";
import { useAtlasStore } from "@/store/atlas-store";

/** Desktop detail card width + margin. The camera frames focused tiles around it. */
export const DRAWER_WIDTH_PX = 400;
const DESKTOP_QUERY = "(min-width: 1024px)";
/** Guided tour: milliseconds per tile. */
const TOUR_STEP_MS = 5000;

/**
 * URL ⇄ store sync. Reads the URL once after hydration (so server and first
 * client render match), then mirrors store changes with history.replaceState.
 * Writing only when the serialized string differs prevents feedback loops.
 */
function useUrlSync(data: AtlasData) {
  useEffect(() => {
    const store = useAtlasStore;
    store.getState().applyUrlState(parseUrlState(window.location.search, data));
    const write = () => {
      const s = store.getState();
      const next = serializeUrlState({ topicId: s.selectedTopicId, eventId: s.selectedEventId, filters: s.filters }, window.location.search);
      if (next !== window.location.search) {
        window.history.replaceState(window.history.state, "", `${window.location.pathname}${next}${window.location.hash}`);
      }
    };
    write();
    return store.subscribe((s, prev) => {
      if (s.selectedTopicId !== prev.selectedTopicId || s.selectedEventId !== prev.selectedEventId || s.filters !== prev.filters) write();
    });
  }, [data]);
}

/** Escape closes the event, then the topic. Inside text fields Escape keeps its native meaning. */
function useEscapeKey() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true]")) return;
      const s = useAtlasStore.getState();
      if (s.selectedEventId || s.selectedTopicId) {
        e.preventDefault();
        s.back();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

/** When the panel closes, return focus to the index item that represents what was open. */
function useFocusRestore(panelRef: React.RefObject<HTMLElement | null>) {
  useEffect(
    () =>
      useAtlasStore.subscribe((s, prev) => {
        const closedEvent = prev.selectedEventId && !s.selectedEventId ? prev.selectedEventId : null;
        const closedTopic = prev.selectedTopicId && !s.selectedTopicId ? prev.selectedTopicId : null;
        if (!closedEvent && !closedTopic) return;
        const active = document.activeElement;
        const focusWasInPanel = !active || active === document.body || (panelRef.current?.contains(active) ?? false);
        if (!focusWasInPanel) return;
        requestAnimationFrame(() => {
          if (closedEvent && s.selectedTopicId) document.getElementById("panel-heading")?.focus({ preventScroll: true });
          else document.getElementById(`nav-topic-${closedTopic ?? ""}`)?.focus({ preventScroll: true });
        });
      }),
    [panelRef],
  );
}

/** Guided tour: step through tiles until the user interacts. */
function useTour(data: AtlasData) {
  const touring = useAtlasStore((s) => s.touring);
  useEffect(() => {
    if (!touring) return;
    const step = () => {
      const s = useAtlasStore.getState();
      const i = data.topics.findIndex((t) => t.id === s.selectedTopicId);
      const next = data.topics[(i + 1) % data.topics.length];
      if (next) s.selectTopic(next.id);
    };
    step();
    const timer = window.setInterval(step, TOUR_STEP_MS);
    const stop = (e: Event) => {
      // Clicks on the tour button itself toggle the tour; any other interaction stops it.
      if ((e.target as HTMLElement | null)?.closest?.("[data-tour-toggle]")) return;
      useAtlasStore.getState().setTouring(false);
    };
    window.addEventListener("pointerdown", stop, true);
    window.addEventListener("keydown", stop, true);
    window.addEventListener("wheel", stop, { capture: true, passive: true });
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pointerdown", stop, true);
      window.removeEventListener("keydown", stop, true);
      window.removeEventListener("wheel", stop, true);
    };
  }, [touring, data]);
}

export function AtlasApp({ data }: { data: AtlasData }) {
  const filters = useAtlasStore((s) => s.filters);
  const selectedTopicId = useAtlasStore((s) => s.selectedTopicId);
  const sheetExpanded = useAtlasStore((s) => s.sheetExpanded);
  const setSheetExpanded = useAtlasStore((s) => s.setSheetExpanded);
  const indexOpen = useAtlasStore((s) => s.indexOpen);
  const overviewOpen = useAtlasStore((s) => s.overviewOpen);
  const timelineOpen = useAtlasStore((s) => s.timelineOpen);
  const setTimelineOpen = useAtlasStore((s) => s.setTimelineOpen);
  const dialog = useAtlasStore((s) => s.dialog);
  const desktop = useMediaQuery(DESKTOP_QUERY, true);
  const panelRef = useRef<HTMLElement>(null);

  useUrlSync(data);
  useEscapeKey();
  useFocusRestore(panelRef);
  useTour(data);
  useOnboardingOnce();

  const visible = useMemo(() => filterEvents(data, filters), [data, filters]);
  const visibleIds = useMemo(() => new Set(visible.map((e) => e.id)), [visible]);
  const totalMatching = useMemo(() => filterEventsIgnoringDate(data, filters).length, [data, filters]);
  const panelOpen = selectedTopicId !== null;

  const sheet = sheetExpanded ? "max-lg:absolute max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-30 max-lg:h-[80%]" : "max-lg:h-[44%] max-lg:shrink-0";
  const sheetToggle = (controls: string) => (
    <button
      type="button"
      aria-expanded={sheetExpanded}
      aria-controls={controls}
      onClick={() => setSheetExpanded(!sheetExpanded)}
      className="flex w-full items-center justify-center gap-2 pt-2 pb-1 text-[12px] text-muted lg:hidden"
    >
      <span aria-hidden="true" className="h-1 w-10 rounded-full bg-ink/25" />
      <span>{sheetExpanded ? "收合面板" : "展開面板"}</span>
    </button>
  );

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-[var(--scene-bg)] lg:flex-row" data-visible-count={visible.length}>
      {/* ---------------- Map area ---------------- */}
      {/* Mobile: fixed 56% height so expanding/collapsing the sheet never resizes the canvas. */}
      <section aria-label="3D 城市地圖" className="relative min-h-0 min-w-0 flex-1 max-lg:h-[56%] max-lg:flex-none">
        <AtlasClient data={data} occludedRightPx={panelOpen ? DRAWER_WIDTH_PX : 0} desktop={desktop} />

        <div className="pointer-events-none absolute inset-0 z-10">
          {/* Top row: brand + toolbar. */}
          <div className="absolute inset-x-0 top-0 flex items-start gap-3 p-3 lg:p-4">
            <div className="pointer-events-auto shrink-0">
              <BrandCard />
            </div>
            <div className="pointer-events-auto min-w-0 overflow-x-auto pb-1 max-lg:hidden">
              <Toolbar />
            </div>
          </div>
          {/* Mobile: one horizontally scrolling strip with every control. */}
          <div className="pointer-events-auto absolute inset-x-0 top-[80px] overflow-x-auto px-3 pb-1 lg:hidden">
            <div className="flex w-max gap-2">
              <Toolbar />
              <SideButtons vertical={false} />
            </div>
          </div>

          {/* Desktop: hero heading + right-hand floating buttons. */}
          {!overviewOpen && (
            <div className="absolute top-[118px] left-6 max-lg:hidden">
              <Hero count={data.topics.length} />
            </div>
          )}
          <div className="pointer-events-auto absolute top-4 right-4 max-lg:hidden">
            <SideButtons vertical={!panelOpen} compact={panelOpen} />
          </div>

          {overviewOpen && (
            <div className="pointer-events-auto absolute top-[100px] bottom-4 left-4 w-[340px] max-lg:inset-x-3 max-lg:top-[130px] max-lg:bottom-3 max-lg:w-auto">
              <OverviewCard data={data} visible={visible} />
            </div>
          )}

          {timelineOpen && (
            <div
              className="card pointer-events-auto absolute bottom-4 left-1/2 w-[min(560px,calc(100%-2rem))] -translate-x-1/2 p-4 max-lg:bottom-3"
              style={desktop && panelOpen ? { left: `calc((100% - ${DRAWER_WIDTH_PX}px) / 2)` } : undefined}
            >
              <Timeline data={data} filters={filters} visibleCount={visible.length} onClose={() => setTimelineOpen(false)} />
            </div>
          )}

          {!panelOpen && !timelineOpen && (
            <div className="pointer-events-auto absolute right-4 bottom-4 flex flex-col items-end gap-2 max-lg:hidden">
              <HintBubble text="提示・點一格，看看發生過什麼" />
              <QuickJump topics={data.topics} />
            </div>
          )}
        </div>

        {/* Desktop detail card (floats over the map's right side). */}
        {panelOpen && desktop && (
          <aside
            ref={panelRef}
            id="atlas-panel"
            aria-label="詳細資訊"
            className="card absolute top-[76px] right-4 bottom-4 z-20 flex min-h-0 w-[380px] flex-col overflow-hidden"
          >
            <EventPanel data={data} visibleIds={visibleIds} />
          </aside>
        )}
      </section>

      {/* ---------------- Index (desktop sidebar / mobile sheet) ---------------- */}
      {(indexOpen || !desktop) && !(panelOpen && !desktop) && (
        <aside
          id="atlas-index"
          aria-label="主題與事件清單"
          className={`z-20 flex min-h-0 flex-col bg-paper max-lg:rounded-t-2xl max-lg:shadow-[0_-8px_24px_rgb(0_0_0/0.3)] lg:w-[360px] lg:shrink-0 ${sheet}`}
        >
          {sheetToggle("atlas-index")}
          <EventIndex data={data} visible={visible} totalMatching={totalMatching} />
        </aside>
      )}

      {/* Mobile detail sheet. */}
      {panelOpen && !desktop && (
        <aside ref={panelRef} id="atlas-panel" aria-label="詳細資訊" className={`z-20 flex min-h-0 flex-col rounded-t-2xl bg-paper shadow-[0_-8px_24px_rgb(0_0_0/0.3)] ${sheet}`}>
          {sheetToggle("atlas-panel")}
          <EventPanel data={data} visibleIds={visibleIds} />
        </aside>
      )}

      {dialog === "onboarding" && <Onboarding />}
      {dialog === "help" && <HelpDialog />}
      {dialog === "about" && <AboutDialog />}
    </div>
  );
}
