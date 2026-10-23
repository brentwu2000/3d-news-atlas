import { create } from "zustand";
import { datasetResult } from "@/lib/data";
import { EMPTY_FILTERS, filterEvents, type AtlasData, type EventFilters } from "@/lib/normalize";
import type { QualityPreference } from "@/lib/quality";
import type { TimeOfDay } from "@/lib/time-of-day";
import type { UrlState } from "@/lib/url-state";

export type SceneStatus = "loading" | "ready" | "error" | "context-lost";
export type CameraMode = "overview" | "focusing" | "focused" | "returning";
export type DialogKind = "none" | "onboarding" | "help" | "about";

export interface SelectionState {
  selectedTopicId: string | null;
  selectedEventId: string | null;
  filters: EventFilters;
  playing: boolean;
}

/**
 * Pure transition rules (unit-tested). Any selection pauses the timeline;
 * a selected event that the filters hide is deselected so the panel never
 * shows something the list and the 3D world don't.
 */
export const transitions = {
  selectTopic(state: SelectionState, topicId: string | null, data: AtlasData): Partial<SelectionState> {
    if (topicId !== null && !data.topicById.has(topicId)) return {};
    return { selectedTopicId: topicId, selectedEventId: null, playing: topicId ? false : state.playing };
  },
  selectEvent(state: SelectionState, eventId: string | null, data: AtlasData): Partial<SelectionState> {
    if (eventId === null) return { selectedEventId: null };
    const event = data.eventById.get(eventId);
    if (!event) return {};
    return { selectedEventId: eventId, selectedTopicId: event.topicId, playing: false };
  },
  /** Escape / back: close the event first, then leave the topic. */
  back(state: SelectionState): Partial<SelectionState> {
    if (state.selectedEventId) return { selectedEventId: null };
    if (state.selectedTopicId) return { selectedTopicId: null };
    return {};
  },
  setFilters(state: SelectionState, filters: EventFilters, data: AtlasData): Partial<SelectionState> {
    const next: Partial<SelectionState> = { filters };
    if (state.selectedEventId) {
      const visible = filterEvents(data, filters).some((e) => e.id === state.selectedEventId);
      if (!visible) next.selectedEventId = null;
    }
    return next;
  },
};

interface AtlasState extends SelectionState {
  data: AtlasData | null;
  hoveredTopicId: string | null;
  hoveredEventId: string | null;
  cameraMode: CameraMode;
  sheetExpanded: boolean;
  /** Purely atmospheric lighting preset. */
  timeOfDay: TimeOfDay;
  /** Draw every curated relation, not only those of the selected event. */
  showAllRelations: boolean;
  /** Pause idle animations (train, smoke, particles). */
  animationsPaused: boolean;
  /** Near top-down overview camera. */
  birdseye: boolean;
  /** Guided tour cycling through tiles. */
  touring: boolean;
  indexOpen: boolean;
  overviewOpen: boolean;
  timelineOpen: boolean;
  dialog: DialogKind;
  qualityPreference: QualityPreference;
  sceneStatus: SceneStatus;
  /** Monotonic counter; CameraDirector flies to the canonical overview whenever it changes. */
  overviewRequest: number;
  /** Bumped to remount the Canvas after an error or context loss. */
  sceneGeneration: number;

  selectTopic: (topicId: string | null) => void;
  selectEvent: (eventId: string | null) => void;
  back: () => void;
  hoverTopic: (topicId: string | null) => void;
  hoverEvent: (eventId: string | null) => void;
  setQuery: (query: string) => void;
  toggleCategory: (category: string) => void;
  setUntil: (until: string | null) => void;
  clearFilters: () => void;
  setPlaying: (playing: boolean) => void;
  applyUrlState: (state: UrlState) => void;
  setCameraMode: (mode: CameraMode) => void;
  setSheetExpanded: (expanded: boolean) => void;
  setTimeOfDay: (time: TimeOfDay) => void;
  toggleRelations: () => void;
  toggleAnimations: () => void;
  toggleBirdseye: () => void;
  setTouring: (touring: boolean) => void;
  setIndexOpen: (open: boolean) => void;
  setOverviewOpen: (open: boolean) => void;
  setTimelineOpen: (open: boolean) => void;
  setDialog: (dialog: DialogKind) => void;
  setQualityPreference: (preference: QualityPreference) => void;
  setSceneStatus: (status: SceneStatus) => void;
  /** With a selection: clear it (camera returns to the previous orbit). Without: canonical overview. */
  requestOverview: () => void;
  retryScene: () => void;
}

