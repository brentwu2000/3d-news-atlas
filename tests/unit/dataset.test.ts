import { describe, expect, it } from "vitest";
import eventsJson from "@/data/events.json";
import relationsJson from "@/data/relations.json";
import topicsJson from "@/data/topics.json";
import { loadDataset } from "@/lib/data";
import { DatasetSchema, EventSchema, RelationSchema, SourceSchema } from "@/lib/schema";

const raw = () => structuredClone({ topics: topicsJson, events: eventsJson, relations: relationsJson });

const source = {
  id: "src-a",
  title: "來源",
  url: "https://example.org/a",
  publisher: "虛構出版社",
  publishedAt: "2026-01-01T10:00:00+08:00",
};
const event = {
  id: "event-a",
  topicId: "harborton-light-rail",
  title: "標題",
  summary: "摘要",
  occurredAt: "2026-01-01T09:00:00+08:00",
  publishedAt: "2026-01-01T10:00:00+08:00",
  sources: [source],
  tags: ["t"],
  status: "reported",
};

describe("bundled fixtures", () => {
  it("validate and meet the P3 minimums", () => {
    const result = loadDataset();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.topics.length).toBeGreaterThanOrEqual(5);
    expect(result.data.events.length).toBeGreaterThanOrEqual(15);
    expect(result.data.relations.length).toBeGreaterThanOrEqual(6);
  });

  it("are all labelled fictional, use reserved example domains and cover every status", () => {
    const result = loadDataset();
    if (!result.ok) throw new Error("fixtures invalid");
    for (const e of result.data.events) {
      expect(e.isFictional).toBe(true);
      e.sources.forEach((s) => {
        expect(new URL(s.url).hostname).toBe("example.org");
        expect(s.publisher).toContain("虛構");
      });
    }
    expect(new Set(result.data.events.map((e) => e.status))).toEqual(new Set(["reported", "verified", "disputed", "corrected"]));
  });

  it("only uses causal_claim with explicit citations", () => {
    const result = loadDataset();
    if (!result.ok) throw new Error("fixtures invalid");
    for (const r of result.data.relations.filter((r) => r.type === "causal_claim")) {
      expect(r.sourceIds.length).toBeGreaterThan(0);
      expect(r.explanation).toMatch(/聲稱/);
    }
  });

  it("sorts events chronologically", () => {
    const result = loadDataset();
    if (!result.ok) throw new Error("fixtures invalid");
    const times = result.data.events.map((e) => Date.parse(e.occurredAt));
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
});

describe("schema rejects invalid data", () => {
  it.each([
    ["date-only occurredAt", { ...event, occurredAt: "2026-01-01" }],
    ["missing offset", { ...event, occurredAt: "2026-01-01T09:00:00" }],
    ["impossible date", { ...event, occurredAt: "2026-02-30T09:00:00+08:00" }],
    ["garbage date", { ...event, occurredAt: "yesterday" }],
    ["missing occurredAt", { ...event, occurredAt: undefined }],
    ["unknown status", { ...event, status: "rumour" }],
    ["no sources", { ...event, sources: [] }],
    ["corrected without note", { ...event, status: "corrected" }],
    ["latitude without longitude", { ...event, latitude: 10 }],
    ["extra field", { ...event, severity: 5 }],
  ])("event: %s", (_, input) => {
    expect(EventSchema.safeParse(input).success).toBe(false);
  });

  it.each([
    ["javascript: url", { ...source, url: "javascript:alert(1)" }],
    ["data: url", { ...source, url: "data:text/html,hi" }],
    ["relative url", { ...source, url: "/local" }],
    ["ftp url", { ...source, url: "ftp://example.org/x" }],
  ])("source: %s", (_, input) => {
    expect(SourceSchema.safeParse(input).success).toBe(false);
  });

  it("accepts a correct corrected event", () => {
    expect(EventSchema.safeParse({ ...event, status: "corrected", correctionNote: "已更正" }).success).toBe(true);
  });

  it.each([
    ["self relation", { id: "r", fromEventId: "a", toEventId: "a", type: "related", explanation: "x", sourceIds: [] }],
    ["causal claim without citation", { id: "r", fromEventId: "a", toEventId: "b", type: "causal_claim", explanation: "x", sourceIds: [] }],
    ["unknown type", { id: "r", fromEventId: "a", toEventId: "b", type: "causes", explanation: "x", sourceIds: [] }],
  ])("relation: %s", (_, input) => {
    expect(RelationSchema.safeParse(input).success).toBe(false);
  });

  it("rejects dangling references and foreign citations across the dataset", () => {
    const unknownTopic = raw();
    unknownTopic.events[0]!.topicId = "nope";
    expect(DatasetSchema.safeParse(unknownTopic).success).toBe(false);

    const dangling = raw();
    dangling.relations[0]!.toEventId = "missing-event";
    expect(DatasetSchema.safeParse(dangling).success).toBe(false);

    const foreign = raw();
    foreign.relations[0]!.sourceIds = ["src-cc-final-vote-1"];
    expect(DatasetSchema.safeParse(foreign).success).toBe(false);

    const dupEvent = raw();
    dupEvent.events.push(structuredClone(dupEvent.events[0]!));
    expect(DatasetSchema.safeParse(dupEvent).success).toBe(false);
  });

  it("loadDataset reports readable issues instead of throwing", () => {
    const broken = raw();
    broken.events[0]!.occurredAt = "not-a-date";
    const result = loadDataset(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.join("\n")).toMatch(/events\.0\.occurredAt/);
  });
});
