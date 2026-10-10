import { lazy, Suspense, useEffect, useState } from "react";
import { loadDashboard, loadLidar } from "./api";
import type { DashboardData, Finding, LidarData, Severity } from "./types";
import "./Dashboard.css";

const FacilityViewer = lazy(() => import("./components/FacilityViewer"));
const severities: Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
const pct = (value: number | null | undefined) =>
  value == null ? "—" : `${value.toFixed(1)}%`;
const timestamp = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleString("en-US", {
        timeZone: "UTC",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }) + " UTC"
    : "Not available";

function Dashboard() {
  const [mode, setMode] = useState<"demo" | "api">("demo");
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<DashboardData | null>(null);
  const [lidar, setLidar] = useState<LidarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lidarError, setLidarError] = useState("");
  const [selectedWaypoint, setSelectedWaypoint] = useState("WP05");
  const [showHistory, setShowHistory] = useState(true);
  const [showObstruction, setShowObstruction] = useState(true);
  const [scenario, setScenario] = useState("ALL");
  const [severity, setSeverity] = useState("ALL");
  const [location, setLocation] = useState("ALL");
  const [missionFilter, setMissionFilter] = useState("ALL");
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [search, setSearch] = useState("");
  const [reviewOnly, setReviewOnly] = useState(false);
  const [showAllFindings, setShowAllFindings] = useState(false);
  const [showAllMissions, setShowAllMissions] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    loadDashboard(mode, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setData(result);
        setLoading(false);
        clearTimeout(timeout);
      })
      .catch((reason) => {
        if (controller.signal.aborted) return;
        setError(
          mode === "api"
            ? `Django API unavailable. Check the backend connection, then retry. ${reason.message}`
            : `Demo data could not load. ${reason.message}`,
        );
        setLoading(false);
        clearTimeout(timeout);
      });
    const onAbort = () => {
      setError("Request timed out. Check the backend and retry.");
      setLoading(false);
    };
    controller.signal.addEventListener("abort", onAbort);
    return () => {
      clearTimeout(timeout);
      controller.signal.removeEventListener("abort", onAbort);
      controller.abort();
    };
  }, [mode, refresh]);

  useEffect(() => {
    const controller = new AbortController();
    loadLidar(controller.signal)
      .then(setLidar)
      .catch((reason) => {
        if (reason.name !== "AbortError")
          setLidarError(`LiDAR assets could not load: ${reason.message}`);
      });
    return () => controller.abort();
  }, []);

  const metrics = data?.metrics;
  const history = lidar?.history.find(
    (row) => row.location_id === selectedWaypoint,
  );
  const findings =
    data?.findings.filter(
      (row) =>
        (!reviewOnly || row.operator_review_required) &&
        (!search.trim() ||
          [
            row.anomaly_id,
            row.asset_name,
            row.location_name,
            row.mission_id,
            row.description,
          ].some((value) =>
            value.toLowerCase().includes(search.trim().toLowerCase()),
          )) &&
        (severity === "ALL" || row.severity === severity) &&
        (location === "ALL" || row.location_id === location) &&
        (missionFilter === "ALL" || row.mission_id === missionFilter),
    ) ?? [];
  const missions =
    data?.missions.filter(
      (row) => scenario === "ALL" || row.scenario === scenario,
    ) ?? [];

  return (
    <div className="operations-dashboard app-shell">
      <aside className="sidebar">
        <a className="brand" href="#overview">
          <span className="brand-mark">S</span>
          <span>
            SPOT<span className="brand-sub">FACILITY OPERATIONS</span>
          </span>
        </a>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Dashboard sections">
          <a href="#overview" className="nav-active">
            <span>▦</span>Overview
          </a>
          <a href="#digital-twin">
            <span>◇</span>Digital twin
          </a>
          <a href="#findings">
            <span>◉</span>Findings
          </a>
          <a href="#missions">
            <span>≡</span>Missions
          </a>
        </nav>
        <div className="sidebar-footer">
          <span className="dot amber" /> KNIGHT HACKS IX
          <span>
            Synthetic inspection workspace
            <br />
            Historical data prototype
          </span>
        </div>
      </aside>
      <div className="dashboard-content" id="overview">
        <header className="topbar">
          <span>
            Workspace <span className="slash">/</span> Facility overview
          </span>
          <span className="prototype-label">PROTOTYPE · V1</span>
        </header>
        <div className="page-heading">
          <div>
            <div className="eyebrow">INSPECTION INTELLIGENCE</div>
            <h1>Facility overview</h1>
            <p>
              Mission performance, historical findings, and a simulated digital
              twin.
            </p>
          </div>
          <div className="heading-actions">
            <div className="mode-switch" aria-label="Data source">
              <button
                aria-pressed={mode === "demo"}
                className={mode === "demo" ? "active" : ""}
                onClick={() => {
                  setLoading(true);
                  setData(null);
                  setSelectedFinding(null);
                  setError("");
                  setMode("demo");
                }}
              >
                Demo data
              </button>
              <button
                aria-pressed={mode === "api"}
                className={mode === "api" ? "active" : ""}
                onClick={() => {
                  setLoading(true);
                  setData(null);
                  setSelectedFinding(null);
                  setError("");
                  setMode("api");
                }}
              >
                Django API
              </button>
            </div>
            <button
              className="refresh-button"
              onClick={() => {
                setLoading(true);
                setData(null);
                setSelectedFinding(null);
                setError("");
                setRefresh((value) => value + 1);
              }}
              disabled={loading}
            >
              ↻ Refresh
            </button>
          </div>
        </div>
        <div className="source-banner">
          <span className="badge cyan-badge">SIMULATED</span>
          <span>
            {mode === "demo"
              ? "Bundled challenge snapshot"
              : "Django inspection data"}{" "}
            · Historical records, not live robot telemetry
          </span>
          <span className="source-time">
            Latest record: {timestamp(metrics?.latest_record_at)}
          </span>
        </div>
        <div className="connectivity">
          <span>
            <span
              className={`dot ${mode === "api" && data ? "green" : "gray"}`}
            />
            Inspection API:{" "}
            {mode === "demo"
              ? "not queried in demo"
              : loading
                ? "connecting"
                : error
                  ? "unavailable"
                  : "connected"}
          </span>
          <span>
            <span className="dot gray" />
            Robot sync: not configured
          </span>
          <span>
            <span className="dot amber" />
            Robot: simulated
          </span>
        </div>
        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}
        <section
          className="metrics-grid"
          aria-label="Inspection metrics"
          aria-busy={loading}
        >
          {[
            {
              label: "Mission completion",
              value: pct(metrics?.mission_completion_pct),
              detail: metrics
                ? `${metrics.completed_missions} of ${metrics.total_missions} missions completed`
                : "Waiting for data",
              icon: "↗",
            },
            {
              label: "Action success",
              value: pct(metrics?.action_success_pct),
              detail: metrics
                ? `${metrics.successful_actions} of ${metrics.total_actions} actions successful`
                : "Waiting for data",
              icon: "✓",
            },
            {
              label: "Historical findings",
              value: metrics?.total_anomalies ?? "—",
              detail: metrics
                ? `${metrics.total_readings} sensor readings recorded`
                : "Waiting for data",
              icon: "◉",
            },
            {
              label: "Operator review",
              value: metrics?.review_required_count ?? "—",
              detail: "Source findings flagged for review",
              icon: "⚑",
            },
          ].map((card, index) => (
            <article className={`metric-card metric-${index}`} key={card.label}>
              <div className="metric-label">
                {card.label}
                <span>{card.icon}</span>
              </div>
              <strong>{loading ? "…" : card.value}</strong>
              <p>{card.detail}</p>
            </article>
          ))}
        </section>

        <section className="twin-grid" id="digital-twin">
          <article className="panel twin-panel">
            <div className="panel-heading">
              <div>
                <h2>Facility digital twin</h2>
                <p>Simulated room geometry with historical waypoint overlays</p>
              </div>
              <span className="badge neutral-badge">
                {lidar?.waypoints.length ?? "—"} WAYPOINTS
              </span>
            </div>
            <div className="layer-toolbar">
              <label>
                <input
                  type="checkbox"
                  checked={showHistory}
                  onChange={(event) => setShowHistory(event.target.checked)}
                />
                Waypoint history
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={showObstruction}
                  onChange={(event) => setShowObstruction(event.target.checked)}
                />
                Synthetic obstruction
              </label>
              <span>facility.glb</span>
            </div>
            {lidar ? (
              <Suspense
                fallback={
                  <div className="viewer-placeholder">
                    Preparing model viewer…
                  </div>
                }
              >
                <FacilityViewer
                  data={lidar}
                  selected={selectedWaypoint}
                  onSelect={setSelectedWaypoint}
                  showHistory={showHistory}
                  showObstruction={showObstruction}
                />
              </Suspense>
            ) : (
              <div
                className="viewer-placeholder"
                role={lidarError ? "alert" : "status"}
              >
                {lidarError || "Loading LiDAR exports…"}
              </div>
            )}
            <div className="legend">
              {[...severities, "NONE" as Severity].map((value) => (
                <span key={value}>
                  <i className={`severity-dot ${value.toLowerCase()}`} />
                  {value === "NONE"
                    ? "No findings"
                    : value.charAt(0) + value.slice(1).toLowerCase()}
                </span>
              ))}
            </div>
            <div className="waypoint-list" aria-label="Select a waypoint">
              {lidar?.waypoints.map((row) => (
                <button
                  key={row.location_id}
                  aria-pressed={selectedWaypoint === row.location_id}
                  className={
                    selectedWaypoint === row.location_id ? "selected" : ""
                  }
                  onClick={() => setSelectedWaypoint(row.location_id)}
                >
                  {row.location_id}
                </button>
              ))}
            </div>
            <p className="coordinate-note">
              Demo-scaled waypoint positions in facility_local coordinates;
              these are not real SPOT localization measurements.
            </p>
          </article>
          <div className="twin-details">
            <article className="panel waypoint-panel">
              <div className="eyebrow">SELECTED WAYPOINT</div>
              <div className="waypoint-title">
                <h2>{selectedWaypoint}</h2>
                <span
                  className={`badge severity ${history?.highest_severity.toLowerCase() ?? "none"}`}
                >
                  {history?.highest_severity ?? "—"}
                </span>
              </div>
              <p>
                {data?.findings.find(
                  (row) => row.location_id === selectedWaypoint,
                )?.location_name ?? "Synthetic facility waypoint"}
              </p>
              <div className="waypoint-stat">
                <strong>{history?.anomaly_count ?? "—"}</strong>
                <span>
                  historical findings
                  <br />
                  across all missions
                </span>
              </div>
              <div className="mini-bars">
                {severities.map((level) => {
                  const count =
                    data?.findings.filter(
                      (row) =>
                        row.location_id === selectedWaypoint &&
                        row.severity === level,
                    ).length ?? 0;
                  return (
                    <div key={level}>
                      <span>{level.toLowerCase()}</span>
                      <div className="bar-track">
                        <i
                          className={level.toLowerCase()}
                          style={{
                            width: `${(count / Math.max(history?.anomaly_count ?? 1, 1)) * 100}%`,
                          }}
                        />
                      </div>
                      <b>{data ? count : "—"}</b>
                    </div>
                  );
                })}
              </div>
              <button
                className="text-button"
                onClick={() => {
                  setSearch("");
                  setReviewOnly(false);
                  setLocation(selectedWaypoint);
                  setMissionFilter("ALL");
                  setSeverity("ALL");
                  document
                    .getElementById("findings")
                    ?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                View waypoint findings →
              </button>
            </article>
            <article className="panel obstruction-panel">
              <div className="eyebrow">POINT CLOUD COMPARISON</div>
              <h2>
                <span className="dot red" />
                New obstruction
              </h2>
              <p>
                Separately detected in synthetic baseline and updated scans.
              </p>
              <dl>
                <div>
                  <dt>Change ID</dt>
                  <dd>{lidar?.obstruction.id ?? "—"}</dd>
                </div>
                <div>
                  <dt>Changed points</dt>
                  <dd>
                    {lidar?.obstruction.point_count.toLocaleString() ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt>Review status</dt>
                  <dd>{lidar?.obstruction.review_status ?? "—"}</dd>
                </div>
                <div>
                  <dt>AI confidence</dt>
                  <dd>Unavailable</dd>
                </div>
              </dl>
              <p className="tiny-note">
                This obstruction is separate from the 40 historical challenge
                findings. No confidence score was supplied.
              </p>
            </article>
          </div>
        </section>

        <section className="panel findings-panel" id="findings">
          <div className="panel-heading">
            <div>
              <h2>
                Inspection findings{" "}
                <span className="count-pill">{findings.length}</span>
              </h2>
              <p>Recorded anomalies from the synthetic challenge dataset</p>
            </div>
            <div className="filters">
              <label>
                Severity
                <select
                  value={severity}
                  onChange={(event) => setSeverity(event.target.value)}
                >
                  <option value="ALL">All severities</option>
                  {severities.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label>
                Waypoint
                <select
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                >
                  <option value="ALL">All waypoints</option>
                  {lidar?.waypoints.map((row) => (
                    <option key={row.location_id}>{row.location_id}</option>
                  ))}
                </select>
              </label>
              <label>
                Mission
                <select
                  value={missionFilter}
                  onChange={(event) => setMissionFilter(event.target.value)}
                >
                  <option value="ALL">All missions</option>
                  {data?.missions.map((row) => (
                    <option key={row.mission_id}>{row.mission_id}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <div className="finding-search">
            <label>
              Search findings
              <input
                type="search"
                value={search}
                placeholder="Asset, mission, location or description"
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <label className="review-toggle">
              <input
                type="checkbox"
                checked={reviewOnly}
                onChange={(event) => setReviewOnly(event.target.checked)}
              />{" "}
              Review required only
            </label>
            <button
              className="refresh-button"
              onClick={() => {
                setSearch("");
                setReviewOnly(false);
                setSeverity("ALL");
                setLocation("ALL");
                setMissionFilter("ALL");
              }}
            >
              Clear filters
            </button>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Finding / Asset</th>
                  <th>Location</th>
                  <th>Severity</th>
                  <th>Recorded at</th>
                  <th>Review</th>
                  <th aria-label="Details"></th>
                </tr>
              </thead>
              <tbody>
                {(showAllFindings ? findings : findings.slice(0, 6)).map(
                  (row) => (
                    <tr key={row.anomaly_id}>
                      <td>
                        <strong>{row.asset_name}</strong>
                        <small>
                          {row.anomaly_id} · {row.mission_id}
                        </small>
                      </td>
                      <td>
                        {row.location_name}
                        <small>{row.location_id}</small>
                      </td>
                      <td>
                        <span
                          className={`badge severity ${row.severity.toLowerCase()}`}
                        >
                          {row.severity}
                        </span>
                      </td>
                      <td className="table-time">{timestamp(row.timestamp)}</td>
                      <td>
                        {row.operator_review_required ? (
                          <span className="review-required">Required</span>
                        ) : (
                          "Not flagged"
                        )}
                      </td>
                      <td>
                        <button
                          className="detail-button"
                          onClick={() => setSelectedFinding(row)}
                          aria-label={`View ${row.anomaly_id}`}
                        >
                          ↗
                        </button>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
          {!findings.length && (
            <div className="empty-state">
              {loading
                ? "Loading findings…"
                : error
                  ? "Findings unavailable until the data source reconnects."
                  : "No findings match these filters."}
            </div>
          )}
          {findings.length > 6 && (
            <button
              className="table-footer"
              onClick={() => setShowAllFindings((value) => !value)}
            >
              {showAllFindings
                ? "Show fewer findings ↑"
                : `View all ${findings.length} findings ↓`}
            </button>
          )}
        </section>

        <section className="bottom-grid" id="missions">
          <article className="panel missions-panel">
            <div className="panel-heading">
              <div>
                <h2>Mission log</h2>
                <p>Completion and action failures remain separate</p>
              </div>
              <label className="filters">
                Scenario
                <select
                  value={scenario}
                  onChange={(event) => setScenario(event.target.value)}
                >
                  <option value="ALL">All scenarios</option>
                  <option>BASELINE</option>
                  <option>IMPROVED</option>
                </select>
              </label>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Mission</th>
                    <th>Outcome</th>
                    <th>Duration</th>
                    <th>Failed actions</th>
                    <th>Battery used</th>
                  </tr>
                </thead>
                <tbody>
                  {(showAllMissions ? missions : missions.slice(0, 5)).map(
                    (row) => (
                      <tr key={row.mission_id}>
                        <td>
                          <button
                            className="mission-link"
                            onClick={() => {
                              setSearch("");
                              setReviewOnly(false);
                              setSeverity("ALL");
                              setMissionFilter(row.mission_id);
                              setLocation("ALL");
                              document
                                .getElementById("findings")
                                ?.scrollIntoView({ behavior: "smooth" });
                            }}
                          >
                            {row.mission_id} ↗
                          </button>
                          <small>{row.scenario}</small>
                        </td>
                        <td>
                          <span
                            className={`badge ${row.mission_status === "COMPLETED" ? "cyan-badge" : "severity critical"}`}
                          >
                            {row.mission_status}
                          </span>
                        </td>
                        <td>{row.duration_min} min</td>
                        <td>
                          {row.failed_actions} / {row.total_actions}
                        </td>
                        <td>{row.battery_used_pct} pp</td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
            {!missions.length && (
              <div className="empty-state">
                {loading ? "Loading missions…" : "No missions available."}
              </div>
            )}
            {missions.length > 5 && (
              <button
                className="table-footer"
                onClick={() => setShowAllMissions((value) => !value)}
              >
                {showAllMissions
                  ? "Show fewer missions ↑"
                  : `View all ${missions.length} missions ↓`}
              </button>
            )}
          </article>
          <article className="panel comparison-panel">
            <div className="eyebrow">CONFIGURATION COMPARISON</div>
            <h2>Baseline → Improved</h2>
            <p>Observed results in fictional V1 / V2 scenarios</p>
            {["mission_completion_pct", "action_success_pct"].map((key) => (
              <div className="comparison-row" key={key}>
                <span>
                  {key === "mission_completion_pct"
                    ? "Mission completion"
                    : "Action success"}
                </span>
                <div>
                  <strong>
                    {pct(
                      metrics?.by_scenario.BASELINE[
                        key as "mission_completion_pct" | "action_success_pct"
                      ],
                    )}
                  </strong>
                  <span>→</span>
                  <strong className="improved">
                    {pct(
                      metrics?.by_scenario.IMPROVED[
                        key as "mission_completion_pct" | "action_success_pct"
                      ],
                    )}
                  </strong>
                </div>
              </div>
            ))}
            <p className="tiny-note">
              The dataset does not specify what changed between configurations.
              This comparison does not establish causation.
            </p>
          </article>
        </section>
        <footer className="page-footer">
          Knight Hacks IX · Synthetic facility inspection{" "}
          <span>Historical data prototype</span>
        </footer>
      </div>
      {selectedFinding && (
        <div
          className="modal-backdrop"
          onClick={() => setSelectedFinding(null)}
        >
          <section
            className="finding-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="finding-title"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Escape") setSelectedFinding(null);
            }}
          >
            <button
              autoFocus
              className="close-dialog"
              aria-label="Close finding details"
              onClick={() => setSelectedFinding(null)}
            >
              ×
            </button>
            <div className="eyebrow">
              SYNTHETIC FINDING · {selectedFinding.anomaly_id}
            </div>
            <h2 id="finding-title">{selectedFinding.asset_name}</h2>
            <span
              className={`badge severity ${selectedFinding.severity.toLowerCase()}`}
            >
              {selectedFinding.severity}
            </span>
            <p>{selectedFinding.description}</p>
            <dl>
              <div>
                <dt>Location</dt>
                <dd>
                  {selectedFinding.location_name} /{" "}
                  {selectedFinding.location_id}
                </dd>
              </div>
              <div>
                <dt>Mission</dt>
                <dd>{selectedFinding.mission_id}</dd>
              </div>
              <div>
                <dt>Recorded</dt>
                <dd>{timestamp(selectedFinding.timestamp)}</dd>
              </div>
              <div>
                <dt>Operator review</dt>
                <dd>
                  {selectedFinding.operator_review_required
                    ? "Required"
                    : "Not flagged"}
                </dd>
              </div>
            </dl>
            <p className="tiny-note">
              Review decisions are not saved in this prototype.
            </p>
            <button
              className="refresh-button"
              onClick={() => setSelectedFinding(null)}
            >
              Close details
            </button>
          </section>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
