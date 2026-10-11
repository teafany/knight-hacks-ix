import { ArrowRight, ChevronRight, Database, Radar } from "lucide-react";
import type { ReactNode } from "react";
import { summarizeEvidence, summarizeMissionDays } from "./summaryInsights";
import type { SummaryData } from "./summaryTypes";
import type { SummarySelection } from "./summaryViews";
import type { ClusteredChange, Severity } from "./types";

type Props = {
  data: SummaryData;
  spatial: ClusteredChange[] | null;
  onSelect: (selection: SummarySelection | null) => void;
};
const severityColors: Record<Severity, string> = {
  CRITICAL: "#e77870",
  HIGH: "#e6a256",
  MEDIUM: "#dfb238",
  LOW: "#92997d",
  NONE: "#747469",
};
const severityOrder: Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "NONE"];
const dateLabel = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });

function ChartCard({
  title,
  subtitle,
  onOpen,
  children,
}: {
  title: string;
  subtitle: string;
  onOpen: () => void;
  children: ReactNode;
}) {
  return (
    <section className="summary-panel summary-chart-card">
      <div className="summary-chart-heading">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <button
          className="summary-chart-open"
          onClick={onOpen}
          aria-label={`View ${title.toLowerCase()} details`}
          title="View details"
        >
          <ArrowRight size={18} />
        </button>
      </div>
      {children}
    </section>
  );
}

