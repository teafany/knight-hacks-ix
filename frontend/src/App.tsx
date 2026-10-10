import robotImage from "./assets/spot-robot.svg";
import "./App.css";

const capabilities = [
  {
    id: "existing-inspections",
    number: "01",
    title: "Mission replay",
    text: "Bring mission status, replay events, sensor readings, locations, and timestamps into one calm operator view.",
    meta: "Dashboard / Replay",
  },
  {
    id: "lidar-data",
    number: "02",
    title: "Spatial context",
    text: "Understand every waypoint, asset, and inspection finding inside a two-floor digital twin.",
    meta: "3D / LiDAR",
  },
  {
    id: "anomaly-analysis",
    number: "03",
    title: "Actionable findings",
    text: "Turn raw inspection signals into prioritized anomalies with clear, explainable evidence.",
    meta: "Analysis / Alerts",
  },
  {
    id: "timeline-events",
    number: "04",
    title: "Timeline clarity",
    text: "Keep replay intelligence tied to real timestamps so teams can see what changed and when.",
    meta: "Events / Time",
  },
];

function ArrowIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14M14 7l5 5-5 5" />
    </svg>
  );
}

export default function App() {
  return (
    <main className="site-shell">
      <section className="hero" id="top" aria-labelledby="hero-title">
        <div className="intro">
          <p className="kicker">
            <span />
            Mission intelligence for SPOT operators
          </p>
          <h1 id="hero-title">
            What will
            <strong>SPOT</strong>
            explore?
          </h1>
          <p className="hero-copy">
            One operational picture for replaying autonomous inspections,
            reviewing spatial changes, and finding the events that matter.
          </p>
          <div className="actions">
            <a href="#existing-inspections">
              Previous inspections
              <ArrowIcon />
            </a>
            <a href="#lidar-data">
              LiDAR predictions
              <ArrowIcon />
            </a>
          </div>
        </div>

        <div className="visual" aria-label="Spot robot mission overview">
          <div className="status-pill">
            <span />
            Replay synced
          </div>
          <div className="mission-card">
            <p>Latest inspection</p>
            <strong>04</strong>
            <span>findings to review</span>
            <div className="mission-meta">
              <span>Floor 2</span>
              <span>08:42:16</span>
            </div>
          </div>
          <div className="robot-wrap">
            <img
              src={robotImage}
              alt="Yellow Boston Dynamics Spot inspection robot"
            />
          </div>
        </div>
      </section>

      <section
        className="capabilities-section"
        id="capabilities"
        aria-labelledby="capabilities-title"
      >
        <div className="section-heading">
          <p>One connected mission layer</p>
          <h2 id="capabilities-title">
            From raw replay data to a clear next move.
          </h2>
        </div>
        <div className="capability-grid">
          {capabilities.map((capability) => (
            <article
              className="capability-card"
              id={capability.id}
              key={capability.number}
            >
              <div className="card-topline">
                <span>{capability.number}</span>
                <span>{capability.meta}</span>
              </div>
              <h3>{capability.title}</h3>
              <p>{capability.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="workflow-section" id="workflow">
        <div className="workflow-intro">
          <p className="section-label">The mission loop</p>
          <h2>Replay. Understand. Act.</h2>
        </div>
        <ol className="workflow-list">
          <li>
            <span>01</span>
            <div>
              <strong>Capture</strong>
              <p>Mission, sensor, action, and spatial data arrive as one record.</p>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <strong>Contextualize</strong>
              <p>Readings connect to assets, locations, waypoints, and prior missions.</p>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <strong>Prioritize</strong>
              <p>Teams see what changed, why it matters, and where SPOT should go next.</p>
            </div>
          </li>
        </ol>
      </section>

      <footer id="contact">
        <p>Autonomous inspection, made understandable.</p>
        <a href="#top">
          Back to mission <ArrowIcon />
        </a>
      </footer>
    </main>
  );
}
