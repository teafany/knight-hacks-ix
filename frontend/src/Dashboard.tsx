import { lazy, Suspense, useEffect, useRef, useState } from "react";

import { loadDashboard, loadLidar } from "./api";

import type { DashboardData, Finding, LidarData, Severity } from "./types";

import WorkspaceSidebar from "./WorkspaceSidebar";
import type { SummarySelection } from "./summaryViews";

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

type DashboardProps = {

  onHome: () => void;
  onNavigate: (page: "dashboard" | "lidar" | "relay") => void;
  onSummarySelect: (selection: SummarySelection | null) => void;

};

function Dashboard({ onHome, onNavigate, onSummarySelect }: DashboardProps) {

    const [data, setData] = useState<DashboardData | null>(null);

  const [lidar, setLidar] = useState<LidarData | null>(null);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  const [lidarError, setLidarError] = useState("");

  const selectedWaypoint = "WP01";

  const showHistory = false;

  const [showObstruction, setShowObstruction] = useState(true);

  const [severity, setSeverity] = useState("ALL");

const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);

  const [search, setSearch] = useState("");

  const [reviewOnly, setReviewOnly] = useState(false);

  const [showAllFindings, setShowAllFindings] = useState(false);
  const [activeSection, setActiveSection] = useState("overview");
  const selectedSection = useRef<string | null>(null);

    useEffect(() => {

    const controller = new AbortController();

    loadDashboard("demo", controller.signal)

      .then((result) => {

        if (!controller.signal.aborted) setData(result);

      })

      .catch((reason) => {

        if (!controller.signal.aborted) setError(`Inspection data could not load: ${reason.message}`);

      })

      .finally(() => {

        if (!controller.signal.aborted) setLoading(false);

      });

    return () => controller.abort();

  }, []);



useEffect(() => {

    const controller = new AbortController();

    loadLidar(controller.signal)

      .then(setLidar)

      .catch((reason) => {

        if (reason.name !== "AbortError")

          setLidarError(`Lidar assets could not load: ${reason.message}`);

      });

    return () => controller.abort();

  }, []);

    // Highlight the sidebar link for the section currently in view.
  useEffect(() => {
    const sectionIds = ["overview", "digital-twin", "findings", "missions"];

    const updateActiveSection = () => {
      // A short final section can share the same scroll position as Findings.
      // Keep an explicit section choice until the user scrolls manually.
      if (selectedSection.current) return;
      const scrollPosition = window.scrollY + 180;
      let currentSection = "overview";

      for (const id of sectionIds) {
        const section = document.getElementById(id);
        if (section && section.getBoundingClientRect().top + window.scrollY <= scrollPosition) {
          currentSection = id;
        }
      }

      // The last section can be shorter than the viewport.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
        currentSection = "missions";
      }

      setActiveSection(currentSection);
    };

    const resumeScrollTracking = () => {
      selectedSection.current = null;
    };
    const resize = () => {
      resumeScrollTracking();
      updateActiveSection();
    };

    window.addEventListener("scroll", updateActiveSection, { passive: true });
    window.addEventListener("resize", resize);
    window.addEventListener("wheel", resumeScrollTracking, { passive: true });
    window.addEventListener("touchstart", resumeScrollTracking, { passive: true });
    window.addEventListener("pointerdown", resumeScrollTracking);
    window.addEventListener("keydown", resumeScrollTracking);
    updateActiveSection();

    return () => {
      window.removeEventListener("scroll", updateActiveSection);
      window.removeEventListener("resize", resize);
      window.removeEventListener("wheel", resumeScrollTracking);
      window.removeEventListener("touchstart", resumeScrollTracking);
      window.removeEventListener("pointerdown", resumeScrollTracking);
      window.removeEventListener("keydown", resumeScrollTracking);
    };
  }, []);

  // Only the single real-world room (WP01) and inspection mission M001 are shown.

  const mission = data?.missions.find((row) => row.mission_id === "M001");

  // Each visible detection box gets exactly one inspection finding.

  // Hazard categories are fictional demo assignments, not Lidar measurements.

  const hazardExamples: Array<{

    name: string;

    severity: Severity;

    description: string;

  }> = [

    { name: "Radiation zone (simulated)", severity: "CRITICAL", description: "DEMO SCENARIO: Potential radiation hazard assigned to this detected geometric change. No radiation sensor reading was collected." },

    { name: "Toxic gas zone (simulated)", severity: "CRITICAL", description: "DEMO SCENARIO: Potential gas leak assigned to this detected geometric change. No gas sensor reading was collected." },

    { name: "Overheating equipment (simulated)", severity: "HIGH", description: "DEMO SCENARIO: Potential overheating equipment assigned to this detected geometric change. No temperature sensor reading was collected." },

    { name: "Blocked access (simulated)", severity: "MEDIUM", description: "DEMO SCENARIO: Potential access obstruction assigned to this detected geometric change. Physical obstruction has not been verified." },

    { name: "Moved equipment (simulated)", severity: "LOW", description: "DEMO SCENARIO: Potential moved equipment assigned to this detected geometric change. Requires operator review." },

  ];

  const roomFindings: Finding[] = (lidar?.clustered_changes ?? []).map((change, index) => {

    const example = hazardExamples[index];

    const severity: Severity = example?.severity ?? "LOW";

    return {

      anomaly_id: change.id,

      mission_id: "M001",

      asset_name: example?.name ?? `Geometric change ${index + 1}`,

      location_id: "WP01",

      location_name: "Hazardous facility room",

      timestamp: mission?.start_time ?? "",

      severity,

      description: `${example?.description ?? "Geometric difference detected between scans; object and hazard type are unverified."} Cluster: ${change.id}. ${change.point_count.toLocaleString()} changed points. Bounding box dimensions: ${change.dimensions.x.toFixed(2)} × ${change.dimensions.y.toFixed(2)} × ${change.dimensions.z.toFixed(2)} (scan units).`,

      operator_review_required: severity === "CRITICAL" || severity === "HIGH",

      synthetic: true,

    };

  });

  const findings = roomFindings.filter(

    (row) =>

      (!reviewOnly || row.operator_review_required) &&

      (severity === "ALL" || row.severity === severity) &&

      (!search.trim() || [row.anomaly_id, row.asset_name, row.location_name, row.description]

        .some((value) => value.toLowerCase().includes(search.trim().toLowerCase()))),

  );

  const reviewCount = roomFindings.filter((row) => row.operator_review_required).length;

  const highestSeverity = severities.find((level) => roomFindings.some((row) => row.severity === level)) ?? "NONE";

  const clusteredChange = lidar?.clustered_changes?.[0];

  // Legacy synthetic waypoint distances aren't registered to the current GLB.

  const locationName = "Hazardous facility room";



