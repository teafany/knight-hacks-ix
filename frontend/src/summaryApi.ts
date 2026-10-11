import { getJSON } from "./api";
import { apiURL } from "./apiConfig";
import { loadAllPages, type RecordPage } from "./summaryPagination";
import type { SummaryData } from "./summaryTypes";

async function loadAll<T>(path: string, signal: AbortSignal): Promise<T[]> {
  return loadAllPages<T>(path, (url) =>
    getJSON<RecordPage<T>>(apiURL(url), signal),
  );
}

async function countRecords(
  path: string,
  signal: AbortSignal,
): Promise<number> {
  return (
    await getJSON<RecordPage<unknown>>(
      apiURL(`records/${path}?limit=1`),
      signal,
    )
  ).count;
}

export async function loadSummary(
  mode: "demo" | "api",
  signal: AbortSignal,
): Promise<SummaryData> {
  if (mode === "demo")
    return getJSON<SummaryData>("/demo/summary.json", signal);
  const [
    metrics,
    missions,
    findings,
    assets,
    locations,
    readings,
    detections,
    model_summary,
    replays,
    replay_events,
    import_reports,
    lidar_scans,
  ] = await Promise.all([
    getJSON<SummaryData["metrics"]>(apiURL("metrics"), signal),
    loadAll<SummaryData["missions"][number]>("missions", signal),
    loadAll<SummaryData["findings"][number]>("findings", signal),
    loadAll<SummaryData["assets"][number]>("records/assets", signal),
    loadAll<SummaryData["locations"][number]>("records/locations", signal),
    loadAll<SummaryData["readings"][number]>("records/readings", signal),
    loadAll<SummaryData["detections"][number]>("records/ml-detections", signal),
    getJSON<SummaryData["model_summary"]>(
      apiURL("records/ml-detections/summary"),
      signal,
    ),
    countRecords("replays", signal),
    countRecords("replay-events", signal),
    countRecords("import-reports", signal),
    countRecords("lidar-scans", signal),
  ]);
  return {
    metrics,
    missions,
    findings,
    assets,
    locations,
    readings,
    detections,
    model_summary,
    record_counts: { replays, replay_events, import_reports, lidar_scans },
  };
}
