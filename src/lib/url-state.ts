import type { AtlasData, EventFilters } from "./normalize";
import { isDayKey } from "./timeline";

/** The slice of app state that is shareable through the URL. */
export interface UrlState {
  topicId: string | null;
  eventId: string | null;
  filters: EventFilters;
}

const KEYS = { topic: "topic", event: "event", until: "until", query: "q", categories: "cat" } as const;
const MAX_QUERY = 100;

/**
 * Parse URL params defensively: unknown ids, bad dates and unknown categories
 * are dropped rather than trusted. An event implies its own topic.
 */
export function parseUrlState(search: string, data: AtlasData): UrlState {
  const params = new URLSearchParams(search);
  const rawEvent = params.get(KEYS.event);
  const event = rawEvent ? data.eventById.get(rawEvent) : undefined;
  const rawTopic = params.get(KEYS.topic);
  const topic = event ? data.topicById.get(event.topicId) : rawTopic ? data.topicById.get(rawTopic) : undefined;
  const until = params.get(KEYS.until);
  const knownCategories = new Set(data.categories);
  const categories = (params.get(KEYS.categories) ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter((c) => knownCategories.has(c));

  return {
    topicId: topic?.id ?? null,
    eventId: event?.id ?? null,
    filters: {
      query: (params.get(KEYS.query) ?? "").slice(0, MAX_QUERY),
      categories: [...new Set(categories)],
      until: until && isDayKey(until) ? until : null,
    },
  };
}

/** Write state into `search`, preserving unrelated params (debug, quality, webgl…). Returns "?…" or "". */
export function serializeUrlState(state: UrlState, search = ""): string {
  const params = new URLSearchParams(search);
  const set = (key: string, value: string | null) => {
    if (value) params.set(key, value);
    else params.delete(key);
  };
  set(KEYS.topic, state.eventId ? null : state.topicId);
  set(KEYS.event, state.eventId);
  set(KEYS.until, state.filters.until);
  set(KEYS.query, state.filters.query.trim() || null);
  set(KEYS.categories, state.filters.categories.length ? state.filters.categories.join(",") : null);
  const out = params.toString();
  return out ? `?${out}` : "";
}
