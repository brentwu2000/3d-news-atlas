import { describe, expect, it } from "vitest";
import { datasetResult } from "@/lib/data";
import { EMPTY_FILTERS, filterEvents, filterEventsIgnoringDate } from "@/lib/normalize";
import { cutoffForIndex, cutoffIndex, dayKey, formatDay, isDayKey, nextPlaybackCutoff } from "@/lib/timeline";

if (!datasetResult.ok) throw new Error("fixtures invalid");
const data = datasetResult.data;

describe("search and category filters", () => {
  it("returns everything with empty filters", () => {
    expect(filterEvents(data, EMPTY_FILTERS)).toHaveLength(data.events.length);
  });

  it("matches title, summary and tags; all terms must match", () => {
    const byTitle = filterEvents(data, { ...EMPTY_FILTERS, query: "公聽會" });
    expect(byTitle.map((e) => e.id)).toContain("hr-route-hearing");
    const byTag = filterEvents(data, { ...EMPTY_FILTERS, query: "太陽能" });
    expect(byTag.map((e) => e.id)).toContain("nb-solar-pilot");
    const bySummary = filterEvents(data, { ...EMPTY_FILTERS, query: "定沙籬" });
    expect(bySummary.map((e) => e.id)).toEqual(["ss-dune-restoration"]);
    expect(filterEvents(data, { ...EMPTY_FILTERS, query: "輕軌 爭議" }).map((e) => e.id)).toEqual(["hr-cost-estimate-dispute"]);
    expect(filterEvents(data, { ...EMPTY_FILTERS, query: "不存在的字詞" })).toHaveLength(0);
  });

  it("does not match source URLs or publishers (only title/summary/tags are indexed)", () => {
    expect(filterEvents(data, { ...EMPTY_FILTERS, query: "example.org" })).toHaveLength(0);
  });

  it("filters by topic category", () => {
    const civic = filterEvents(data, { ...EMPTY_FILTERS, categories: ["公共政策"] });
    expect(civic.length).toBeGreaterThan(0);
    civic.forEach((e) => expect(e.topicId).toBe("central-council-budget"));
    const two = filterEvents(data, { ...EMPTY_FILTERS, categories: ["公共政策", "環境"] });
    expect(new Set(two.map((e) => e.topicId))).toEqual(new Set(["central-council-budget", "greenridge-reforestation", "jade-river-cleanup"]));
  });

  it("applies the date cutoff inclusively, by Asia/Taipei calendar day", () => {
    const until = "2026-02-20";
    const result = filterEvents(data, { ...EMPTY_FILTERS, until });
    result.forEach((e) => expect(dayKey(e.occurredAt) <= until).toBe(true));
    expect(result.map((e) => e.id)).toContain("hr-environmental-review");
    expect(filterEventsIgnoringDate(data, { ...EMPTY_FILTERS, until })).toHaveLength(data.events.length);
  });
});

describe("timeline helpers", () => {
  it("buckets by Asia/Taipei day, not UTC", () => {
    // 23:30 UTC on Jan 1 is already Jan 2 in Taipei.
    expect(dayKey("2026-01-01T23:30:00Z")).toBe("2026-01-02");
    expect(dayKey("2026-01-02T00:30:00+08:00")).toBe("2026-01-02");
    expect(() => dayKey("nope")).toThrow();
  });

  it("validates day keys", () => {
    expect(isDayKey("2026-03-04")).toBe(true);
    expect(isDayKey("2026-02-30")).toBe(false);
    expect(isDayKey("2026-3-4")).toBe(false);
    expect(formatDay("2026-03-04")).toMatch(/2026/);
  });

  it("maps slider indices to cutoffs (last index = no cutoff)", () => {
    const days = ["2026-01-01", "2026-02-01", "2026-03-01"];
    expect(cutoffIndex(days, null)).toBe(2);
    expect(cutoffIndex(days, "2026-02-15")).toBe(1);
    expect(cutoffIndex(days, "2025-12-31")).toBe(0);
    expect(cutoffForIndex(days, 0)).toBe("2026-01-01");
    expect(cutoffForIndex(days, 2)).toBeNull();
  });

  it("plays from the first day to the end and then stops", () => {
    const days = ["d1", "d2", "d3"];
    let state = nextPlaybackCutoff(days, null);
    expect(state).toEqual({ until: "d1", done: false });
    state = nextPlaybackCutoff(days, state.until);
    expect(state).toEqual({ until: "d2", done: false });
    state = nextPlaybackCutoff(days, state.until);
    expect(state).toEqual({ until: null, done: true });
    expect(nextPlaybackCutoff([], null).done).toBe(true);
  });

  it("dataset day list covers every event", () => {
    for (const e of data.events) expect(data.days).toContain(dayKey(e.occurredAt));
  });
});
