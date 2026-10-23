import { describe, expect, it } from "vitest";
import topicsJson from "@/data/topics.json";
import { detectQuality, qualitySettings, resolveQuality } from "@/lib/quality";
import { ISLAND_PRESETS, TopicListSchema, TopicSchema } from "@/lib/schema";

const valid = {
  id: "sample-topic",
  title: "【虛構範例】測試",
  description: "測試用描述",
  category: "測試",
  seed: 1,
  theme: "city",
};

describe("TopicSchema", () => {
  it("accepts the bundled fixtures (>= 5 topics, every preset used)", () => {
    const parsed = TopicListSchema.parse(topicsJson);
    expect(parsed.length).toBeGreaterThanOrEqual(5);
    expect(new Set(parsed.map((t) => t.theme))).toEqual(new Set(ISLAND_PRESETS));
    parsed.forEach((t) => expect(t.title).toContain("虛構"));
  });

  it.each([
    ["unknown theme", { ...valid, theme: "volcano" }],
    ["negative seed", { ...valid, seed: -1 }],
    ["fractional seed", { ...valid, seed: 1.5 }],
    ["non-slug id", { ...valid, id: "Not A Slug" }],
    ["empty title", { ...valid, title: "  " }],
    ["unknown key", { ...valid, extra: true }],
    ["missing description", { ...valid, description: undefined }],
  ])("rejects %s", (_, input) => {
    expect(TopicSchema.safeParse(input).success).toBe(false);
  });

  it("rejects duplicate ids", () => {
    expect(TopicListSchema.safeParse([valid, valid]).success).toBe(false);
  });
});

describe("quality", () => {
  it("uses low preset on small touch devices", () => {
    expect(detectQuality({ coarsePointer: true, viewportWidth: 390 })).toBe("low");
    expect(detectQuality({ coarsePointer: false, viewportWidth: 1440, hardwareConcurrency: 8 })).toBe("high");
    expect(detectQuality({ coarsePointer: false, viewportWidth: 1440, deviceMemory: 2 })).toBe("low");
  });

  it("explicit preference overrides detection", () => {
    expect(resolveQuality("high", { coarsePointer: true, viewportWidth: 390 })).toBe("high");
  });

  it("caps DPR at 1.5 on desktop and 1 on low quality", () => {
    expect(qualitySettings("high").dpr[1]).toBe(1.5);
    expect(qualitySettings("low").dpr[1]).toBe(1);
    expect(qualitySettings("low").shadows).toBe(false);
  });
});
