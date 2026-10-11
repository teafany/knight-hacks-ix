import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Boxes,
  ClipboardCheck,
  GitCompareArrows,
  Home,
  Map,
  Play,
  Radar,
  Route,
  Workflow,
  TableProperties,
  type LucideIcon,
} from "lucide-react";
import Dashboard from "./Dashboard";
import DatasetDashboard from "./DatasetDashboard";
import RelayPage from "./RelayPage";
import SummaryPage from "./SummaryPage";
import FloatingNav from "./FloatingNav";
import WorkspaceSidebar from "./WorkspaceSidebar";
import { summarySearch, type SummarySelection } from "./summaryViews";
import robotImage from "./assets/spot-robot.svg";
import "./App.css";

type Capability = {
  id: string;
  number: string;
  title: string;
  text: string;
  meta: string;
  target: string;
  icon: LucideIcon;
};

type Page = "landing" | "lidar" | "dashboard" | "relay" | "summary";

const capabilities: Capability[] = [
  {
    id: "existing-inspections",
    number: "01",
    title: "Mission inspections",
    text: "Compare mission completion, action failures, durations, and battery use across historical inspections.",
    meta: "Dashboard / Missions",
    target: "missions",
    icon: BarChart3,
  },
  {
    id: "lidar-data",
    number: "02",
    title: "Spatial context",
    text: "Understand every waypoint, asset, and inspection finding inside a simulated facility Lidar view.",
    meta: "3D / Lidar",
    target: "digital-twin",
    icon: Boxes,
  },
  {
    id: "anomaly-analysis",
    number: "03",
    title: "Actionable findings",
    text: "Turn raw inspection signals into prioritized anomalies with clear, explainable evidence.",
    meta: "Analysis / Findings",
    target: "findings",
    icon: AlertTriangle,
  },
  {
    id: "timeline-events",
    number: "04",
    title: "Configuration comparison",
    text: "Compare baseline and improved scenarios while keeping mission completion separate from action success.",
    meta: "Baseline / Improved",
    target: "missions",
    icon: GitCompareArrows,
  },
  {
    id: "relay-replay",
    number: "05",
    title: "Relay replay",
    text: "Play back the replay.ndjson mission feed, watch SPOT move, and inspect related action events in time.",
    meta: "Replay / Timeline",
    target: "relay",
    icon: Route,
  },
  {
    id: "inspection-summary",
    number: "06",
    title: "The full picture",
    text: "Bring mission outcomes, priority findings, saved AI evidence, and spatial changes into one inspection summary.",
    meta: "Summary / Intelligence",
    target: "summary",
    icon: ClipboardCheck,
  },
];

