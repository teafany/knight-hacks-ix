import { useState } from "react";
import {
  BarChart3,
  ChevronRight,
  ClipboardCheck,
  Cpu,
  Database,
  Home,
  Map,
  Radar,
  Route,
} from "lucide-react";
import type { SummarySelection } from "./summaryViews";
import "./WorkspaceSidebar.css";

type Props = {
  activePage: "summary" | "lidar";
  selection?: SummarySelection | null;
  activeSection?: string;
  onHome: () => void;
  onNavigate: (page: "dashboard" | "lidar" | "relay") => void;
  onSummarySelect: (selection: SummarySelection | null) => void;
  onSectionSelect?: (section: string) => void;
};

const twinSections = [
  { id: "overview", label: "Overview" },
  { id: "digital-twin", label: "Lidar" },
  { id: "findings", label: "Findings" },
  { id: "missions", label: "Missions" },
];

export default function WorkspaceSidebar({
  activePage,
  selection,
  activeSection,
  onHome,
  onNavigate,
  onSummarySelect,
  onSectionSelect,
}: Props) {
  const [twinExpanded, setTwinExpanded] = useState(false);
  const inTwin = activePage === "lidar";
  const summaryItems = [
    { label: "Summary", icon: BarChart3, view: null },
    {
      label: "Review queue",
      icon: ClipboardCheck,
      view: { section: "findings", review: true },
    },
    { label: "AI evidence", icon: Cpu, view: { section: "models" } },
    { label: "Collected data", icon: Database, view: { section: "evidence" } },
  ] satisfies {
    label: string;
    icon: typeof BarChart3;
    view: SummarySelection | null;
  }[];

  return (
    <aside
      className={`workspace-sidebar ${activePage === "summary" ? "workspace-sidebar-summary" : ""}`}
    >
      <button
        type="button"
        className="workspace-brand"
        onClick={onHome}
        aria-label="Spotlight home"
      >
        <span>S</span>
        <strong>SPOTLIGHT</strong>
      </button>
      <p className="workspace-nav-label">Inspection intelligence</p>
      <nav aria-label="Summary sections">
        {summaryItems.map(({ label, icon: Icon, view }) => {
          const active =
            activePage === "summary" &&
            (view ? selection?.section === view.section : !selection);
          return (
            <button
              type="button"
              key={label}
              className={active ? "active" : ""}
              aria-current={active ? "page" : undefined}
              onClick={() => onSummarySelect(view)}
            >
              <Icon size={18} aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </nav>
      <p className="workspace-nav-label">Explore workspace</p>
      <nav aria-label="Other workspaces">
        <button type="button" onClick={onHome}>
          <Home size={18} aria-hidden="true" />
          Home
        </button>
        <button type="button" onClick={() => onNavigate("dashboard")}>
          <Map size={18} aria-hidden="true" />
          Facility map
        </button>
        <div className="workspace-twin-group">
          <button
            type="button"
            className={inTwin ? "active" : ""}
            aria-current={inTwin ? "page" : undefined}
            aria-expanded={inTwin ? twinExpanded : undefined}
            aria-controls={inTwin ? "digital-twin-sections" : undefined}
            onClick={() => {
              if (inTwin) setTwinExpanded(!twinExpanded);
              else onNavigate("lidar");
            }}
          >
            <Radar size={18} aria-hidden="true" />
            Lidar
            {inTwin && (
              <ChevronRight
                size={14}
                className={`workspace-chevron ${twinExpanded ? "expanded" : ""}`}
                aria-hidden="true"
              />
            )}
          </button>
          {inTwin && (
            <ul
              id="digital-twin-sections"
              className="workspace-twin-sections"
              hidden={!twinExpanded}
            >
              {twinSections.map(({ id, label }) => (
                <li key={id}>
                  <button
                    type="button"
                    className={activeSection === id ? "active" : ""}
                    aria-current={activeSection === id ? "location" : undefined}
                    onClick={() => onSectionSelect?.(id)}
                  >
                    <span className="workspace-section-dot" aria-hidden="true" />
                    {label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button type="button" onClick={() => onNavigate("relay")}>
          <Route size={18} aria-hidden="true" />
          Mission replay
        </button>
      </nav>
      <div className="workspace-sidebar-footer">
        <span className="workspace-live-dot" />
        Knight Hacks IX
        <p>
          Recorded inspections.
          <br />A clearer next move.
        </p>
      </div>
    </aside>
  );
}
