import { useEffect, useState } from "react";
import {
  Activity,
  ArrowRight,
  AudioLines,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  ClipboardCheck,
  Clock3,
  Cpu,
  Database,
  FileText,
  Gauge,
  Home,
  Layers3,
  Map,
  Radar,
  RefreshCw,
  Route,
  Search,
  ShieldAlert,
  Sparkles,
  Thermometer,
  TriangleAlert,
} from "lucide-react";
import { getJSON } from "./api";
import { loadSummary } from "./summaryApi";
import { prioritizeFindings, summarizeEvidence } from "./summaryInsights";
import type { SavedDetection, SummaryData } from "./summaryTypes";
import type { ClusteredChange } from "./types";
import SummaryOverview from "./SummaryOverview";
import {
  readSummarySelection,
  selectSummaryRecords,
  summarySearch,
} from "./summaryViews";
import type { SummarySelection } from "./summaryViews";
import "./SummaryPage.css";

type Destination = "dashboard" | "lidar" | "relay";
type Props = { onHome: () => void; onNavigate: (page: Destination) => void };
const format = (value: string) => value.replaceAll("_", " ").toLowerCase();
const percent = (value: number | null) =>
  value === null ? "—" : `${value.toFixed(1)}%`;
const time = (value: string) =>
  new Date(value).toLocaleString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }) + " UTC";
const modelInfo = (endpoint?: string) => {
  const kind = endpoint?.split("/").at(-1);
  if (kind === "gauge")
    return { name: "Gauge detection", short: "Gauge", icon: Gauge };
  if (kind === "corrosion")
    return {
      name: "Corrosion inspection",
      short: "Corrosion",
      icon: ShieldAlert,
    };
  if (kind === "thermal")
    return { name: "Thermal patterns", short: "Thermal", icon: Thermometer };
  if (kind === "acoustic")
    return { name: "Acoustic analysis", short: "Acoustic", icon: AudioLines };
  return { name: "Historical model", short: "Historical", icon: Cpu };
};

