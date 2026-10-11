import type { SummaryData } from "./summaryTypes";
import type { Severity } from "./types";

export type SummarySelection = {
  section: "all" | "missions" | "findings" | "models" | "evidence";
  severity?: Severity;
  location?: string;
  model?: string;
  day?: string;
  review?: boolean;
};

export function readSummarySelection(search: string): SummarySelection | null {
  const params = new URLSearchParams(search);
  const section = params.get("view");
  if (
    !section ||
    !["all", "missions", "findings", "models", "evidence"].includes(section)
  )
    return null;
  const selection: SummarySelection = {
    section: section as SummarySelection["section"],
  };
  const severity = params.get("severity");
  if (section === "findings") {
    if (
      severity &&
      ["CRITICAL", "HIGH", "MEDIUM", "LOW", "NONE"].includes(severity)
    )
      selection.severity = severity as Severity;
    if (params.get("location")) selection.location = params.get("location")!;
    if (params.get("review") === "true") selection.review = true;
  }
  if (section === "models" && params.get("model"))
    selection.model = params.get("model")!;
  if (
    section === "missions" &&
    /^\d{4}-\d{2}-\d{2}$/.test(params.get("day") ?? "")
  )
    selection.day = params.get("day")!;
  return selection;
}

export function summarySearch(
  selection: SummarySelection | null,
  mode: "demo" | "api",
) {
  const params = new URLSearchParams();
  if (mode === "api") params.set("source", "api");
  if (selection) {
    params.set("view", selection.section);
    for (const key of [
      "severity",
      "location",
      "model",
      "day",
      "review",
    ] as const) {
      if (selection[key] !== undefined) params.set(key, String(selection[key]));
    }
  }
  return params.size ? `?${params}` : "";
}

export function selectSummaryRecords(
  data: SummaryData,
  selection: SummarySelection | null,
) {
  return {
    findings: data.findings.filter(
      (row) =>
        (!selection?.severity || row.severity === selection.severity) &&
        (!selection?.location || row.location_id === selection.location) &&
        (!selection?.review || row.operator_review_required),
    ),
    missions: data.missions.filter(
      (row) => !selection?.day || row.start_time.slice(0, 10) === selection.day,
    ),
  };
}
