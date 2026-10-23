import { beforeEach, describe, expect, it } from "vitest";
import { datasetResult } from "@/lib/data";
import { EMPTY_FILTERS } from "@/lib/normalize";
import { parseUrlState, serializeUrlState } from "@/lib/url-state";
import { transitions, useAtlasStore, type SelectionState } from "@/store/atlas-store";

if (!datasetResult.ok) throw new Error("fixtures invalid");
const data = datasetResult.data;
const base: SelectionState = { selectedTopicId: null, selectedEventId: null, filters: EMPTY_FILTERS, playing: true };

describe("selection transitions", () => {
  it("selecting an event selects its topic and pauses the timeline", () => {
    expect(transitions.selectEvent(base, "nb-solar-pilot", data)).toEqual({
      selectedEventId: "nb-solar-pilot",
      selectedTopicId: "northbay-industrial-transition",
      playing: false,
    });
  });

  it("selecting a topic clears the event and pauses", () => {
    const s = { ...base, selectedTopicId: "a", selectedEventId: "x" };
    expect(transitions.selectTopic(s, "central-council-budget", data)).toEqual({
      selectedTopicId: "central-council-budget",
      selectedEventId: null,
      playing: false,
    });
  });

  it("ignores unknown ids", () => {
    expect(transitions.selectTopic(base, "nope", data)).toEqual({});
    expect(transitions.selectEvent(base, "nope", data)).toEqual({});
  });

  it("back closes the event first, then the topic", () => {
    const s = { ...base, selectedTopicId: "central-council-budget", selectedEventId: "cc-final-vote" };
    expect(transitions.back(s)).toEqual({ selectedEventId: null });
    expect(transitions.back({ ...s, selectedEventId: null })).toEqual({ selectedTopicId: null });
    expect(transitions.back(base)).toEqual({});
  });

  it("deselects an event the new filters hide, keeps one they don't", () => {
    const s = { ...base, selectedTopicId: "harborton-light-rail", selectedEventId: "hr-construction-start" };
    expect(transitions.setFilters(s, { ...EMPTY_FILTERS, until: "2026-03-01" }, data).selectedEventId).toBeNull();
    expect("selectedEventId" in transitions.setFilters(s, { ...EMPTY_FILTERS, query: "開工" }, data)).toBe(false);
  });
});

describe("store integration", () => {
  beforeEach(() => {
    useAtlasStore.setState({ selectedTopicId: null, selectedEventId: null, filters: EMPTY_FILTERS, playing: false, overviewRequest: 0 });
  });

  it("requestOverview clears a selection, or bumps the canonical-overview counter", () => {
    const store = useAtlasStore.getState();
    store.selectEvent("cc-final-vote");
    store.requestOverview();
    expect(useAtlasStore.getState().selectedTopicId).toBeNull();
    expect(useAtlasStore.getState().overviewRequest).toBe(0);
    useAtlasStore.getState().requestOverview();
    expect(useAtlasStore.getState().overviewRequest).toBe(1);
  });

  it("toggles categories", () => {
    useAtlasStore.getState().toggleCategory("環境");
    expect(useAtlasStore.getState().filters.categories).toEqual(["環境"]);
    useAtlasStore.getState().toggleCategory("環境");
    expect(useAtlasStore.getState().filters.categories).toEqual([]);
  });
});

describe("URL state", () => {
  it("round-trips selection and filters, preserving unrelated params", () => {
    const state = {
      topicId: "harborton-light-rail",
      eventId: "hr-route-hearing",
      filters: { query: "輕軌", categories: ["城市交通"], until: "2026-03-01" },
    };
    const search = serializeUrlState(state, "?debug=1");
    expect(search).toContain("debug=1");
    expect(search).not.toContain("topic="); // implied by the event
    expect(parseUrlState(search, data)).toEqual(state);
  });

  it("drops unknown ids, bad dates and unknown categories", () => {
    const parsed = parseUrlState("?topic=nope&event=missing&until=2026-02-30&cat=城市交通,假分類&q=" + "x".repeat(300), data);
    expect(parsed.topicId).toBeNull();
    expect(parsed.eventId).toBeNull();
    expect(parsed.filters.until).toBeNull();
    expect(parsed.filters.categories).toEqual(["城市交通"]);
    expect(parsed.filters.query.length).toBe(100);
  });

  it("an event deep link implies its topic", () => {
    expect(parseUrlState("?event=ss-dune-restoration", data).topicId).toBe("silversand-coast-monitoring");
  });

  it("serializing an empty state removes our keys", () => {
    expect(serializeUrlState({ topicId: null, eventId: null, filters: EMPTY_FILTERS }, "?topic=x&q=y")).toBe("");
  });
});