function Pager({
  page,
  count,
  size,
  onChange,
  label,
}: {
  page: number;
  count: number;
  size: number;
  onChange: (page: number) => void;
  label: string;
}) {
  const pages = Math.max(1, Math.ceil(count / size));
  return (
    <div className="summary-pager" aria-label={`${label} pagination`}>
      <span>
        {count
          ? `${page * size + 1}–${Math.min((page + 1) * size, count)} of ${count}`
          : "No results"}
      </span>
      <div>
        <button
          type="button"
          aria-label={`Previous ${label}`}
          disabled={page === 0}
          onClick={() => onChange(page - 1)}
        >
          <ChevronLeft size={16} />
        </button>
        <span>
          {page + 1} / {pages}
        </span>
        <button
          type="button"
          aria-label={`Next ${label}`}
          disabled={page + 1 >= pages}
          onClick={() => onChange(page + 1)}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

function ResultEvidence({
  detection,
  data,
}: {
  detection: SavedDetection;
  data: SummaryData;
}) {
  const asset = data.assets.find((row) => row.asset_id === detection.asset_id);
  const location = data.locations.find(
    (row) => row.location_id === asset?.location_id,
  );
  const result = detection.result;
  const simulated = result.frame_id.startsWith("SIMULATED-");
  const scores = Object.entries(result.scores).sort((a, b) => b[1] - a[1]);
  return (
    <details className="summary-result">
      <summary>
        <span className="summary-result-context">
          <strong>{asset?.asset_name ?? detection.asset_id}</strong>
          <span>
            {location?.location_name ?? "Location not linked"} ·{" "}
            {time(detection.processed_at)}
          </span>
        </span>
        <span
          className={`summary-status ${detection.status.includes("SUSPECTED") ? "suspected" : ""}`}
        >
          {format(detection.status)}
        </span>
        <span className="summary-result-label">
          {simulated ? "Simulated" : "Saved result"}
          <ChevronRight size={15} />
        </span>
      </summary>
      <div className="summary-result-body">
        <div className="summary-evidence-meta">
          <span>{format(detection.review_status)} review</span>
          <span>{result.inference_ms.toFixed(0)} ms</span>
          <span>{detection.mission_id ?? "No linked mission"}</span>
        </div>
        {result.label && (
          <p>
            <strong>Pattern:</strong> {format(result.label)}
          </p>
        )}
        {result.reason && <p>{result.reason}</p>}
        {scores.length > 0 && (
          <div className="summary-score-list">
            <p>
              Model scores ·{" "}
              {result.scores_are_calibrated ? "calibrated" : "uncalibrated"}
            </p>
            {scores.map(([label, score]) => (
              <div key={label}>
                <span>{format(label)}</span>
                <meter
                  min={0}
                  max={1}
                  value={score}
                  aria-label={`${format(label)} score`}
                />
                <strong>{(score * 100).toFixed(1)}%</strong>
              </div>
            ))}
          </div>
        )}
        {result.detections.length > 0 && (
          <div className="summary-boxes">
            <p>Detected parts in image pixels</p>
            {result.detections.map((box, index) => (
              <div key={`${box.label}-${index}`}>
                <strong>{box.label}</strong>
                <span>{(box.score * 100).toFixed(0)}% score</span>
                <code>[{box.box_xyxy.join(", ")}]</code>
              </div>
            ))}
          </div>
        )}
        <p className="summary-muted">
          {result.value === null && result.temperature_c === null
            ? "No calibrated gauge reading or radiometric temperature is supplied. "
            : ""}
          {result.hazard_severity === null
            ? "The model does not assign hazard severity."
            : `Reported severity: ${result.hazard_severity}.`}
        </p>
        {detection.notes && <p className="summary-muted">{detection.notes}</p>}
      </div>
    </details>
  );
}

function SummaryContent({
  data,
  spatial,
  onNavigate,
  selection,
  onSelect,
}: {
  data: SummaryData;
  spatial: ClusteredChange[] | null;
  onNavigate: Props["onNavigate"];
  selection: SummarySelection | null;
  onSelect: (selection: SummarySelection | null) => void;
}) {
  const [model, setModel] = useState(selection?.model ?? "ALL");
  const [resultPage, setResultPage] = useState(0);
  const [query, setQuery] = useState("");
  const [reviewOnly, setReviewOnly] = useState(selection?.review ?? false);
  const [findingPage, setFindingPage] = useState(0);
  const [missionPage, setMissionPage] = useState(0);
  const selected = selectSummaryRecords(data, selection);
  const selectModel = (next: string) => {
    if (selection?.section === "models") {
      onSelect({
        section: "models",
        ...(next === "ALL" ? {} : { model: next }),
      });
    } else {
      setModel(next);
      setResultPage(0);
    }
  };
  const selectedMissions = [...selected.missions].sort((a, b) =>
    b.start_time.localeCompare(a.start_time),
  );
  const selectionLabel = selection?.severity
    ? `${format(selection.severity)} priority`
    : selection?.location
      ? (data.locations.find((row) => row.location_id === selection.location)
          ?.location_name ?? selection.location)
      : selection?.day
        ? selection.day
        : selection?.review
          ? "Needs operator review"
          : null;
  const insights = summarizeEvidence(data);
  const metrics = data.metrics;
  const findings = prioritizeFindings(selected.findings).filter(
    (row) =>
      (!reviewOnly || row.operator_review_required) &&
      [
        row.description,
        row.asset_name,
        row.location_name,
        row.anomaly_id,
        row.mission_id,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const results = [...data.detections]
    .filter((row) => model === "ALL" || row.model_id === model)
    .sort((a, b) => b.processed_at.localeCompare(a.processed_at));
  const baseline = metrics.by_scenario.BASELINE?.action_success_pct;
  const improved = metrics.by_scenario.IMPROVED?.action_success_pct;
  const difference =
    baseline != null && improved != null ? improved - baseline : null;
  const critical =
    (metrics.anomalies_by_severity.CRITICAL ?? 0) +
    (metrics.anomalies_by_severity.HIGH ?? 0);
  const cards = [
    {
      label: "Mission completion",
      value: percent(metrics.mission_completion_pct),
      detail: `${metrics.completed_missions} of ${metrics.total_missions} missions`,
      icon: Route,
    },
    {
      label: "Action success",
      value: percent(metrics.action_success_pct),
      detail: `${metrics.successful_actions} of ${metrics.total_actions} actions`,
      icon: CircleCheck,
    },
    {
      label: "Inspection findings",
      value: metrics.total_anomalies,
      detail: `${critical} high or critical priority`,
      icon: TriangleAlert,
    },
    {
      label: "Awaiting a closer look",
      value: metrics.review_required_count,
      detail: `${insights.pendingResults} saved AI results also pending review`,
      icon: ClipboardCheck,
    },
  ];
  return (
    <>
      <div className="summary-source-note">
        <span className="summary-badge">Historical records</span>
        <span>
          Latest inspection record:{" "}
          {metrics.latest_record_at
            ? time(metrics.latest_record_at)
            : "Not available"}
        </span>
        <span>{insights.simulatedResults} simulated AI examples included</span>
      </div>
      <section className="summary-metrics" aria-label="Inspection overview">
        {cards.map((card) => (
          <article key={card.label}>
            <div>
              <span>{card.label}</span>
              <card.icon size={18} />
            </div>
            <strong>{card.value}</strong>
            <p>{card.detail}</p>
          </article>
        ))}
      </section>

      {!selection ? (
        <SummaryOverview data={data} spatial={spatial} onSelect={onSelect} />
      ) : (
        <>
          <div className="summary-detail-toolbar">
            <span>
              {
                {
                  all: "All inspection details",
                  missions: "Mission details",
                  findings: "Finding details",
                  models: "AI evidence",
                  evidence: "Collected evidence",
                }[selection.section]
              }
            </span>
            {selectionLabel && (
              <span className="summary-detail-filter">
                {selectionLabel}
                <button
                  onClick={() => onSelect({ section: selection.section })}
                  aria-label="Clear chart filter"
                >
                  ×
                </button>
              </span>
            )}
          </div>
          {(selection.section === "all" ||
            (selection.section === "missions" && !selection.day)) && (
            <div
              className={`summary-overview-grid summary-detail-${selection.section}`}
              id="summary-overview"
            >
              <section className="summary-panel summary-performance">
                <div className="summary-panel-heading">
                  <div>
                    <p className="summary-kicker">01 / Mission outcomes</p>
                    <h2>A better inspection loop.</h2>
                  </div>
                  <Activity size={21} />
                </div>
                <p className="summary-panel-copy">
                  Mission completion and individual action success tell
                  different parts of the story.
                </p>
                <div className="summary-scenarios">
                  {["BASELINE", "IMPROVED"].map((scenario) => {
                    const outcome = metrics.by_scenario[scenario];
                    if (!outcome) return null;
                    return (
                      <div
                        key={scenario}
                        className={scenario === "IMPROVED" ? "improved" : ""}
                      >
                        <div className="summary-scenario-title">
                          <strong>{format(scenario)}</strong>
                          <span>{outcome.total_missions} missions</span>
                        </div>
                        <div className="summary-progress-label">
                          <span>Mission completion</span>
                          <strong>
                            {percent(outcome.mission_completion_pct)}
                          </strong>
                        </div>
                        <meter
                          min={0}
                          max={100}
                          value={outcome.mission_completion_pct ?? 0}
                          aria-label={`${scenario} mission completion`}
                        />
                        <div className="summary-progress-label">
                          <span>Action success</span>
                          <strong>{percent(outcome.action_success_pct)}</strong>
                        </div>
                        <meter
                          min={0}
                          max={100}
                          value={outcome.action_success_pct ?? 0}
                          aria-label={`${scenario} action success`}
                        />
                        <small>
                          {outcome.failed_actions} failed actions of{" "}
                          {outcome.total_actions}
                        </small>
                      </div>
                    );
                  })}
                </div>
                <div className="summary-insight">
                  <Sparkles size={18} />
                  <p>
                    {difference === null ? (
                      "Import mission records to compare scenarios."
                    ) : (
                      <>
                        <strong>
                          {difference >= 0 ? "+" : ""}
                          {difference.toFixed(1)} percentage points
                        </strong>{" "}
                        in action success for the improved scenario.
                      </>
                    )}
                  </p>
                </div>
                {data.missions.some(
                  (row) => row.mission_id === "SIM-AI-M001",
                ) && (
                  <p className="summary-footnote">
                    Totals include the simulated AI demonstration mission.
                  </p>
                )}
              </section>
              <section className="summary-panel">
                <div className="summary-panel-heading">
                  <div>
                    <p className="summary-kicker">02 / Facility attention</p>
                    <h2>Know where to look.</h2>
                  </div>
                  <Map size={21} />
                </div>
                <div
                  className="summary-severity-bar"
                  role="img"
                  aria-label={Object.entries(metrics.anomalies_by_severity)
                    .map(
                      ([severity, count]) =>
                        `${count} ${severity.toLowerCase()} findings`,
                    )
                    .join(", ")}
                >
                  {["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((severity) => (
                    <span
                      key={severity}
                      className={severity.toLowerCase()}
                      style={{
                        flex: metrics.anomalies_by_severity[severity] ?? 0,
                      }}
                    />
                  ))}
                </div>
                <div className="summary-severity-legend">
                  {["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((severity) => (
                    <div key={severity}>
                      <span
                        className={`summary-severity-dot ${severity.toLowerCase()}`}
                      />
                      {format(severity)}
                      <strong>
                        {metrics.anomalies_by_severity[severity] ?? 0}
                      </strong>
                    </div>
                  ))}
                </div>
                <p className="summary-small-label">
                  Areas with the most high-priority findings
                </p>
                <div className="summary-hotspots">
                  {insights.hotspots.slice(0, 3).map((area) => (
                    <div key={area.id}>
                      <span className="summary-area-id">{area.id}</span>
                      <div>
                        <strong>{area.name}</strong>
                        <span>
                          {area.count} findings · {area.priority} high /
                          critical · {area.review} need review
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                {!insights.hotspots.length && (
                  <p className="summary-muted">
                    No inspection findings recorded yet.
                  </p>
                )}
                <button
                  className="summary-text-button"
                  onClick={() => onNavigate("dashboard")}
                >
                  Explore facility map <ArrowRight size={16} />
                </button>
              </section>
            </div>
          )}

          {(selection.section === "all" || selection.section === "models") && (
            <section className="summary-panel" id="summary-models">
              <div className="summary-panel-heading">
                <div>
                  <p className="summary-kicker">03 / AI inspection evidence</p>
                  <h2>Four ways to see more.</h2>
                </div>
                <span className="summary-badge">
                  {data.detections.length} saved results
                </span>
              </div>
              <p className="summary-panel-copy">
                Saved model outputs add context to inspection findings.
                Simulated examples are labeled; scores are not certainty or
                hazard severity.
              </p>
              <div className="summary-model-grid">
                {data.model_summary.models.map((row) => {
                  const info = modelInfo(row.model?.endpoint);
                  return (
                    <button
                      key={row.model_id}
                      className="summary-model-card"
                      aria-pressed={model === row.model_id}
                      onClick={() => {
                        selectModel(
                          model === row.model_id ? "ALL" : row.model_id,
                        );
                      }}
                    >
                      <div>
                        <info.icon size={22} />
                        <span>{row.total_detections} results</span>
                      </div>
                      <h3>{row.model ? info.name : row.model_id}</h3>
                      <p>
                        {row.model?.scope ??
                          "Saved outputs from a model outside the current registry."}
                      </p>
                      <span className="summary-model-meta">
                        {row.review_status_counts.pending ?? 0} pending review{" "}
                        {row.model?.quality_status.includes("experimental")
                          ? "· Experimental"
                          : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="summary-list-heading">
                <h3>
                  {model === "ALL"
                    ? "Saved inference results"
                    : "Selected model results"}
                </h3>
                {model !== "ALL" && (
                  <button
                    className="summary-text-button"
                    onClick={() => {
                      selectModel("ALL");
                    }}
                  >
                    Show all models
                  </button>
                )}
                <span>Expand a result to inspect its evidence</span>
              </div>
              {results.slice(resultPage * 3, resultPage * 3 + 3).map((row) => (
                <ResultEvidence key={row.id} detection={row} data={data} />
              ))}
              {!results.length && (
                <div className="summary-empty">
                  <Cpu size={26} />
                  <strong>No saved model results yet.</strong>
                  <span>
                    Results will appear here once inspection outputs have been
                    saved.
                  </span>
                </div>
              )}
              <Pager
                page={resultPage}
                count={results.length}
                size={3}
                onChange={setResultPage}
                label="AI results"
              />
            </section>
          )}

          {(selection.section === "all" ||
            selection.section === "findings") && (
            <section className="summary-panel" id="summary-attention">
              <div className="summary-panel-heading">
                <div>
                  <p className="summary-kicker">04 / Review queue</p>
                  <h2>The findings that matter.</h2>
                </div>
                <span className="summary-badge">Priority first</span>
              </div>
              <div className="summary-finding-controls">
                <label className="summary-search">
                  <Search size={17} />
                  <input
                    aria-label="Search findings"
                    placeholder="Search assets, areas, or findings…"
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setFindingPage(0);
                    }}
                  />
                </label>
                <label className="summary-review-toggle">
                  <input
                    type="checkbox"
                    checked={reviewOnly}
                    onChange={(event) => {
                      if (selection.section === "findings") {
                        onSelect({
                          ...selection,
                          review: event.target.checked || undefined,
                        });
                      } else {
                        setReviewOnly(event.target.checked);
                        setFindingPage(0);
                      }
                    }}
                  />
                  Needs operator review
                </label>
              </div>
              <div className="summary-findings">
                {findings
                  .slice(findingPage * 5, findingPage * 5 + 5)
                  .map((finding) => (
                    <details
                      className="summary-finding"
                      key={finding.anomaly_id}
                    >
                      <summary>
                        <span
                          className={`summary-severity-chip ${finding.severity.toLowerCase()}`}
                        >
                          {format(finding.severity)}
                        </span>
                        <span className="summary-finding-title">
                          <strong>{finding.asset_name}</strong>
                          <span>
                            {finding.location_name} · {finding.anomaly_id}
                          </span>
                        </span>
                        <span className="summary-review-label">
                          {finding.operator_review_required
                            ? "Review required"
                            : "Recorded finding"}
                        </span>
                        <ChevronRight size={16} />
                      </summary>
                      <div className="summary-finding-body">
                        <p>{finding.description}</p>
                        <span>
                          {finding.mission_id} · {time(finding.timestamp)} ·{" "}
                          {finding.synthetic
                            ? "Synthetic record"
                            : "Inspection record"}
                        </span>
                      </div>
                    </details>
                  ))}
              </div>
              {!findings.length && (
                <div className="summary-empty">
                  <Search size={26} />
                  <strong>No findings match this view.</strong>
                  <span>Try another search or turn off the review filter.</span>
                </div>
              )}
              <Pager
                page={findingPage}
                count={findings.length}
                size={5}
                onChange={setFindingPage}
                label="findings"
              />
            </section>
          )}

          {(selection.section === "all" ||
            selection.section === "evidence") && (
            <div className="summary-evidence-grid" id="summary-evidence">
              <section className="summary-panel">
                <div className="summary-panel-heading">
                  <div>
                    <p className="summary-kicker">05 / Collected evidence</p>
                    <h2>Every signal has context.</h2>
                  </div>
                  <Database size={21} />
                </div>
                <div className="summary-inventory">
                  {[
                    [data.locations.length, "Facility areas"],
                    [data.assets.length, "Tracked assets"],
                    [data.readings.length, "Sensor readings"],
                    [data.record_counts.replay_events, "Replay events"],
                  ].map(([count, label]) => (
                    <div key={label}>
                      <strong>{count}</strong>
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
                <p className="summary-small-label">
                  Recorded measurement types
                </p>
                <div className="summary-measurements">
                  {insights.measurements.map(([kind, count]) => (
                    <div key={kind}>
                      <span>{format(kind)}</span>
                      <strong>{count}</strong>
                      <span className="summary-measurement-track">
                        <span
                          style={{
                            width: `${data.readings.length ? (count / data.readings.length) * 100 : 0}%`,
                          }}
                        />
                      </span>
                    </div>
                  ))}
                </div>
                {!data.readings.length && (
                  <p className="summary-muted">No sensor readings recorded.</p>
                )}
                <p className="summary-footnote">
                  {data.record_counts.replays} saved replays ·{" "}
                  {data.record_counts.import_reports} import reports ·{" "}
                  {
                    data.assets.filter(
                      (asset) => asset.criticality === "CRITICAL",
                    ).length
                  }{" "}
                  critical assets
                </p>
              </section>
              <section className="summary-panel">
                <div className="summary-panel-heading">
                  <div>
                    <p className="summary-kicker">06 / Spatial context</p>
                    <h2>What changed in the room?</h2>
                  </div>
                  <Layers3 size={21} />
                </div>
                <div className="summary-spatial-stat">
                  <strong>{spatial?.length ?? "—"}</strong>
                  <div>
                    <span>geometric changes</span>
                    <p>Bundled point-cloud comparison</p>
                  </div>
                </div>
                <p className="summary-panel-copy">
                  {spatial
                    ? `${spatial.filter((row) => row.review_status === "unreviewed").length} changes await review. Geometry shows where the room differs; it does not establish the cause or severity.`
                    : "The spatial comparison could not load. Inspection records remain available."}
                </p>
                {spatial && (
                  <div className="summary-spatial-meta">
                    <span>
                      {spatial
                        .reduce((total, row) => total + row.point_count, 0)
                        .toLocaleString()}{" "}
                      points across change clusters
                    </span>
                    <span>
                      Source: {spatial[0]?.source ?? "No comparison records"}
                    </span>
                  </div>
                )}
                <p className="summary-footnote">
                  {data.record_counts.lidar_scans} scans saved in the database.
                  Bundled comparisons are separate spatial evidence.
                </p>
                <button
                  className="summary-link-button"
                  onClick={() => onNavigate("lidar")}
                >
                  Open digital twin <ArrowRight size={17} />
                </button>
              </section>
            </div>
          )}
          {(selection.section === "all" ||
            selection.section === "missions") && (
            <section
              className="summary-panel summary-recent"
              id="summary-missions"
            >
              <div className="summary-panel-heading">
                <div>
                  <p className="summary-kicker">07 / Recent activity</p>
                  <h2>
                    {selection.section === "missions"
                      ? "Missions behind the trend."
                      : "Follow the inspection trail."}
                  </h2>
                </div>
                <button
                  className="summary-text-button"
                  onClick={() => onNavigate("relay")}
                >
                  Explore replay <ArrowRight size={16} />
                </button>
              </div>
              <div className="summary-recent-grid">
                {(selection.section === "missions"
                  ? selectedMissions.slice(missionPage * 8, missionPage * 8 + 8)
                  : insights.recentMissions.slice(0, 4)
                ).map((mission) => (
                  <article key={mission.mission_id}>
                    <Clock3 size={17} />
                    <span>{time(mission.start_time)}</span>
                    <strong>{mission.mission_name}</strong>
                    <p>
                      {mission.mission_id} · {format(mission.scenario)}
                    </p>
                    <div>
                      <span className="summary-status">
                        {format(mission.mission_status)}
                      </span>
                      <span>{mission.failed_actions} failed actions</span>
                    </div>
                  </article>
                ))}
              </div>
              {!selectedMissions.length && (
                <p className="summary-muted">No missions recorded yet.</p>
              )}
              {selection.section === "missions" && (
                <Pager
                  page={missionPage}
                  count={selectedMissions.length}
                  size={8}
                  onChange={setMissionPage}
                  label="missions"
                />
              )}
            </section>
          )}
          <p className="summary-bottom-note">
            Inspection history, saved inference, and spatial evidence in one
            view. Model results remain subject to operator review.
          </p>
        </>
      )}
    </>
  );
}

function SummaryLoader({
  mode,
  onNavigate,
  selection,
  onSelect,
}: {
  mode: "demo" | "api";
  onNavigate: Props["onNavigate"];
  selection: SummarySelection | null;
  onSelect: (selection: SummarySelection | null) => void;
}) {
  const [data, setData] = useState<SummaryData | null>(null);
  const [spatial, setSpatial] = useState<ClusteredChange[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 30000);
    Promise.all([
      loadSummary(mode, controller.signal),
      getJSON<ClusteredChange[]>(
        "/lidar/real_clustered_changes.json",
        controller.signal,
      ).catch(() => null),
    ])
      .then(([summary, changes]) => {
        if (mounted) {
          setData(summary);
          setSpatial(changes);
        }
      })
      .catch((reason: Error) => {
        if (mounted)
          setError(
            timedOut
              ? "The request timed out. Refresh to try again."
              : `${mode === "api" ? "Backend data is unavailable." : "The demo snapshot could not load."} ${reason.message}`,
          );
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      mounted = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [mode]);
  if (error)
    return (
      <div className="summary-error" role="alert">
        <TriangleAlert size={23} />
        <div>
          <strong>We couldn’t load this summary.</strong>
          <p>{error}</p>
          <p>
            Use Refresh to retry or select Demo data to view the bundled
            examples.
          </p>
        </div>
      </div>
    );
  if (!data)
    return (
      <div className="summary-loading" role="status">
        <RefreshCw size={25} />
        <strong>Gathering the full picture…</strong>
        <span>Loading inspection records and saved AI evidence.</span>
      </div>
    );
  return (
    <SummaryContent
      key={JSON.stringify(selection)}
      data={data}
      spatial={spatial}
      onNavigate={onNavigate}
      selection={selection}
      onSelect={onSelect}
    />
  );
}

export default function SummaryPage({ onHome, onNavigate }: Props) {
  const [mode, setMode] = useState<"demo" | "api">(() =>
    new URLSearchParams(window.location.search).get("source") === "api"
      ? "api"
      : "demo",
  );
  const [selection, setSelection] = useState<SummarySelection | null>(() =>
    readSummarySelection(window.location.search),
  );
  useEffect(() => {
    const restoreView = () => {
      setSelection(readSummarySelection(window.location.search));
      setMode(
        new URLSearchParams(window.location.search).get("source") === "api"
          ? "api"
          : "demo",
      );
    };
    window.addEventListener("popstate", restoreView);
    return () => window.removeEventListener("popstate", restoreView);
  }, []);
  const selectView = (next: SummarySelection | null) => {
    setSelection(next);
    window.history.pushState({}, "", `/summary${summarySearch(next, mode)}`);
    window.scrollTo({ top: 0, behavior: "instant" });
    requestAnimationFrame(() =>
      document.getElementById("summary-title")?.focus({ preventScroll: true }),
    );
  };
  const selectSource = (next: "demo" | "api") => {
    setMode(next);
    window.history.replaceState(
      {},
      "",
      `/summary${summarySearch(selection, next)}`,
    );
  };
  const [refresh, setRefresh] = useState(0);
  return (
    <div className="summary-shell">
      <aside className="summary-sidebar">
        <button
          className="summary-brand"
          onClick={onHome}
          aria-label="Spotlight home"
        >
          <strong>SPOTLIGHT</strong>
        </button>
        <p className="summary-nav-label">Inspection intelligence</p>
        <nav aria-label="Summary sections">
          <button
            className={!selection ? "active" : ""}
            aria-current={!selection ? "page" : undefined}
            onClick={() => selectView(null)}
          >
            <BarChart3 size={18} />
            Summary
          </button>
          <button
            className={selection?.section === "findings" ? "active" : ""}
            onClick={() => selectView({ section: "findings", review: true })}
          >
            <ClipboardCheck size={18} />
            Review queue
          </button>
          <button
            className={selection?.section === "models" ? "active" : ""}
            onClick={() => selectView({ section: "models" })}
          >
            <Cpu size={18} />
            AI evidence
          </button>
          <button
            className={selection?.section === "evidence" ? "active" : ""}
            onClick={() => selectView({ section: "evidence" })}
          >
            <Database size={18} />
            Collected data
          </button>
        </nav>
        <p className="summary-nav-label">Explore workspace</p>
        <nav aria-label="Other workspaces">
          <button onClick={onHome}>
            <Home size={18} />
            Home
          </button>
          <button onClick={() => onNavigate("dashboard")}>
            <Map size={18} />
            Facility map
          </button>
          <button onClick={() => onNavigate("lidar")}>
            <Radar size={18} />
            Digital twin
          </button>
          <button onClick={() => onNavigate("relay")}>
            <Route size={18} />
            Mission replay
          </button>
        </nav>
        <div className="summary-sidebar-footer">
          <span className="summary-live-dot" />
          Knight Hacks IX
          <p>
            Recorded inspections.
            <br />A clearer next move.
          </p>
        </div>
      </aside>
      <main className="summary-main" id="summary-top">
        <header className="summary-topbar">
          <span>
            <FileText size={16} />
            Workspace <span>/</span> Summary
          </span>
          <span className="summary-badge">Spotlight / V1</span>
        </header>
        {selection && (
          <nav className="summary-return-nav" aria-label="Return to summary">
            <button
              type="button"
              className="summary-return-button"
              onClick={() => selectView(null)}
            >
              <ChevronLeft size={18} />
              Back to summary
            </button>
            <span>Inspection details</span>
          </nav>
        )}
        <div className="summary-page-heading">
          <div>
            <p className="summary-kicker">Facility intelligence, connected</p>
            <h1 id="summary-title" tabIndex={-1}>
              {selection ? "A closer look." : "The full picture."}
            </h1>
            <p>
              {selection
                ? "Inspect the records behind the signal."
                : "Spot the signal. Follow what needs attention."}
            </p>
          </div>
          <div className="summary-heading-actions">
            <div
              className="summary-source-switch"
              aria-label="Summary data source"
            >
              <button
                aria-pressed={mode === "demo"}
                onClick={() => selectSource("demo")}
              >
                Demo data
              </button>
              <button
                aria-pressed={mode === "api"}
                onClick={() => selectSource("api")}
              >
                Backend data
              </button>
            </div>
            <button
              className="summary-refresh"
              onClick={() => setRefresh((value) => value + 1)}
            >
              <RefreshCw size={16} />
              Refresh
            </button>
          </div>
        </div>
        <div className="summary-source-banner">
          <span className="summary-live-dot" />
          <strong>
            {mode === "demo"
              ? "Bundled inspection snapshot"
              : "Backend inspection records"}
          </strong>
          <span>Historical records · simulated AI labeled</span>
        </div>
        <SummaryLoader
          key={`${mode}-${refresh}`}
          mode={mode}
          onNavigate={onNavigate}
          selection={selection}
          onSelect={selectView}
        />
      </main>
    </div>
  );
}