export const useAtlasStore = create<AtlasState>()((set, get) => {
  const data = datasetResult.ok ? datasetResult.data : null;
  const withData = (fn: (state: AtlasState, data: AtlasData) => Partial<SelectionState>) => {
    const d = get().data;
    if (d) set(fn(get(), d));
  };

  return {
    data,
    selectedTopicId: null,
    selectedEventId: null,
    filters: EMPTY_FILTERS,
    playing: false,
    hoveredTopicId: null,
    hoveredEventId: null,
    cameraMode: "overview",
    sheetExpanded: false,
    timeOfDay: "night",
    showAllRelations: false,
    animationsPaused: false,
    birdseye: false,
    touring: false,
    indexOpen: true,
    overviewOpen: false,
    timelineOpen: false,
    dialog: "none",
    qualityPreference: "auto",
    sceneStatus: "loading",
    overviewRequest: 0,
    sceneGeneration: 0,

    selectTopic: (topicId) => withData((s, d) => transitions.selectTopic(s, topicId, d)),
    selectEvent: (eventId) => withData((s, d) => transitions.selectEvent(s, eventId, d)),
    back: () => set(transitions.back(get())),
    hoverTopic: (hoveredTopicId) => {
      if (get().hoveredTopicId !== hoveredTopicId) set({ hoveredTopicId });
    },
    hoverEvent: (hoveredEventId) => {
      if (get().hoveredEventId !== hoveredEventId) set({ hoveredEventId });
    },
    setQuery: (query) => withData((s, d) => transitions.setFilters(s, { ...s.filters, query }, d)),
    toggleCategory: (category) =>
      withData((s, d) => {
        const has = s.filters.categories.includes(category);
        const categories = has ? s.filters.categories.filter((c) => c !== category) : [...s.filters.categories, category];
        return transitions.setFilters(s, { ...s.filters, categories }, d);
      }),
    setUntil: (until) => withData((s, d) => transitions.setFilters(s, { ...s.filters, until }, d)),
    clearFilters: () => withData((s, d) => ({ ...transitions.setFilters(s, EMPTY_FILTERS, d), playing: false })),
    setPlaying: (playing) => set({ playing }),
    applyUrlState: (url) =>
      withData((s, d) => {
        const filtered = transitions.setFilters({ ...s, selectedEventId: url.eventId }, url.filters, d);
        return {
          selectedTopicId: url.topicId,
          selectedEventId: url.eventId,
          ...filtered,
          playing: false,
        };
      }),
    setCameraMode: (cameraMode) => {
      if (get().cameraMode !== cameraMode) set({ cameraMode });
    },
    setSheetExpanded: (sheetExpanded) => set({ sheetExpanded }),
    setTimeOfDay: (timeOfDay) => set({ timeOfDay }),
    toggleRelations: () => set((s) => ({ showAllRelations: !s.showAllRelations })),
    toggleAnimations: () => set((s) => ({ animationsPaused: !s.animationsPaused })),
    toggleBirdseye: () => set((s) => ({ birdseye: !s.birdseye, selectedTopicId: null, selectedEventId: null, touring: false })),
    setTouring: (touring) => set({ touring }),
    setIndexOpen: (indexOpen) => set({ indexOpen }),
    setOverviewOpen: (overviewOpen) => set({ overviewOpen }),
    setTimelineOpen: (timelineOpen) => set({ timelineOpen }),
    setDialog: (dialog) => set({ dialog }),
    setQualityPreference: (qualityPreference) => set({ qualityPreference, sceneStatus: "loading" }),
    setSceneStatus: (sceneStatus) => set({ sceneStatus }),
    requestOverview: () => {
      const s = get();
      if (s.selectedTopicId || s.selectedEventId) set({ selectedTopicId: null, selectedEventId: null, touring: false });
      else set({ overviewRequest: s.overviewRequest + 1, birdseye: false, touring: false });
    },
    retryScene: () => set((s) => ({ sceneStatus: "loading", sceneGeneration: s.sceneGeneration + 1 })),
  };
});
