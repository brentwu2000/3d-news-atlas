import type { Dataset, NewsEvent, Relation, Source, Topic } from "./schema";
import { dayKey } from "./timeline";

/**
 * Indexed, read-only view of a validated dataset plus the pure filtering
 * logic shared by the list, the 3D markers and the timeline, so all three
 * always agree on what is visible.
 */
export interface AtlasData {
  topics: readonly Topic[];
  /** Sorted by occurredAt ascending, then id. */
  events: readonly NewsEvent[];
  relations: readonly Relation[];
  topicById: ReadonlyMap<string, Topic>;
  eventById: ReadonlyMap<string, NewsEvent>;
  eventsByTopic: ReadonlyMap<string, readonly NewsEvent[]>;
  relationsByEvent: ReadonlyMap<string, readonly Relation[]>;
  sourceById: ReadonlyMap<string, Source>;
  /** Lower-cased "title summary tags" per event. */
  searchText: ReadonlyMap<string, string>;
  /** Sorted unique day keys (see timeline.dayKey) across all events. */
  days: readonly string[];
  categories: readonly string[];
}

export function compareEvents(a: NewsEvent, b: NewsEvent): number {
  return Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || a.id.localeCompare(b.id);
}

export function normalizeDataset(dataset: Dataset): AtlasData {
  const events = [...dataset.events].sort(compareEvents);
  const eventsByTopic = new Map<string, NewsEvent[]>(dataset.topics.map((t) => [t.id, []]));
  const relationsByEvent = new Map<string, Relation[]>();
  const sourceById = new Map<string, Source>();
  const searchText = new Map<string, string>();

  for (const event of events) {
    eventsByTopic.get(event.topicId)?.push(event);
    for (const source of event.sources) sourceById.set(source.id, source);
    searchText.set(event.id, [event.title, event.summary, ...event.tags].join(" ").toLocaleLowerCase("zh-TW"));
  }
  for (const relation of dataset.relations) {
    for (const id of [relation.fromEventId, relation.toEventId]) {
      const list = relationsByEvent.get(id);
      if (list) list.push(relation);
      else relationsByEvent.set(id, [relation]);
    }
  }

  return {
    topics: dataset.topics,
    events,
    relations: dataset.relations,
    topicById: new Map(dataset.topics.map((t) => [t.id, t])),
    eventById: new Map(events.map((e) => [e.id, e])),
    eventsByTopic,
    relationsByEvent,
    sourceById,
    searchText,
    days: [...new Set(events.map((e) => dayKey(e.occurredAt)))].sort(),
    categories: [...new Set(dataset.topics.map((t) => t.category))],
  };
}

export interface EventFilters {
  /** Free-text search; whitespace-separated terms must all match. */
  query: string;
  /** Selected topic categories; empty = all. */
  categories: readonly string[];
  /** Inclusive day key (YYYY-MM-DD); null = no cutoff. */
  until: string | null;
}

export const EMPTY_FILTERS: EventFilters = { query: "", categories: [], until: null };

export function searchTerms(query: string): string[] {
  return query.toLocaleLowerCase("zh-TW").split(/\s+/).filter(Boolean);
}

/** Events matching search + category, ignoring the date cutoff (the timeline's domain). */
export function filterEventsIgnoringDate(data: AtlasData, filters: EventFilters): NewsEvent[] {
  const terms = searchTerms(filters.query);
  const categories = new Set(filters.categories);
  return data.events.filter((event) => {
    if (categories.size > 0) {
      const topic = data.topicById.get(event.topicId);
      if (!topic || !categories.has(topic.category)) return false;
    }
    if (terms.length > 0) {
      const haystack = data.searchText.get(event.id) ?? "";
      if (!terms.every((term) => haystack.includes(term))) return false;
    }
    return true;
  });
}

export function filterEvents(data: AtlasData, filters: EventFilters): NewsEvent[] {
  const base = filterEventsIgnoringDate(data, filters);
  if (!filters.until) return base;
  const until = filters.until;
  return base.filter((event) => dayKey(event.occurredAt) <= until);
}
