import { useEffect, useMemo, useState, type CSSProperties } from "react";
import actionsCsv from "../../SPOT_KnightHacks_Challenge_Kit Part One/02_DATA/actions.csv?raw";
import locationsCsv from "../../SPOT_KnightHacks_Challenge_Kit Part One/02_DATA/locations.csv?raw";
import missionsCsv from "../../SPOT_KnightHacks_Challenge_Kit Part One/02_DATA/missions.csv?raw";
import replayNdjson from "../../SPOT_KnightHacks_Challenge_Kit Part One/02_DATA/replay.ndjson?raw";
import floorPlanUrl from "../../SPOT_KnightHacks_Challenge_Kit Part One/04_ASSETS/fictional_floor_plan.png";
import "./RelayPage.css";

type CsvRow = Record<string, string>;

type RelayPageProps = {
  onHome?: () => void;
};

type ReplayEvent = {
  event_id: string;
  mission_id: string;
  timestamp: string;
  event_type: string;
  details: {
    action_id?: string;
    location_id?: string;
    asset_id?: string;
    action_type?: string;
    battery_pct?: number;
    status?: string;
    failure_type?: string;
    scenario?: string;
    configuration_version?: string;
  };
};

type MissionRow = {
  mission_id: string;
  mission_name: string;
  scenario: string;
  configuration_version: string;
  start_time: string;
  end_time: string;
  duration_min: string;
  start_battery_pct: string;
  end_battery_pct: string;
  mission_status: string;
  operator_mode: string;
};

type ActionRow = {
  action_id: string;
  mission_id: string;
  sequence: string;
  timestamp: string;
  location_id: string;
  asset_id: string;
  action_type: string;
  battery_pct: string;
  status: string;
  failure_type: string;
  duration_sec: string;
};

type LocationRow = {
  location_id: string;
  location_name: string;
  zone_type: string;
  floor: string;
  environment: string;
  mapX: number;
  mapY: number;
  zoneX: number;
  zoneY: number;
  zoneW: number;
  zoneH: number;
  polygon?: string;
};

type TimelineMoment = {
  id: string;
  timestamp: string;
  offsetSeconds: number;
  kind: string;
  title: string;
  meta: string;
  locationId?: string;
  actionId?: string;
  assetId?: string;
  status?: string;
  failureType?: string;
  batteryPct?: number;
  relatedEvents: ReplayEvent[];
};

type RoutePoint = {
  locationId: string;
  floor: string;
  x: number;
  y: number;
  offsetSeconds: number;
};

const floorPlanPositions: Record<string, { x: number; y: number }> = {
  WP01: { x: 10.0, y: 76.5 },
  WP02: { x: 10.2, y: 51.4 },
  WP03: { x: 23.2, y: 38.6 },
  WP04: { x: 19.7, y: 12.7 },
  WP05: { x: 40.6, y: 36.2 },
  WP06: { x: 50.7, y: 12.7 },
  WP07: { x: 61.0, y: 47.0 },
  WP08: { x: 35.0, y: 69.2 },
  WP09: { x: 50.4, y: 69.2 },
  WP10: { x: 61.8, y: 71.5 },
  WP11: { x: 77.1, y: 21.7 },
  WP12: { x: 90.7, y: 22.0 },
  WP13: { x: 76.4, y: 54.4 },
  WP14: { x: 89.8, y: 58.5 },
  WP15: { x: 81.4, y: 79.8 },
};

const floorPlanZones: Record<
  string,
  { x: number; y: number; width: number; height: number; polygon?: string }