return (

    <div className="operations-dashboard app-shell">

              <style>{`

        /* Panel height is set by the neighboring info column, not by the viewer */

        .twin-grid {

          align-items: stretch !important;

        }



        .twin-grid > .twin-panel {

          display: flex !important;

          flex-direction: column !important;

          align-self: stretch !important;

          height: auto !important;

          min-height: 0 !important;

          padding-bottom: 0 !important;

          overflow: hidden;

        }



        /* viewer-wrap takes whatever height is left under the toolbar */

        .twin-grid > .twin-panel .viewer-wrap {

          display: flex !important;

          flex-direction: column !important;

          flex: 1 1 0 !important;

          min-height: 420px !important;   /* floor only; the column beside it sets the real height */

          margin-bottom: 0 !important;

          padding-bottom: 0 !important;

        }



        .twin-grid > .twin-panel .viewer-stage {

          position: relative !important;

          flex: 1 1 0 !important;

          height: auto !important;

          min-height: 0 !important;

        }



        /* The canvas host is absolute, so it never pushes the panel taller */

        .twin-grid > .twin-panel .viewer-stage > .viewer {

          position: absolute !important;

          inset: 0 !important;

          width: 100% !important;

          height: 100% !important;

          min-height: 0 !important;

        }



        .twin-grid > .twin-panel .viewer-stage canvas {

          display: block;

          width: 100% !important;

          height: 100% !important;

        }



        .twin-grid > .twin-panel .viewer-label,

        .twin-grid > .twin-panel .reset-view,

        .twin-grid > .twin-panel .viewer-help,

        .twin-grid > .twin-panel .axis-label,

        .twin-grid > .twin-panel .viewer-error {

          z-index: 2;

        }



        .twin-grid > .twin-panel .marker-toolbar,

        .twin-grid > .twin-panel .coordinate-note {

          display: none !important;

        }

      `}</style>

      <WorkspaceSidebar
        activePage="lidar"
        activeSection={activeSection}
        onHome={onHome}
        onNavigate={onNavigate}
        onSummarySelect={onSummarySelect}
        onSectionSelect={(section) => {
          selectedSection.current = section;
          setActiveSection(section);
          document.getElementById(section)?.scrollIntoView({
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
              ? "instant"
              : "smooth",
            block: "start",
          });
        }}
      />

      <div className="dashboard-content" id="overview">

        <header className="topbar">

          <span>

            Lidar <span className="slash">/</span> Facility Lidar

          </span>



        </header>

        <div className="page-heading">

          <div>

            <div className="eyebrow">INSPECTION INTELLIGENCE</div>

            <h1>Lidar workspace</h1>

            <p>

              One-room inspection · mission M001.

            </p>

          </div>

                    </div>

{error && (

          <div className="error-banner" role="alert">

            {error}

          </div>

        )}

                  <section className="metrics-grid" aria-label="Inspection metrics" aria-busy={loading}>

            {[

              { label: "Mission", value: mission?.mission_id ?? "—", detail: mission?.mission_status ?? "No M001 record", icon: "↗" },

              { label: "Action success", value: mission ? pct(((mission.total_actions - mission.failed_actions) / Math.max(mission.total_actions, 1)) * 100) : "—", detail: mission ? `${mission.total_actions - mission.failed_actions} of ${mission.total_actions} actions successful` : "No mission data", icon: "✓" },

              { label: "Inspection findings", value: roomFindings.length, detail: "One finding per displayed change box", icon: "◉" },

              { label: "Operator review", value: reviewCount, detail: "Findings flagged for review", icon: "⚑" },

            ].map((card, index) => (

              <article className={`metric-card metric-${index}`} key={card.label}>

                <div className="metric-label">{card.label}<span>{card.icon}</span></div>

                <strong>{loading ? "…" : card.value}</strong>

                <p>{card.detail}</p>

              </article>

            ))}

          </section>



<section className="twin-grid" id="digital-twin">

          <article className="panel twin-panel">

            <div className="panel-heading">

              <div>

                <h2>Facility Lidar</h2>

                <p>Updated facility scan · WP01</p>

              </div>

              <span className="badge neutral-badge">

                WP01

              </span>

            </div>

            <div className="layer-toolbar">

              <label>

                <input

                  type="checkbox"

                  checked={showObstruction}

                  onChange={(event) => setShowObstruction(event.target.checked)}

                />

                Detected changes

              </label>

              <span>update_room_hazard.glb</span>

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

                  onSelect={() => {}}

                  showHistory={showHistory}

                  showObstruction={showObstruction}

                />

              </Suspense>

            ) : (

              <div

                className="viewer-placeholder"

                role={lidarError ? "alert" : "status"}

              >

                {lidarError || "Loading Lidar exports…"}

              </div>

            )}

            </article>

            <div className="twin-details">

                          <article className="panel waypoint-panel">

                <div className="eyebrow">FACILITY LOCATION</div>

                <div className="waypoint-title">

                  <h2>WP01</h2>

                  <span className={`badge severity ${highestSeverity.toLowerCase()}`}>{highestSeverity}</span>

                </div>

                <p>{locationName}</p>

                <div className="waypoint-stat">

                  <strong>{roomFindings.length}</strong>

                  <span>inspection findings<br />for M001</span>

                </div>

                <div className="mini-bars">

                  {severities.map((level) => {

                    const count = roomFindings.filter((row) => row.severity === level).length;

                    return (

                      <div key={level}>

                        <span>{level.toLowerCase()}</span>

                        <div className="bar-track">

                          <i className={level.toLowerCase()} style={{ width: `${(count / Math.max(roomFindings.length, 1)) * 100}%` }} />

                        </div>

                        <b>{count}</b>

                      </div>

                    );

                  })}

                </div>

                <button className="text-button" onClick={() => document.getElementById("findings")?.scrollIntoView({ behavior: "smooth" })}>

                  View inspection findings →

                </button>

              </article>

