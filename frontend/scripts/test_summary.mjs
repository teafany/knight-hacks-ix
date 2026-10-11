import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  prioritizeFindings,
  summarizeEvidence,
  summarizeMissionDays,
} from "../src/summaryInsights.ts";
import { loadAllPages } from "../src/summaryPagination.ts";
import {
  readSummarySelection,
  selectSummaryRecords,
  summarySearch,
} from "../src/summaryViews.ts";

const snapshot = JSON.parse(
  await readFile(
    new URL("../public/demo/summary.json", import.meta.url),
    "utf8",
  ),
);

test("bundled summary includes saved mock AI and consistent inspection totals", () => {
  const result = summarizeEvidence(snapshot);
  assert.equal(result.simulatedResults, 9);
  assert.equal(
    snapshot.model_summary.total_detections,
    snapshot.detections.length,
  );
  assert.equal(snapshot.metrics.total_missions, snapshot.missions.length);
  assert.equal(snapshot.metrics.total_anomalies, snapshot.findings.length);
  assert.equal(snapshot.metrics.total_readings, snapshot.readings.length);
  assert.equal(
    result.measurements.reduce((total, [, count]) => total + count, 0),
    snapshot.readings.length,
  );
  assert.equal(
    result.hotspots.reduce((total, area) => total + area.count, 0),
    snapshot.findings.length,
  );
  assert.equal(
    result.hotspots.reduce((total, area) => total + area.priority, 0),
    snapshot.metrics.anomalies_by_severity.HIGH +
      snapshot.metrics.anomalies_by_severity.CRITICAL,
  );
  assert.equal(
    snapshot.findings.filter((row) => row.anomaly_id.startsWith("SIM-AI-"))
      .length,
    6,
  );
});

test("review priority uses severity before review status, without mutating source records", () => {
  const findings = [
    {
      anomaly_id: "LOW",
      severity: "LOW",
      operator_review_required: true,
      timestamp: "2026-09-10",
    },
    {
      anomaly_id: "HIGH",
      severity: "HIGH",
      operator_review_required: false,
      timestamp: "2026-09-09",
    },
    {
      anomaly_id: "CRITICAL",
      severity: "CRITICAL",
      operator_review_required: false,
      timestamp: "2026-09-08",
    },
    {
      anomaly_id: "REVIEW",
      severity: "HIGH",
      operator_review_required: true,
      timestamp: "2026-09-07",
    },
  ];
  assert.deepEqual(
    prioritizeFindings(findings).map((row) => row.anomaly_id),
    ["CRITICAL", "REVIEW", "HIGH", "LOW"],
  );
  assert.equal(findings[0].anomaly_id, "LOW");
});

test("summary loads every page and keeps requests on the configured API path", async () => {
  const calls = [];
  const results = await loadAllPages("records/readings", async (path) => {
    calls.push(path);
    const offset = Number(
      new URL(path, "https://test.example/api/").searchParams.get("offset"),
    );
    const rows = Array.from(
      { length: Math.min(100, 225 - offset) },
      (_, index) => offset + index,
    );
    return {
      count: 225,
      previous: null,
      results: rows,
      next:
        offset + rows.length < 225
          ? "http://internal-backend/api/records/readings?offset=next"
          : null,
    };
  });
  assert.equal(results.length, 225);
  assert.equal(results.at(-1), 224);
  assert.deepEqual(calls, [
    "records/readings?limit=100&offset=0",
    "records/readings?limit=100&offset=100",
    "records/readings?limit=100&offset=200",
  ]);
});

test("pagination reports stalled results instead of looping indefinitely", async () => {
  await assert.rejects(
    loadAllPages("findings", async () => ({
      count: 1,
      previous: null,
      next: "next",
      results: [],
    })),
    /stopped making progress/,
  );
});

test("empty record sets produce empty summaries", () => {
  const result = summarizeEvidence({
    ...snapshot,
    findings: [],
    readings: [],
    missions: [],
    detections: [],
  });
  assert.deepEqual(result.hotspots, []);
  assert.deepEqual(result.measurements, []);
  assert.equal(result.simulatedResults, 0);
  assert.equal(result.pendingResults, 0);
});

test("daily success is weighted by actions, with missing actions shown as gaps", () => {
  const days = summarizeMissionDays({
    ...snapshot,
    missions: [
      {
        start_time: "2026-09-02T12:00:00Z",
        total_actions: 0,
        failed_actions: 0,
      },
      {
        start_time: "2026-09-01T12:00:00Z",
        total_actions: 10,
        failed_actions: 2,
      },
      {
        start_time: "2026-09-01T14:00:00Z",
        total_actions: 90,
        failed_actions: 0,
      },
    ],
  });
  assert.deepEqual(days, [
    { day: "2026-09-01", missions: 2, actions: 100, failed: 2, success: 98 },
    { day: "2026-09-02", missions: 1, actions: 0, failed: 0, success: null },
  ]);
  assert.deepEqual(summarizeMissionDays({ ...snapshot, missions: [] }), []);
});

test("chart drill-downs contain exactly the records represented by each aggregate", () => {
  for (const day of summarizeMissionDays(snapshot)) {
    const selected = selectSummaryRecords(snapshot, {
      section: "missions",
      day: day.day,
    }).missions;
    assert.equal(selected.length, day.missions);
    assert.equal(
      selected.reduce((sum, row) => sum + row.failed_actions, 0),
      day.failed,
    );
    assert.equal(
      selected.reduce((sum, row) => sum + row.total_actions, 0),
      day.actions,
    );
  }
  for (const area of summarizeEvidence(snapshot).hotspots) {
    const selected = selectSummaryRecords(snapshot, {
      section: "findings",
      location: area.id,
    }).findings;
    assert.equal(selected.length, area.count);
    assert.equal(
      selected.filter((row) => row.operator_review_required).length,
      area.review,
    );
  }
  for (const severity of ["CRITICAL", "HIGH", "MEDIUM", "LOW", "NONE"]) {
    assert.equal(
      selectSummaryRecords(snapshot, { section: "findings", severity }).findings
        .length,
      snapshot.metrics.anomalies_by_severity[severity] ?? 0,
    );
  }
  assert.equal(
    selectSummaryRecords(snapshot, { section: "findings", review: true })
      .findings.length,
    snapshot.metrics.review_required_count,
  );
});

test("drill-down links retain filters and data source and reject unsupported views", () => {
  const selections = [
    { section: "findings", severity: "HIGH", location: "A & B", review: true },
    { section: "missions", day: "2026-09-01" },
    { section: "models", model: "corrosion-yoke-resnet18" },
    { section: "all" },
  ];
  for (const selection of selections) {
    const query = summarySearch(selection, "api");
    assert.deepEqual(readSummarySelection(query), selection);
    assert.equal(new URLSearchParams(query).get("source"), "api");
  }
  assert.equal(readSummarySelection("?view=unknown"), null);
  assert.equal(readSummarySelection(""), null);
  assert.deepEqual(
    readSummarySelection("?view=missions&day=invalid&severity=HIGH"),
    { section: "missions" },
  );
  assert.deepEqual(readSummarySelection("?view=findings&severity=INVALID"), {
    section: "findings",
  });
  assert.equal(summarySearch(null, "demo"), "");
});
