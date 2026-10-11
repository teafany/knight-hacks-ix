import type { Finding } from "./types";
import type { SummaryData } from "./summaryTypes";

const severityRank: Record<string, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
  NONE: 0,
};

export function prioritizeFindings(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) =>
      (severityRank[b.severity] ?? 0) - (severityRank[a.severity] ?? 0) ||
      Number(b.operator_review_required) - Number(a.operator_review_required) ||
      b.timestamp.localeCompare(a.timestamp) ||
      a.anomaly_id.localeCompare(b.anomaly_id),
  );
}

export function summarizeEvidence(data: SummaryData) {
  const areas = new Map<
    string,
    {
      id: string;
      name: string;
      count: number;
      review: number;
      priority: number;
    }
  >();
  for (const finding of data.findings) {
    const area = areas.get(finding.location_id) ?? {
      id: finding.location_id,
      name: finding.location_name,
      count: 0,
      review: 0,
      priority: 0,
    };
    area.count += 1;
    area.review += Number(finding.operator_review_required);
    area.priority += Number(
      finding.severity === "HIGH" || finding.severity === "CRITICAL",
    );
    areas.set(area.id, area);
  }
  const measurements = new Map<string, number>();
  for (const reading of data.readings) {
    measurements.set(
      reading.measurement_type,
      (measurements.get(reading.measurement_type) ?? 0) + 1,
    );
  }
  return {
    hotspots: [...areas.values()].sort(
      (a, b) =>
        b.priority - a.priority ||
        b.review - a.review ||
        b.count - a.count ||
        a.id.localeCompare(b.id),
    ),
    measurements: [...measurements.entries()].sort((a, b) => b[1] - a[1]),
    simulatedResults: data.detections.filter((row) =>
      row.result.frame_id.startsWith("SIMULATED-"),
    ).length,
    pendingResults: data.detections.filter(
      (row) => row.review_status === "pending",
    ).length,
    recentMissions: [...data.missions].sort((a, b) =>
      b.start_time.localeCompare(a.start_time),
    ),
  };
}

export function summarizeMissionDays(data: SummaryData) {
  const days = new Map<
    string,
    { day: string; missions: number; actions: number; failed: number }
  >();
  for (const mission of data.missions) {
    const day = mission.start_time.slice(0, 10);
    const row = days.get(day) ?? { day, missions: 0, actions: 0, failed: 0 };
    row.missions += 1;
    row.actions += mission.total_actions;
    row.failed += mission.failed_actions;
    days.set(day, row);
  }
  return [...days.values()]
    .sort((a, b) => a.day.localeCompare(b.day))
    .map((row) => ({
      ...row,
      success: row.actions
        ? ((row.actions - row.failed) / row.actions) * 100
        : null,
    }));
}