<article className="panel obstruction-panel">

              <div className="eyebrow">POINT CLOUD COMPARISON</div>

              <h2>

                <span className="dot red" />

                ICP + DBSCAN Detection

              </h2>

              <p>

                Geometric changes detected using ICP alignment and DBSCAN clustering of room scans.

              </p>

              <dl>

                <div>

                  <dt>Change ID</dt>

                  <dd>{clusteredChange?.id ?? "—"}</dd>

                </div>

                <div>

                  <dt>Changed points</dt>

                  <dd>

                    {clusteredChange?.point_count?.toLocaleString() ?? "—"}

                  </dd>

                </div>

                <div>

                  <dt>Clusters detected</dt>

                  <dd>{lidar?.clustered_changes.length ?? "—"}</dd>

                </div>

                <div>

                  <dt>Review status</dt>

                  <dd>{clusteredChange?.review_status ?? "—"}</dd>

                </div>

                <div>

                  <dt>AI confidence</dt>

                  <dd>Unavailable</dd>

                </div>

              </dl>

                              <p className="tiny-note">

                  Each detected box is listed as a finding for WP01 / M001. Hazard scenarios are fictional; the scan cannot measure radiation, gas, or temperature.

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

              <p>WP01 · M001 · one simulated finding per detected change box</p>

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

              </div>

          </div>

          <div className="finding-search">

            <label>

              Search findings

              <input

                type="search"

                value={search}

                placeholder="Asset or description"

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

                  <th>Demo mission time</th>

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

                                    {mission && (

                    <tr key={mission.mission_id}>

                      <td><strong>{mission.mission_id}</strong></td>

                      <td><span className={`badge ${mission.mission_status === "COMPLETED" ? "cyan-badge" : "severity critical"}`}>{mission.mission_status}</span></td>

                      <td>{mission.duration_min} min</td>

                      <td>{mission.failed_actions} / {mission.total_actions}</td>

                      <td>{mission.battery_used_pct} pp</td>

                    </tr>

                  )}

</tbody>

              </table>

            </div>

            {!mission && (

              <div className="empty-state">

                {loading ? "Loading missions…" : "No missions available."}

              </div>

            )}

            </article>

          </section>

        <footer className="page-footer">

          Knight Hacks IX · Facility inspection{" "}

          <span>Simulated inspection data</span>

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

              SIMULATED FINDING · {selectedFinding.anomaly_id}

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

              Review decisions are not saved in this dashboard.

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