> = {
  WP01: { x: 6.2, y: 69.0, width: 11.2, height: 24.5 },
  WP02: { x: 6.5, y: 42.3, width: 9.0, height: 25.0 },
  WP03: { x: 15.2, y: 28.5, width: 13.6, height: 26.5 },
  WP04: { x: 14.1, y: 4.7, width: 14.6, height: 22.6 },
  WP05: { x: 28.4, y: 26.5, width: 28.5, height: 26.5 },
  WP06: { x: 44.6, y: 4.8, width: 14.6, height: 22.5 },
  WP07: {
    x: 57.5,
    y: 20.5,
    width: 8.7,
    height: 51.0,
    polygon: "0 0, 58% 0, 58% 20%, 100% 20%, 100% 100%, 0 100%",
  },
  WP08: {
    x: 26.5,
    y: 55.6,
    width: 18.0,
    height: 35.4,
    polygon: "0 0, 100% 0, 100% 100%, 15% 100%, 15% 58%, 0 58%",
  },
  WP09: {
    x: 44.4,
    y: 55.8,
    width: 12.4,
    height: 35.0,
    polygon: "0 0, 100% 0, 100% 100%, 22% 100%, 22% 70%, 0 70%",
  },
  WP10: { x: 57.7, y: 61.5, width: 8.0, height: 27.0 },
  WP11: { x: 71.0, y: 10.5, width: 11.8, height: 25.0 },
  WP12: {
    x: 83.0,
    y: 3.0,
    width: 13.2,
    height: 33.0,
    polygon: "0 0, 100% 0, 100% 100%, 0 100%, 0 27%",
  },
  WP13: {
    x: 70.8,
    y: 40.2,
    width: 12.2,
    height: 30.5,
    polygon: "0 0, 85% 0, 85% 68%, 100% 68%, 100% 100%, 0 100%",
  },
  WP14: {
    x: 83.0,
    y: 42.4,
    width: 13.4,
    height: 27.0,
    polygon: "0 0, 100% 0, 100% 100%, 0 100%, 0 18%",
  },
  WP15: {
    x: 72.2,
    y: 72.0,
    width: 18.5,
    height: 21.6,
    polygon:
      "0 0, 45% 0, 45% 12%, 65% 12%, 65% 0, 100% 0, 100% 100%, 0 100%",
  },
};

function parseCsv(csv: string): CsvRow[] {
  const [headerLine, ...lines] = csv.trim().split(/\r?\n/);
  const headers = headerLine.split(",");
  return lines.map((line) => {
    const values = line.split(",");
    return headers.reduce<CsvRow>((row, header, index) => {
      row[header] = values[index] ?? "";
      return row;
    }, {});
  });
}

