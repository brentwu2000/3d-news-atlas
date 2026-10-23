import { AtlasApp } from "@/components/AtlasApp";
import { DataErrorState } from "@/components/ui/DataErrorState";
import { datasetResult } from "@/lib/data";

/**
 * Static page. AtlasApp is a Client Component but is still server-rendered,
 * so every topic, event summary and source is in the initial HTML; only the
 * WebGL scene is client-only (dynamic import with ssr:false).
 */
export default function HomePage() {
  if (!datasetResult.ok) return <DataErrorState issues={datasetResult.issues} />;
  return <AtlasApp data={datasetResult.data} />;
}