export default function App() {
  const [page, setPage] = useState<Page>(() => {
    if (
      window.location.pathname === "/summary" ||
      window.location.hash === "#summary" ||
      window.location.hash.startsWith("#summary-")
    )
      return "summary";
    if (window.location.pathname === "/relay") return "relay";
    if (window.location.hash === "#lidar") return "lidar";
    if (window.location.hash === "#dashboard") return "dashboard";
    if (window.location.hash === "#relay") return "relay";
    return "landing";
  });

  useEffect(() => {
    const syncRoute = () => {
      if (
        window.location.pathname === "/summary" ||
        window.location.hash === "#summary" ||
        window.location.hash.startsWith("#summary-")
      ) {
        setPage("summary");
        return;
      }
      if (window.location.pathname === "/relay") {
        setPage("relay");
        return;
      }
      if (window.location.hash === "#lidar") setPage("lidar");
      if (window.location.hash === "#dashboard") setPage("dashboard");
      if (window.location.hash === "#relay") setPage("relay");
      if (
        window.location.hash === "#top" ||
        (window.location.pathname === "/" && !window.location.hash)
      )
        setPage("landing");
    };

    window.addEventListener("hashchange", syncRoute);
    window.addEventListener("popstate", syncRoute);
    return () => {
      window.removeEventListener("hashchange", syncRoute);
      window.removeEventListener("popstate", syncRoute);
    };
  }, []);

  const openLandingPage = () => {
    setPage("landing");
    window.history.pushState(null, "", "/#top");
    window.setTimeout(() => {
      document.getElementById("top")?.scrollIntoView();
    }, 0);
  };

  const openLidarPage = (target = "digital-twin") => {
    setPage("lidar");
    window.history.pushState(null, "", "/#lidar");
    window.setTimeout(() => {
      document.getElementById(target)?.scrollIntoView();
    }, 0);
  };

  const openDashboardPage = () => {
    setPage("dashboard");
    window.history.pushState(null, "", "/#dashboard");
    window.setTimeout(() => {
      document.getElementById("dataset-search")?.scrollIntoView();
    }, 0);
  };

  const openRelayPage = (missionId?: string) => {
    setPage("relay");
    const query = missionId
      ? `?mission_id=${encodeURIComponent(missionId)}`
      : "";
    window.history.pushState(null, "", `/relay${query}`);
    window.setTimeout(() => {
      document.getElementById("relay")?.scrollIntoView();
    }, 0);
  };

  const openSummaryPage = (selection: SummarySelection | null = null) => {
    setPage("summary");
    const source =
      page === "summary" &&
      new URLSearchParams(window.location.search).get("source") === "api"
        ? "api"
        : "demo";
    window.history.pushState(
      null,
      "",
      `/summary${summarySearch(selection, source)}`,
    );
    window.dispatchEvent(new PopStateEvent("popstate"));
    window.scrollTo(0, 0);
  };

  const navigateWorkspace = (destination: "dashboard" | "lidar" | "relay") => {
    if (destination === "dashboard") openDashboardPage();
    if (destination === "lidar") openLidarPage();
    if (destination === "relay") openRelayPage();
  };

  const navItems: {
    page: Page;
    label: string;
    icon: LucideIcon;
    onClick: () => void;
  }[] = [
    { page: "landing", label: "Home", icon: Home, onClick: openLandingPage },
    {
      page: "dashboard",
      label: "Inspect data",
      icon: TableProperties,
      onClick: openDashboardPage,
    },
    {
      page: "relay",
      label: "Replay",
      icon: Play,
      onClick: () => openRelayPage(),
    },
    {
      page: "lidar",
      label: "Lidar",
      icon: Radar,
      onClick: () => openLidarPage(),
    },
    {
      page: "summary",
      label: "Summary",
      icon: ClipboardCheck,
      onClick: () => openSummaryPage(),
    },
  ];

  const appNav = <FloatingNav activePage={page} items={navItems} />;
  const workspaceSidebar = (
    <WorkspaceSidebar
      activePage={page}
      onHome={openLandingPage}
      onNavigate={navigateWorkspace}
      onSummarySelect={openSummaryPage}
    />
  );

  if (page === "summary") {
    return (
      <>
        {appNav}
        <SummaryPage
          onHome={openLandingPage}
          onNavigate={navigateWorkspace}
        />
      </>
    );
  }

  if (page === "lidar") {
    return (
      <>
        {appNav}
        <main className="lidar-page" id="lidar">
          <Dashboard
            onHome={openLandingPage}
            onNavigate={navigateWorkspace}
            onSummarySelect={openSummaryPage}
          />
        </main>
      </>
    );
  }

  if (page === "dashboard") {
    return (
      <>
        {appNav}
        <main className="dataset-page" id="dashboard">
          <DatasetDashboard
            onHome={openLandingPage}
            onNavigate={navigateWorkspace}
            onSummarySelect={openSummaryPage}
            onOpenReplay={openRelayPage}
          />
        </main>
      </>
    );
  }

  if (page === "relay") {
    return (
      <>
        {appNav}
        <div className="workspace-page-shell">
          {workspaceSidebar}
          <div className="relay-route workspace-page-content" id="relay">
            <RelayPage
              initialMissionId={
                new URLSearchParams(window.location.search).get("mission_id") ??
                undefined
              }
            />
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="workspace-page-shell">
      {appNav}
      {workspaceSidebar}
      <main className="site-shell workspace-page-content">
        <section className="hero" id="top" aria-labelledby="hero-title">
          <div className="intro">
            <p className="kicker">
              <span />
              Mission intelligence for SPOT operators
            </p>
            <h1 id="hero-title">
              What will
              <strong>SPOT</strong>
              <div style={{ marginTop: "-1.5rem" }}>explore?</div>
            </h1>
            <p className="hero-copy">
              One operational picture for replaying autonomous inspections,
              reviewing spatial changes, and finding the events that matter.
            </p>
            <div className="actions">
              <a
                href="/summary"
                onClick={(event) => {
                  event.preventDefault();
                  openSummaryPage();
                }}
              >
                <span className="action-label">
                  <BarChart3 aria-hidden="true" />
                  Inspection summary
                </span>
                <ArrowRight aria-hidden="true" />
              </a>
              <a
                className="integration-button"
                href="#dashboard"
                onClick={(event) => {
                  event.preventDefault();
                  openDashboardPage();
                }}
              >
                <span className="action-label">
                  <ClipboardCheck aria-hidden="true" />
                  Inspect data
                </span>
                <ArrowRight aria-hidden="true" />
              </a>
              <a
                href="#lidar"
                onClick={(event) => {
                  event.preventDefault();
                  openLidarPage("digital-twin");
                }}
              >
                <span className="action-label">
                  <Radar aria-hidden="true" />
                  Explore Lidar
                </span>
                <ArrowRight aria-hidden="true" />
              </a>
              <a
                href="/relay"
                onClick={(event) => {
                  event.preventDefault();
                  openRelayPage();
                }}
              >
                <span className="action-label">
                  <Play aria-hidden="true" />
                  Replay relay
                </span>
                <ArrowRight aria-hidden="true" />
              </a>
            </div>
          </div>

          <div className="visual" aria-label="Spot robot mission overview">
            <div className="status-pill">
              <span />
              bz-woof! hello!!
            </div>
            <div className="mission-card">
              <p>Inspection workspace</p>
              <strong>15</strong>
              <span>
                facility <br></br>waypoints
              </span>
              <div className="mission-meta">
                <span>Synthetic dataset</span>
                <span>Historical records</span>
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
            {capabilities.map((capability) => {
              const CapabilityIcon = capability.icon;
              return (
                <article
                  className="capability-card"
                  id={capability.id}
                  key={capability.number}
                >
                  <div className="card-topline">
                    <span>{capability.number}</span>
                    <span className="card-meta">
                      <span>{capability.meta}</span>
                      <CapabilityIcon aria-hidden="true" />
                    </span>
                  </div>
                  <h3>{capability.title}</h3>
                  <p>{capability.text}</p>
                  <a
                    className="capability-link"
                    href={
                      capability.target === "summary"
                        ? "/summary"
                        : capability.target === "relay"
                          ? "/relay"
                          : "/#lidar"
                    }
                    onClick={(event) => {
                      event.preventDefault();
                      if (capability.target === "summary") {
                        openSummaryPage();
                      } else if (capability.target === "relay") {
                        openRelayPage();
                      } else {
                        openLidarPage(capability.target);
                      }
                    }}
                  >
                    Open workspace <ArrowRight aria-hidden="true" />
                  </a>
                </article>
              );
            })}
          </div>
        </section>

        <section className="workflow-section" id="workflow">
          <div className="workflow-intro">
            <p className="section-label">The mission loop</p>
            <h2>Replay. Understand. Act.</h2>
          </div>
          <ol className="workflow-list">
            <li>
              <span>
                <ClipboardCheck aria-hidden="true" />
              </span>
              <div>
                <strong>Capture</strong>
                <p>
                  Mission, sensor, action, and spatial data arrive as one record.
                </p>
              </div>
            </li>
            <li>
              <span>
                <Map aria-hidden="true" />
              </span>
              <div>
                <strong>Contextualize</strong>
                <p>
                  Readings connect to assets, locations, waypoints, and prior
                  missions.
                </p>
              </div>
            </li>
            <li>
              <span>
                <Workflow aria-hidden="true" />
              </span>
              <div>
                <strong>Prioritize</strong>
                <p>
                  Teams see what changed, why it matters, and where SPOT should go
                  next.
                </p>
              </div>
            </li>
          </ol>
        </section>

        <footer id="contact">
          <p>Autonomous inspection, made understandable.</p>
          <a href="#top">
            Back to mission <ArrowRight aria-hidden="true" />
          </a>
        </footer>
      </main>
    </div>
  );
}