function formatEventType(eventType: string) {
  return eventType
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

function formatActionType(actionType = "Action") {
  return actionType
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

function formatDetailLabel(key: string) {
  return key
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDetailValue(value: string | number | boolean | undefined) {
  if (value === undefined || value === "") return "None";
  return String(value);
}

function formatClock(timestamp: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(timestamp));
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function eventOrder(eventType: string) {
  if (eventType === "MISSION_STARTED") return 0;
  if (eventType === "ACTION_STARTED") return 1;
  if (eventType === "ACTION_COMPLETED") return 2;
  if (eventType === "ACTION_FAILED") return 2;
  if (eventType === "MISSION_COMPLETED") return 3;
  return 4;
}

function buildRouteSegments(points: RoutePoint[]) {
  return points.reduce<RoutePoint[][]>((segments, point) => {
    const currentSegment = segments.at(-1);
    const lastPoint = currentSegment?.at(-1);
    if (!currentSegment || lastPoint?.floor !== point.floor) {
      segments.push([point]);
    } else {
      currentSegment.push(point);
    }
    return segments;
  }, []);
}

function formatRoutePoints(points: RoutePoint[]) {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function buildActionReplayEvents(action: ActionRow): ReplayEvent[] {
  const startedEvent: ReplayEvent = {
    event_id: `${action.action_id}-CSV-STARTED`,
    mission_id: action.mission_id,
    timestamp: action.timestamp,
    event_type: "ACTION_STARTED",
    details: {
      action_id: action.action_id,
      location_id: action.location_id,
      asset_id: action.asset_id,
      action_type: action.action_type,
      battery_pct: Number(action.battery_pct),
    },
  };
  const outcomeEvent: ReplayEvent = {
    event_id: `${action.action_id}-CSV-${action.status}`,
    mission_id: action.mission_id,
    timestamp: action.timestamp,
    event_type: action.status === "FAILED" ? "ACTION_FAILED" : "ACTION_COMPLETED",
    details: {
      action_id: action.action_id,
      status: action.status,
      failure_type: action.failure_type,
    },
  };

  return [startedEvent, outcomeEvent];
}

function buildMissionReplayEvents(mission: MissionRow): ReplayEvent[] {
  return [
    {
      event_id: `${mission.mission_id}-CSV-STARTED`,
      mission_id: mission.mission_id,
      timestamp: mission.start_time,
      event_type: "MISSION_STARTED",
      details: {
        scenario: mission.scenario,
        configuration_version: mission.configuration_version,
        battery_pct: Number(mission.start_battery_pct),
      },
    },
    {
      event_id: `${mission.mission_id}-CSV-COMPLETED`,
      mission_id: mission.mission_id,
      timestamp: mission.end_time,
      event_type: "MISSION_COMPLETED",
      details: {
        scenario: mission.scenario,
        configuration_version: mission.configuration_version,
        battery_pct: Number(mission.end_battery_pct),
        status: mission.mission_status,
      },
    },
  ];
}

function buildTimelineMoments(
  missionEvents: ReplayEvent[],
  actionRows: Map<string, ActionRow>,
  mission: MissionRow,
): TimelineMoment[] {
  const missionActionRows = Array.from(actionRows.values()).filter(
    (action) => action.mission_id === mission.mission_id,
  );
  const missionStartMs = new Date(
    missionEvents[0]?.timestamp ?? mission.start_time,
  ).getTime();
  const byActionId = new Map<string, ReplayEvent[]>();
  const nonActionEvents: ReplayEvent[] = [];

  missionEvents.forEach((event) => {
    const actionId = event.details.action_id;
    if (actionId) {
      byActionId.set(actionId, [...(byActionId.get(actionId) ?? []), event]);
    } else {
      nonActionEvents.push(event);
    }
  });

  missionActionRows.forEach((action) => {
    const relatedEvents = byActionId.get(action.action_id) ?? [];
    const hasStarted = relatedEvents.some(
      (event) => event.event_type === "ACTION_STARTED",
    );
    const hasOutcome = relatedEvents.some(
      (event) =>
        event.event_type === "ACTION_COMPLETED" ||
        event.event_type === "ACTION_FAILED",
    );
    const fallbackEvents = buildActionReplayEvents(action).filter((event) => {
      if (event.event_type === "ACTION_STARTED") return !hasStarted;
      return !hasOutcome;
    });
    if (fallbackEvents.length > 0 || relatedEvents.length > 0) {
      byActionId.set(action.action_id, [...relatedEvents, ...fallbackEvents]);
    }
  });

  const hasMissionStarted = nonActionEvents.some(
    (event) => event.event_type === "MISSION_STARTED",
  );
  const hasMissionCompleted = nonActionEvents.some(
    (event) => event.event_type === "MISSION_COMPLETED",
  );
  buildMissionReplayEvents(mission).forEach((event) => {
    if (event.event_type === "MISSION_STARTED" && !hasMissionStarted) {
      nonActionEvents.push(event);
    }
    if (event.event_type === "MISSION_COMPLETED" && !hasMissionCompleted) {
      nonActionEvents.push(event);
    }
  });

  const actionMoments = Array.from(byActionId.entries()).map(
    ([actionId, relatedEvents]) => {
      const sortedRelatedEvents = relatedEvents.sort((a, b) => {
        if (a.timestamp !== b.timestamp) return a.timestamp.localeCompare(b.timestamp);
        return eventOrder(a.event_type) - eventOrder(b.event_type);
      });
      const actionStart =
        sortedRelatedEvents.find((event) => event.event_type === "ACTION_STARTED") ??
        sortedRelatedEvents[0];
      const actionEnd = sortedRelatedEvents.find(
        (event) =>
          event.event_type === "ACTION_COMPLETED" ||
          event.event_type === "ACTION_FAILED",
      );
      const actionRow = actionRows.get(actionId);
      const locationId =
        actionStart.details.location_id ?? actionRow?.location_id ?? undefined;
      const status =
        actionEnd?.details.status ?? actionRow?.status ?? actionEnd?.event_type;
      const failureType =
        actionEnd?.details.failure_type || actionRow?.failure_type || undefined;
      const offsetSeconds =
        (new Date(actionStart.timestamp).getTime() - missionStartMs) / 1000;

      return {
        id: actionId,
        timestamp: actionStart.timestamp,
        offsetSeconds,
        kind: actionStart.details.action_type ?? actionRow?.action_type ?? "ACTION",
        title: formatActionType(
          actionStart.details.action_type ?? actionRow?.action_type,
        ),
        meta: locationId
          ? `${locationId}${actionStart.details.asset_id || actionRow?.asset_id ? ` -> ${actionStart.details.asset_id ?? actionRow?.asset_id}` : ""}`
          : actionId,
        locationId,
        actionId,
        assetId: actionStart.details.asset_id ?? actionRow?.asset_id,
        status,
        failureType,
        batteryPct:
          actionStart.details.battery_pct ?? Number(actionRow?.battery_pct),
        relatedEvents: sortedRelatedEvents,
      } satisfies TimelineMoment;
    },
  );

  const missionMoments = nonActionEvents.map((event) => ({
    id: event.event_id,
    timestamp: event.timestamp,
    offsetSeconds: (new Date(event.timestamp).getTime() - missionStartMs) / 1000,
    kind: event.event_type,
    title: formatEventType(event.event_type),
    meta: event.details.scenario
      ? `${event.details.scenario} / ${event.details.configuration_version}`
      : "Mission event",
    batteryPct: event.details.battery_pct,
    relatedEvents: [event],
  }));

  return [...missionMoments, ...actionMoments].sort((a, b) => {
    if (a.offsetSeconds !== b.offsetSeconds) {
      return a.offsetSeconds - b.offsetSeconds;
    }
    return a.title.localeCompare(b.title);
  });
}

function RelayPage({ onHome }: RelayPageProps) {
  const [selectedMissionId, setSelectedMissionId] = useState("M001");
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(30);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isDetailsCollapsed, setIsDetailsCollapsed] = useState(false);

  const missions = useMemo(
    () => parseCsv(missionsCsv) as MissionRow[],
    [],
  );
  const locations = useMemo(
    (): LocationRow[] =>
      parseCsv(locationsCsv).map((row) => ({
        location_id: row.location_id,
        location_name: row.location_name,
        zone_type: row.zone_type,
        floor: row.floor,
        environment: row.environment,
        mapX: floorPlanPositions[row.location_id]?.x ?? Number(row.x_coord),
        mapY: floorPlanPositions[row.location_id]?.y ?? Number(row.y_coord),
        zoneX: floorPlanZones[row.location_id]?.x ?? Number(row.x_coord) - 2,
        zoneY: floorPlanZones[row.location_id]?.y ?? Number(row.y_coord) - 2,
        zoneW: floorPlanZones[row.location_id]?.width ?? 4,
        zoneH: floorPlanZones[row.location_id]?.height ?? 4,
        polygon: floorPlanZones[row.location_id]?.polygon,
      })),
    [],
  );
  const actions = useMemo(
    () =>
      new Map(
        (parseCsv(actionsCsv) as ActionRow[]).map((action) => [
          action.action_id,
          action,
        ]),
      ),
    [],
  );
  const events = useMemo(
    () =>
      replayNdjson
        .trim()
        .split(/\r?\n/)
        .map((line) => JSON.parse(line) as ReplayEvent)
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    [],
  );

  const selectedMission =
    missions.find((mission) => mission.mission_id === selectedMissionId) ??
    missions[0];
  const missionEvents = useMemo(
    () => events.filter((event) => event.mission_id === selectedMissionId),
    [events, selectedMissionId],
  );
  const timelineMoments = useMemo(
    () => buildTimelineMoments(missionEvents, actions, selectedMission),
    [actions, missionEvents, selectedMission],
  );
  const totalSeconds = Math.max(
    1,
    timelineMoments.at(-1)?.offsetSeconds ??
      Number(selectedMission?.duration_min ?? 0) * 60,
  );
  const currentMomentIndex = Math.max(
    0,
    timelineMoments.findLastIndex(
      (moment) => moment.offsetSeconds <= elapsedSeconds,
    ),
  );
  const currentMoment = timelineMoments[currentMomentIndex];
  const visitedLocationIds = timelineMoments
    .filter(
      (moment) =>
        moment.locationId &&
        moment.offsetSeconds <= elapsedSeconds &&
        moment.kind !== "MISSION_STARTED",
    )
    .map((moment) => moment.locationId as string);
  const routePoints = timelineMoments.reduce<RoutePoint[]>((points, moment) => {
    if (!moment.locationId) return points;
    const location = locations.find(
      (item) => item.location_id === moment.locationId,
    );
    if (!location || points.at(-1)?.locationId === location.location_id) {
      return points;
    }
    points.push({
      locationId: location.location_id,
      floor: location.floor,
      x: location.mapX,
      y: location.mapY,
      offsetSeconds: moment.offsetSeconds,
    });
    return points;
  }, []);
  const pathSegments = buildRouteSegments(routePoints);

  const currentRouteIndex = routePoints.findLastIndex(
    (point) => point.offsetSeconds <= elapsedSeconds,
  );
  const previousRoutePoint =
    currentRouteIndex >= 0 ? routePoints[currentRouteIndex] : undefined;
  const nextRoutePoint =
    currentRouteIndex >= 0
      ? routePoints[currentRouteIndex + 1]
      : routePoints[0];
  const isTravelingOnSameFloor =
    previousRoutePoint &&
    nextRoutePoint &&
    previousRoutePoint.floor === nextRoutePoint.floor;
  const routeProgress =
    isTravelingOnSameFloor
      ? Math.min(
          1,
          Math.max(
            0,
            (elapsedSeconds - previousRoutePoint.offsetSeconds) /
              Math.max(1, nextRoutePoint.offsetSeconds - previousRoutePoint.offsetSeconds),
          ),
        )
      : 0;
  const currentMapPoint =
    isTravelingOnSameFloor
      ? {
          locationId: previousRoutePoint.locationId,
          floor: previousRoutePoint.floor,
          x:
            previousRoutePoint.x +
            (nextRoutePoint.x - previousRoutePoint.x) * routeProgress,
          y:
            previousRoutePoint.y +
            (nextRoutePoint.y - previousRoutePoint.y) * routeProgress,
          offsetSeconds: elapsedSeconds,
        }
      : previousRoutePoint
        ? previousRoutePoint
        : undefined;
  const activeRoutePoints = routePoints.filter(
    (point) => point.offsetSeconds <= elapsedSeconds,
  );
  const activePathSegments = buildRouteSegments(
    currentMapPoint ? [...activeRoutePoints, currentMapPoint] : activeRoutePoints,
  );
  const failures = timelineMoments.filter((moment) => moment.status === "FAILED");
  const completionRate =
    timelineMoments.length > 0
      ? Math.round(
          (timelineMoments.filter((moment) => moment.status === "SUCCESS").length /
            Math.max(1, timelineMoments.filter((moment) => moment.actionId).length)) *
            100,
        )
      : 0;

  useEffect(() => {
    setElapsedSeconds(0);
    setIsPlaying(false);
  }, [selectedMissionId]);

  useEffect(() => {
    if (!isPlaying) return;
    let lastFrame = performance.now();
    let animationFrame = 0;

    const tick = (frameTime: number) => {
      const deltaSeconds = ((frameTime - lastFrame) / 1000) * speed;
      lastFrame = frameTime;
      setElapsedSeconds((current) => {
        const next = Math.min(totalSeconds, current + deltaSeconds);
        if (next >= totalSeconds) {
          setIsPlaying(false);
        }
        return next;
      });
      animationFrame = requestAnimationFrame(tick);
    };

    animationFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrame);
  }, [isPlaying, speed, totalSeconds]);

  const seekToMoment = (moment: TimelineMoment) => {
    setElapsedSeconds(moment.offsetSeconds);
    setIsPlaying(false);
  };

  return (
    <div className="relay-page">
      <header className="relay-topbar">
        <button type="button" className="relay-brand" onClick={onHome}>
          <strong>Replay</strong>
        </button>
        <label className="relay-select">
          <span>Path</span>
          <select
            value={selectedMissionId}
            onChange={(event) => setSelectedMissionId(event.target.value)}
          >
            {missions.map((mission) => (
              <option key={mission.mission_id} value={mission.mission_id}>
                {mission.mission_id} - {mission.mission_name}
              </option>
            ))}
          </select>
        </label>
      </header>

      <main className="relay-layout">
        <section className="relay-stage" aria-label="Selected mission replay">
          <div className="relay-stage-heading">
            <div>
              <p className="relay-kicker">Replay NDJSON</p>
              <h1>{selectedMission?.mission_name ?? selectedMissionId}</h1>
            </div>
            <div className="relay-clock">
              <strong>{formatDuration(elapsedSeconds)}</strong>
              <span>{formatClock(currentMoment?.timestamp ?? selectedMission.start_time)}</span>
            </div>
          </div>

          <div className="relay-map-shell">
            <div className="relay-map-canvas">
              <img src={floorPlanUrl} alt="Fictional facility floor plan" />
              <svg
                className="relay-map-overlay"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                {pathSegments.map((segment) => (
                  <polyline
                    className="relay-map-path planned"
                    key={`planned-${segment[0]?.locationId}-${segment.at(-1)?.locationId}`}
                    points={formatRoutePoints(segment)}
                  />
                ))}
                {activePathSegments.map((segment) => (
                  <polyline
                    className="relay-map-path traveled"
                    key={`traveled-${segment[0]?.locationId}-${segment.at(-1)?.locationId}`}
                    points={formatRoutePoints(segment)}
                  />
                ))}
                {activePathSegments.map((segment) => (
                  <polyline
                    className={`relay-map-path flow ${isPlaying ? "moving" : ""}`}
                    key={`flow-${segment[0]?.locationId}-${segment.at(-1)?.locationId}`}
                    points={formatRoutePoints(segment)}
                  />
                ))}
                {routePoints.map((point, index) => (
                  <g
                    className="relay-map-node"
                    key={`${point.locationId}-${index}`}
                    transform={`translate(${point.x} ${point.y})`}
                  >
                    <circle r="1.1" />
                    <text y="0.32">{index + 1}</text>
                  </g>
                ))}
                {currentMapPoint && (
                  <g
                    className="relay-path-endpoint"
                    transform={`translate(${currentMapPoint.x} ${currentMapPoint.y})`}
                  >
                    <circle r="1.65" />
                    <circle r="0.72" />
                  </g>
                )}
                {currentMapPoint && (
                  <g
                    className="relay-spot-marker"
                    transform={`translate(${currentMapPoint.x} ${currentMapPoint.y})`}
                  >
                    <circle r="2.3" />
                    <circle r="0.85" />
                  </g>
                )}
              </svg>
              {locations.map((location) => (
                <button
                  key={location.location_id}
                  type="button"
                  className={`relay-zone ${
                    visitedLocationIds.includes(location.location_id) ? "visited" : ""
                  } ${
                    currentMoment?.locationId === location.location_id ? "active" : ""
                  }`}
                  style={
                    {
                      left: `${location.zoneX}%`,
                      top: `${location.zoneY}%`,
                      width: `${location.zoneW}%`,
                      height: `${location.zoneH}%`,
                      "--zone-path": location.polygon
                        ? `polygon(${location.polygon})`
                        : "inset(0 round 8px)",
                      "--pin-x": `${((location.mapX - location.zoneX) / location.zoneW) * 100}%`,
                      "--pin-y": `${((location.mapY - location.zoneY) / location.zoneH) * 100}%`,
                    } as CSSProperties
                  }
                  onClick={() => {
                    const moment = timelineMoments.find(
                      (item) => item.locationId === location.location_id,
                    );
                    if (moment) seekToMoment(moment);
                  }}
                  aria-label={`${location.location_id} ${location.location_name}`}
                >
                  <span>{location.location_id}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="relay-controls">
            <button
              type="button"
              className="relay-play-button"
              onClick={() => {
                if (elapsedSeconds >= totalSeconds) setElapsedSeconds(0);
                setIsPlaying((current) => !current);
              }}
            >
              {isPlaying ? "Pause" : "Play"}
            </button>
            <label className="relay-scrubber">
              <span>Mission time</span>
              <input
                type="range"
                min="0"
                max={totalSeconds}
                step="1"
                value={elapsedSeconds}
                onChange={(event) => {
                  setElapsedSeconds(Number(event.target.value));
                  setIsPlaying(false);
                }}
              />
            </label>
            <label className="relay-speed">
              <span>Speed {speed}x</span>
              <input
                type="range"
                min="1"
                max="180"
                step="1"
                value={speed}
                onChange={(event) => setSpeed(Number(event.target.value))}
              />
            </label>
          </div>

          <section className="relay-data" aria-label="Relay data summary">
            <article>
              <span>Scenario</span>
              <strong>{selectedMission.scenario}</strong>
              <small>{selectedMission.configuration_version}</small>
            </article>
            <article>
              <span>Actions</span>
              <strong>{timelineMoments.filter((moment) => moment.actionId).length}</strong>
              <small>{completionRate}% successful</small>
            </article>
            <article>
              <span>Battery</span>
              <strong>
                {selectedMission.start_battery_pct}% {"->"} {selectedMission.end_battery_pct}%
              </strong>
              <small>{currentMoment?.batteryPct ?? selectedMission.end_battery_pct}% current</small>
            </article>
            <article>
              <span>Relay health</span>
              <strong>{failures.length} issues</strong>
              <small>{selectedMission.mission_status}</small>
            </article>
          </section>
        </section>

        <aside
          className={`relay-timeline ${
            isDetailsCollapsed ? "details-collapsed" : ""
          }`}
          aria-label="Mission event timeline"
        >
          <div className="relay-timeline-heading">
            <div>
              <h2 className="relay-panel-title">Timeline</h2>
            </div>
            <button
              type="button"
              className="relay-detail-toggle"
              onClick={() => setIsDetailsCollapsed((current) => !current)}
              aria-expanded={!isDetailsCollapsed}
            >
              {isDetailsCollapsed ? "Show details" : "Hide details"}
            </button>
          </div>
          <div className="relay-timeline-body">
            <div className="relay-timeline-list">
              {timelineMoments.map((moment, index) => {
                const isActive = index === currentMomentIndex;
                const isPast = moment.offsetSeconds <= elapsedSeconds;
                return (
                  <button
                    key={moment.id}
                    type="button"
                    className={`relay-timeline-item ${isActive ? "active" : ""} ${
                      isPast ? "past" : ""
                    } ${moment.status === "FAILED" ? "failed" : ""}`}
                    onClick={() => seekToMoment(moment)}
                  >
                    <span className="relay-timeline-dot" />
                    <span className="relay-timeline-time">
                      {formatDuration(moment.offsetSeconds)}
                    </span>
                    <strong>{moment.title}</strong>
                    <small>{moment.status ?? formatEventType(moment.kind)}</small>
                  </button>
                );
              })}
            </div>

            <section className="relay-event-details" aria-label="Selected event details">
              {currentMoment ? (
                <>
                  <div className="relay-event-summary">
                    <span>{formatDuration(currentMoment.offsetSeconds)}</span>
                    <h2>{currentMoment.title}</h2>
                    <p>{currentMoment.meta}</p>
                  </div>
                  <dl className="relay-event-meta">
                    <div>
                      <dt>Event</dt>
                      <dd>{currentMoment.id}</dd>
                    </div>
                    <div>
                      <dt>Status</dt>
                      <dd>{currentMoment.status ?? formatEventType(currentMoment.kind)}</dd>
                    </div>
                    <div>
                      <dt>Battery</dt>
                      <dd>
                        {currentMoment.batteryPct
                          ? `${currentMoment.batteryPct}%`
                          : "Not recorded"}
                      </dd>
                    </div>
                    <div>
                      <dt>Failure</dt>
                      <dd>{currentMoment.failureType || "None"}</dd>
                    </div>
                  </dl>
                  <div className="relay-related-events">
                    <h3>Related events</h3>
                    {currentMoment.relatedEvents.map((event) => (
                      <article key={event.event_id}>
                        <div>
                          <strong>{event.event_type}</strong>
                          <span>{formatClock(event.timestamp)}</span>
                        </div>
                        <dl>
                          {Object.entries(event.details).map(([key, value]) => (
                            <div key={`${event.event_id}-${key}`}>
                              <dt>{formatDetailLabel(key)}</dt>
                              <dd>{formatDetailValue(value)}</dd>
                            </div>
                          ))}
                        </dl>
                      </article>
                    ))}
                  </div>
                </>
              ) : (
                <div className="relay-event-empty">Select a timeline event.</div>
              )}
            </section>
          </div>
        </aside>
      </main>
    </div>
  );
}

export default RelayPage;
