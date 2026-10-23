import { z } from "zod";

/**
 * Runtime-validated data model (CLAUDE.md "Data model").
 *
 * Extensions beyond the original spec, all needed for editorial safety:
 * - Source.id: lets relations cite specific sources via `sourceIds`.
 * - Event.correctionNote: required when status is "corrected" so corrections are explained.
 * - Event.isFictional: fixtures must be explicitly labelled as fictional samples.
 */

/** One diorama theme per hex tile (see tile-generator). */
export const ISLAND_PRESETS = [
  "city",
  "forest",
  "industry",
  "coast",
  "civic",
  "port",
  "market",
  "river",
  "school",
  "housing",
  "fair",
  "hospital",
  "energy",
  "oldtown",
  "reservoir",
  "farm",
  "stadium",
  "tech",
  "mountain",
] as const;
export const IslandPresetSchema = z.enum(ISLAND_PRESETS);
export type IslandPreset = z.infer<typeof IslandPresetSchema>;

export const EVENT_STATUSES = ["reported", "verified", "disputed", "corrected"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const RELATION_TYPES = ["related", "chronological", "causal_claim"] as const;
export type RelationType = (typeof RELATION_TYPES)[number];

const slug = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "id must be a lowercase slug");

/**
 * ISO 8601 date-time with an explicit offset (Z or ±hh:mm). Date-only strings
 * and "local" times are rejected so timeline ordering is unambiguous.
 */
export const IsoDateTimeSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/, "must be ISO 8601 with time and offset")
  .refine((value) => !Number.isNaN(Date.parse(value)), "not a real date")
  .refine((value) => {
    // Reject impossible calendar dates that Date.parse silently rolls over (e.g. 2026-02-30).
    const [y, m, d] = value.slice(0, 10).split("-").map(Number) as [number, number, number];
    const check = new Date(Date.UTC(y, m - 1, d));
    return check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d;
  }, "not a real calendar date");

/** Only http(s) links may ever be rendered. */
export const SafeUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:";
    } catch {
      return false;
    }
  }, "url must be an absolute http(s) URL");

const text = (max: number) => z.string().trim().min(1).max(max);

export const TopicSchema = z
  .object({
    id: slug,
    /** Short tile label (map pill, index list); keep it to a few characters. */
    shortTitle: text(8),
    title: text(120),
    description: text(600),
    category: text(40),
    /** Unsigned 32-bit integer driving deterministic island generation. */
    seed: z.number().int().nonnegative().max(0xffffffff),
    theme: IslandPresetSchema,
    locationLabel: text(80).optional(),
  })
  .strict();
export type Topic = z.infer<typeof TopicSchema>;

export const SourceSchema = z
  .object({
    id: slug,
    title: text(200),
    url: SafeUrlSchema,
    publisher: text(120),
    publishedAt: IsoDateTimeSchema,
  })
  .strict();
export type Source = z.infer<typeof SourceSchema>;

export const EventSchema = z
  .object({
    id: slug,
    topicId: slug,
    title: text(160),
    /** Short original summary; never the source article text. */
    summary: text(600),
    occurredAt: IsoDateTimeSchema,
    publishedAt: IsoDateTimeSchema,
    sources: z.array(SourceSchema).min(1).max(12),
    tags: z.array(text(32)).max(12),
    status: z.enum(EVENT_STATUSES),
    correctionNote: text(400).optional(),
    isFictional: z.boolean().optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
  })
  .strict()
  .superRefine((event, ctx) => {
    if (event.status === "corrected" && !event.correctionNote) {
      ctx.addIssue({ code: "custom", message: "corrected events need a correctionNote", path: ["correctionNote"] });
    }
    if ((event.latitude === undefined) !== (event.longitude === undefined)) {
      ctx.addIssue({ code: "custom", message: "latitude and longitude must be given together", path: ["latitude"] });
    }
  });
export type NewsEvent = z.infer<typeof EventSchema>;

export const RelationSchema = z
  .object({
    id: slug,
    fromEventId: slug,
    toEventId: slug,
    type: z.enum(RELATION_TYPES),
    explanation: text(400),
    sourceIds: z.array(slug).max(12),
  })
  .strict()
  .superRefine((relation, ctx) => {
    if (relation.fromEventId === relation.toEventId) {
      ctx.addIssue({ code: "custom", message: "relation cannot point to itself", path: ["toEventId"] });
    }
    // Causal links are only ever curated claims and must cite where the claim comes from.
    if (relation.type === "causal_claim" && relation.sourceIds.length === 0) {
      ctx.addIssue({ code: "custom", message: "causal_claim relations must cite at least one source", path: ["sourceIds"] });
    }
  });
export type Relation = z.infer<typeof RelationSchema>;

function uniqueIds<T extends { id: string }>(label: string) {
  return (items: T[], ctx: z.RefinementCtx) => {
    const seen = new Set<string>();
    items.forEach((item, index) => {
      if (seen.has(item.id)) ctx.addIssue({ code: "custom", message: `duplicate ${label} id "${item.id}"`, path: [index, "id"] });
      seen.add(item.id);
    });
  };
}

export const TopicListSchema = z.array(TopicSchema).min(1).superRefine(uniqueIds("topic"));
export const EventListSchema = z.array(EventSchema).superRefine(uniqueIds("event"));
export const RelationListSchema = z.array(RelationSchema).superRefine(uniqueIds("relation"));

/** Whole dataset with cross-reference checks. */
export const DatasetSchema = z
  .object({ topics: TopicListSchema, events: EventListSchema, relations: RelationListSchema })
  .superRefine((data, ctx) => {
    const topicIds = new Set(data.topics.map((t) => t.id));
    const eventsById = new Map(data.events.map((e) => [e.id, e]));
    const sourceIds = new Set<string>();
    data.events.forEach((event, i) => {
      if (!topicIds.has(event.topicId)) {
        ctx.addIssue({ code: "custom", message: `event "${event.id}" references unknown topic "${event.topicId}"`, path: ["events", i, "topicId"] });
      }
      event.sources.forEach((source, j) => {
        if (sourceIds.has(source.id)) {
          ctx.addIssue({ code: "custom", message: `duplicate source id "${source.id}"`, path: ["events", i, "sources", j, "id"] });
        }
        sourceIds.add(source.id);
      });
    });
    data.relations.forEach((relation, i) => {
      for (const key of ["fromEventId", "toEventId"] as const) {
        if (!eventsById.has(relation[key])) {
          ctx.addIssue({ code: "custom", message: `relation "${relation.id}" references unknown event "${relation[key]}"`, path: ["relations", i, key] });
        }
      }
      // A relation may only cite sources attached to one of its two events.
      const allowed = new Set(
        [relation.fromEventId, relation.toEventId].flatMap((id) => eventsById.get(id)?.sources.map((s) => s.id) ?? []),
      );
      relation.sourceIds.forEach((sourceId, j) => {
        if (!allowed.has(sourceId)) {
          ctx.addIssue({
            code: "custom",
            message: `relation "${relation.id}" cites "${sourceId}", which is not a source of either event`,
            path: ["relations", i, "sourceIds", j],
          });
        }
      });
    });
  });
export type Dataset = z.infer<typeof DatasetSchema>;