export default function SummaryOverview({ data, spatial, onSelect }: Props) {
  const insights = summarizeEvidence(data);
  const days = summarizeMissionDays(data);
  const severities = severityOrder.map((severity) => ({
    severity,
    count: data.findings.filter((row) => row.severity === severity).length,
  }));
  const total = data.findings.length;
  const gradient = severities
    .map((row, index) => {
      const start =
        (severities.slice(0, index).reduce((sum, item) => sum + item.count, 0) /
          Math.max(1, total)) *
        100;
      const end = start + (row.count / Math.max(1, total)) * 100;
      return row.count
        ? `${severityColors[row.severity]} ${start}% ${end}%`
        : null;
    })
    .filter(Boolean)
    .join(", ");
  const hotspots = insights.hotspots.slice(0, 5);
  const maxArea = Math.max(1, ...hotspots.map((row) => row.count));
  const models = data.model_summary.models.map((row) => {
    const records = data.detections.filter(
      (detection) => detection.model_id === row.model_id,
    );
    const pending = records.filter(
      (detection) => detection.review_status === "pending",
    ).length;
    const kind = row.model?.endpoint.split("/").at(-1);
    return {
      id: row.model_id,
      name: kind ? `${kind[0].toUpperCase()}${kind.slice(1)}` : row.model_id,
      total: records.length,
      pending,
      reviewed: records.length - pending,
    };
  });
  const maxModel = Math.max(1, ...models.map((row) => row.total));
  const firstDay = days.length ? Date.parse(days[0].day) : 0;
  const lastDay = days.length ? Date.parse(days[days.length - 1].day) : 0;
  const x = (index: number) =>
    firstDay === lastDay
      ? 290
      : 48 +
        ((Date.parse(days[index].day) - firstDay) / (lastDay - firstDay)) * 490;
  const y = (success: number) => 135 - (success / 100) * 110;
  // A day with no actions is a gap, rather than a zero-percent observation.
  const segments: string[] = [];
  days.forEach((day, index) => {
    if (day.success === null) return;
    segments.push(
      `${index === 0 || days[index - 1].success === null ? "M" : "L"}${x(index)},${y(day.success)}`,
    );
  });
  return (
    <>
      <div className="summary-chart-toolbar">
        <span>Click a chart to investigate its records.</span>
        <button
          className="summary-text-button"
          onClick={() => onSelect({ section: "all" })}
        >
          View all details <ArrowRight size={15} />
        </button>
      </div>
      <div className="summary-chart-grid">
        <ChartCard
          title="Action success over time"
          subtitle="Successful actions / total actions · daily · UTC"
          onOpen={() => onSelect({ section: "missions" })}
        >
          {days.length ? (
            <svg
              className="summary-trend-chart"
              viewBox="0 0 580 175"
              aria-label="Daily action success. Select a date to inspect its missions."
              role="group"
              onClick={() => onSelect({ section: "missions" })}
            >
              {[0, 50, 100].map((value) => (
                <g key={value}>
                  <line
                    x1="48"
                    x2="538"
                    y1={y(value)}
                    y2={y(value)}
                    className="summary-chart-gridline"
                  />
                  <text x="34" y={y(value) + 4} textAnchor="end">
                    {value}%
                  </text>
                </g>
              ))}
              <path d={segments.join(" ")} className="summary-trend-line" />
              {days.map((day, index) => (
                <g
                  key={day.day}
                  role="button"
                  tabIndex={0}
                  aria-label={`${dateLabel(day.day)}: ${day.success === null ? "no actions" : `${day.success.toFixed(1)}% action success`}, ${day.failed} failed actions. View ${day.missions} missions`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect({ section: "missions", day: day.day });
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect({ section: "missions", day: day.day });
                    }
                  }}
                  className="summary-trend-point"
                >
                  <title>
                    {dateLabel(day.day)} ·{" "}
                    {day.success === null
                      ? "No actions"
                      : `${day.success.toFixed(1)}% success`}{" "}
                    · {day.failed} failed / {day.actions} actions ·{" "}
                    {day.missions} missions
                  </title>
                  <circle
                    cx={x(index)}
                    cy={day.success === null ? 135 : y(day.success)}
                    r="13"
                    fill="transparent"
                  />
                  <circle
                    cx={x(index)}
                    cy={day.success === null ? 135 : y(day.success)}
                    r="4.5"
                    fill={
                      day.success === null
                        ? "#747469"
                        : day.failed
                          ? "#e6a256"
                          : "#dfb238"
                    }
                  />
                  {(index === 0 ||
                    index === days.length - 1 ||
                    (days.length <= 12 && index % 2 === 0)) && (
                    <text x={x(index)} y="163" textAnchor="middle">
                      {dateLabel(day.day)}
                    </text>
                  )}
                </g>
              ))}
            </svg>
          ) : (
            <p className="summary-chart-empty">No missions recorded.</p>
          )}
          <div className="summary-chart-caption">
            <span>
              <i
                className="summary-chart-dot"
                style={{ background: "#e6a256" }}
              />
              Days with failed actions
            </span>
            <strong>{data.metrics.failed_actions} failed actions</strong>
          </div>
        </ChartCard>
        <ChartCard
          title="Finding severity"
          subtitle="Recorded priority · select a severity to inspect"
          onOpen={() => onSelect({ section: "findings" })}
        >
          <div className="summary-severity-chart">
            <button
              className="summary-donut"
              style={{
                background: gradient
                  ? `conic-gradient(${gradient})`
                  : "#333127",
              }}
              onClick={() => onSelect({ section: "findings" })}
              aria-label={`View all ${total} findings`}
            >
              <span>
                <strong>{total}</strong>
                <small>findings</small>
              </span>
            </button>
            <div className="summary-chart-legend">
              {severities
                .filter((row) => row.severity !== "NONE" || row.count)
                .map((row) => (
                  <button
                    key={row.severity}
                    onClick={() =>
                      onSelect({ section: "findings", severity: row.severity })
                    }
                    aria-label={`View ${row.count} ${row.severity.toLowerCase()} findings`}
                  >
                    <i
                      className="summary-chart-dot"
                      style={{ background: severityColors[row.severity] }}
                    />
                    <span>{row.severity.toLowerCase()}</span>
                    <strong>{row.count}</strong>
                    <ChevronRight size={13} />
                  </button>
                ))}
            </div>
          </div>
          <div className="summary-chart-caption">
            <span>High / critical priority</span>
            <strong>
              {severities
                .slice(0, 2)
                .reduce((count, row) => count + row.count, 0)}{" "}
              findings
            </strong>
          </div>
        </ChartCard>
        <ChartCard
          title="Facility hotspots"
          subtitle="Top 5 areas · ranked by high / critical findings"
          onOpen={() => onSelect({ section: "findings" })}
        >
          <div className="summary-chart-bars">
            {hotspots.map((area) => (
              <button
                key={area.id}
                className="summary-chart-bar-row"
                onClick={() =>
                  onSelect({ section: "findings", location: area.id })
                }
                aria-label={`${area.name}: ${area.count} findings, ${area.priority} high or critical. View area findings`}
              >
                <span className="summary-bar-label" title={area.name}>
                  {area.name}
                </span>
                <span className="summary-bar-track">
                  <span
                    className="summary-bar-stack"
                    style={{ width: `${(area.count / maxArea) * 100}%` }}
                  >
                    <i className="priority" style={{ flex: area.priority }} />
                    <i
                      className="other"
                      style={{ flex: area.count - area.priority }}
                    />
                  </span>
                </span>
                <strong>{area.count}</strong>
              </button>
            ))}
          </div>
          {!hotspots.length && (
            <p className="summary-chart-empty">No findings recorded.</p>
          )}
          <div className="summary-chart-caption">
            <span>
              <i className="summary-chart-dot priority" />
              High / critical <i className="summary-chart-dot other" />
              Other priorities
            </span>
          </div>
        </ChartCard>
        <ChartCard
          title="AI review status"
          subtitle={`${insights.simulatedResults} simulated examples included`}
          onOpen={() => onSelect({ section: "models" })}
        >
          <div className="summary-chart-bars">
            {models.map((model) => (
              <button
                key={model.id}
                className="summary-chart-bar-row"
                onClick={() => onSelect({ section: "models", model: model.id })}
                aria-label={`${model.name}: ${model.total} results, ${model.pending} pending review. View model evidence`}
              >
                <span className="summary-bar-label" title={model.name}>
                  {model.name}
                </span>
                <span className="summary-bar-track">
                  <span
                    className="summary-bar-stack"
                    style={{ width: `${(model.total / maxModel) * 100}%` }}
                  >
                    <i className="pending" style={{ flex: model.pending }} />
                    <i className="reviewed" style={{ flex: model.reviewed }} />
                  </span>
                </span>
                <strong>{model.total}</strong>
              </button>
            ))}
          </div>
          {!models.length && (
            <p className="summary-chart-empty">No saved model results.</p>
          )}
          <div className="summary-chart-caption">
            <span>
              <i className="summary-chart-dot pending" />
              Pending <i className="summary-chart-dot reviewed" />
              Reviewed
            </span>
            <strong>{insights.pendingResults} pending</strong>
          </div>
        </ChartCard>
      </div>
      <button
        className="summary-coverage-link"
        onClick={() => onSelect({ section: "evidence" })}
      >
        <Database size={16} />
        <span>
          {data.readings.length} sensor readings · {data.assets.length} assets ·{" "}
          {data.record_counts.replay_events} replay events
        </span>
        <Radar size={16} />
        <span>
          {spatial === null
            ? "Spatial comparison unavailable"
            : `${spatial.length} spatial changes`}
        </span>
        <ArrowRight size={16} />
      </button>
    </>
  );
}
