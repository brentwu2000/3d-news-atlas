import eventsJson from "@/data/events.json";
import relationsJson from "@/data/relations.json";
import topicsJson from "@/data/topics.json";
import { normalizeDataset, type AtlasData } from "./normalize";
import { DatasetSchema } from "./schema";

export type DatasetResult = { ok: true; data: AtlasData } | { ok: false; issues: string[] };

/** Validate raw JSON; never throws so the UI can show a useful data-error state. */
export function loadDataset(raw: unknown = { topics: topicsJson, events: eventsJson, relations: relationsJson }): DatasetResult {
  const parsed = DatasetSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.slice(0, 20).map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`),
    };
  }
  return { ok: true, data: normalizeDataset(parsed.data) };
}

/** Bundled fixtures, validated once at module load. */
export const datasetResult: DatasetResult = loadDataset();

/** Topics only (empty when data is invalid) — used by layout code and tests. */
export const topics = datasetResult.ok ? datasetResult.data.topics : [];
