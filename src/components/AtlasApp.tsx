"use client";

import { useEffect, useMemo, useRef } from "react";
import { AtlasClient } from "@/components/atlas/AtlasClient";
import { EventNavigator } from "@/components/ui/EventNavigator";
import { EventPanel } from "@/components/ui/EventPanel";
import { CategoryChips, SearchField } from "@/components/ui/Filters";
import { Timeline } from "@/components/ui/Timeline";
import { useMediaQuery } from "@/lib/hooks";
import { filterEvents, filterEventsIgnoringDate, type AtlasData } from "@/lib/normalize";
import { parseUrlState, serializeUrlState } from "@/lib/url-state";
import { useAtlasStore } from "@/store/atlas-store";

/** Desktop drawer width (Tailwind w-96). Also used by the camera to frame around it. */
export const DRAWER_WIDTH_PX = 384;
const DESKTOP_QUERY = "(min-width: 1024px)";

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
      const next = serializeUrlState(
        { topicId: s.selectedTopicId, eventId: s.selectedEventId, filters: s.filters },
        window.location.search,
      );
      if (next !== window.location.search) {
        window.history.replaceState(window.history.state, "", `${window.location.pathname}${next}${window.location.hash}`);
      }
    };
    write();
    const unsubscribe = store.subscribe((s, prev) => {
      if (s.selectedTopicId !== prev.selectedTopicId || s.selectedEventId !== prev.selectedEventId || s.filters !== prev.filters) write();
    });
    return unsubscribe;
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

/** When the panel closes, return focus to the list item that represents what was open. */
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
          const id = closedEvent ? `nav-event-${closedEvent}` : `nav-topic-${closedTopic}`;
          const el = document.getElementById(id);
          // Closing an event leaves the topic open: its overview heading is the better target there.
          if (closedEvent && s.selectedTopicId) document.getElementById("panel-heading")?.focus({ preventScroll: true });
          else el?.focus({ preventScroll: true });
        });
      }),
    [panelRef],
  );
}

export function AtlasApp({ data }: { data: AtlasData }) {
  const filters = useAtlasStore((s) => s.filters);
  const selectedTopicId = useAtlasStore((s) => s.selectedTopicId);
  const sheetExpanded = useAtlasStore((s) => s.sheetExpanded);
  const setSheetExpanded = useAtlasStore((s) => s.setSheetExpanded);
  const desktop = useMediaQuery(DESKTOP_QUERY, true);
  const panelRef = useRef<HTMLElement>(null);

  useUrlSync(data);
  useEscapeKey();
  useFocusRestore(panelRef);

  const visible = useMemo(() => filterEvents(data, filters), [data, filters]);
  const visibleIds = useMemo(() => new Set(visible.map((e) => e.id)), [visible]);
  const totalMatching = useMemo(() => filterEventsIgnoringDate(data, filters).length, [data, filters]);
  const panelOpen = selectedTopicId !== null;

  const sheetClasses = sheetExpanded
    ? "max-lg:absolute max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-30 max-lg:h-[78%]"
    : "max-lg:h-[40%] max-lg:shrink-0";

  const sheetToggle = (controls: string) => (
    <button
      type="button"
      aria-expanded={sheetExpanded}
      aria-controls={controls}
      onClick={() => setSheetExpanded(!sheetExpanded)}
      className="flex w-full items-center justify-center gap-2 py-1.5 text-xs text-[var(--ui-muted)] lg:hidden"
    >
      <span aria-hidden="true" className="h-1 w-10 rounded-full bg-white/30" />
      <span>{sheetExpanded ? "收合面板" : "展開面板"}</span>
    </button>
  );

  return (
    <div
      className="flex h-dvh flex-col overflow-hidden bg-atlas-backdrop text-[var(--ui-text)]"
      data-visible-count={visible.length}
    >
      {/* Mobile: [title · badge | search] / [chips]. Desktop: one row. */}
      <header className="z-20 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 border-b border-[var(--ui-border)] bg-[var(--ui-surface-solid)] px-3 py-2 lg:flex lg:gap-4 lg:px-4">
        <div className="flex min-w-0 items-center gap-2 lg:block lg:w-64 lg:shrink-0">
          <h1 className="text-base font-semibold whitespace-nowrap lg:text-lg">3D 新聞地圖</h1>
          <p className="truncate text-xs text-[var(--ui-muted)]">
            <span className="hidden lg:inline">以島嶼瀏覽主題、標記瀏覽事件 · </span>
            <span className="text-atlas-highlight">
              <span className="lg:hidden">虛構範例</span>
              <span className="hidden lg:inline">內容皆為虛構範例</span>
            </span>
          </p>
        </div>
        <SearchField className="min-w-0 lg:w-72 lg:shrink-0" />
        <CategoryChips categories={data.categories} className="col-span-2 min-w-0" />
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[20rem_minmax(0,1fr)]">
        {/* Topic / event navigation: left column on desktop, bottom sheet on mobile. */}
        <aside
          id="atlas-nav"
          aria-label="主題列表"
          className={`order-3 flex min-h-0 flex-col border-[var(--ui-border)] bg-[var(--ui-surface-solid)] max-lg:rounded-t-xl max-lg:border-t lg:order-none lg:border-r ${panelOpen ? "max-lg:hidden" : ""} ${sheetClasses}`}
        >
          {sheetToggle("atlas-nav-scroll")}
          <div id="atlas-nav-scroll" className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 lg:pt-3">
            <EventNavigator data={data} visible={visible} totalMatching={totalMatching} />
          </div>
        </aside>

        <section aria-label="3D 主題地圖" className="relative order-1 min-h-0 flex-1 lg:order-none">
          <AtlasClient data={data} occludedRightPx={panelOpen ? DRAWER_WIDTH_PX : 0} desktop={desktop} />
        </section>

        {/* Timeline: in flow between canvas and sheet on mobile (never covers the scene), overlay on desktop. */}
        <div
          className="order-2 border-t border-[var(--ui-border)] bg-[var(--ui-surface-solid)] px-2 py-1 lg:pointer-events-none lg:absolute lg:right-0 lg:bottom-0 lg:left-80 lg:z-10 lg:border-0 lg:bg-transparent lg:p-3"
          style={desktop && panelOpen ? { right: DRAWER_WIDTH_PX } : undefined}
        >
          <div className="mx-auto max-w-2xl lg:pointer-events-auto">
            <Timeline data={data} filters={filters} visibleCount={visible.length} />
          </div>
        </div>

        {/* Detail: right drawer over the canvas on desktop, bottom sheet on mobile. */}
        {panelOpen && (
          <aside
            ref={panelRef}
            id="atlas-panel"
            aria-label="詳細資訊"
            className={`order-3 flex min-h-0 flex-col border-[var(--ui-border)] bg-[var(--ui-surface-solid)] max-lg:rounded-t-xl max-lg:border-t lg:absolute lg:inset-y-0 lg:right-0 lg:z-20 lg:w-96 lg:border-l ${sheetClasses}`}
          >
            {sheetToggle("atlas-panel")}
            <EventPanel data={data} visibleIds={visibleIds} />
          </aside>
        )}
      </div>
    </div>
  );
}
