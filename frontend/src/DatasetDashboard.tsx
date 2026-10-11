import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import actionsCsv from "../../SPOT_KnightHacks_Challenge_Kit Part One/02_DATA/actions.csv?raw";
import anomaliesCsv from "../../SPOT_KnightHacks_Challenge_Kit Part One/02_DATA/anomalies.csv?raw";
import assetsCsv from "../../SPOT_KnightHacks_Challenge_Kit Part One/02_DATA/assets.csv?raw";
import locationsCsv from "../../SPOT_KnightHacks_Challenge_Kit Part One/02_DATA/locations.csv?raw";
import missionsCsv from "../../SPOT_KnightHacks_Challenge_Kit Part One/02_DATA/missions.csv?raw";
import readingsCsv from "../../SPOT_KnightHacks_Challenge_Kit Part One/02_DATA/readings.csv?raw";
import replayNdjson from "../../SPOT_KnightHacks_Challenge_Kit Part One/02_DATA/replay.ndjson?raw";
import floorPlanUrl from "../../SPOT_KnightHacks_Challenge_Kit Part One/04_ASSETS/fictional_floor_plan.png";
import "./DatasetDashboard.css";

type DataValue = string | number | boolean | null | undefined | Record<string, unknown>;
type CsvRow = Record<string, DataValue>;

type DatasetSource =
  | "Actions"
  | "Anomalies"
  | "Assets"
  | "Locations"
  | "Missions"
  | "Readings";

type DatasetRecord = {
  id: string;
  source: DatasetSource;
  subtype: string;
  title: string;
  locationId: string;
  summary: string;
  fields: CsvRow;
  searchText: string;
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

type DatasetDashboardProps = {
  onHome?: () => void;
};

type ReplayEvent = {
  mission_id: string;
  timestamp: string;
  event_type: string;
  details: {
    location_id?: string;
  };
};

type MissionPath = {
  missionId: string;
  label: string;
  locationIds: string[];
};

type PaginatedApiResponse<T> = {
  next: string | null;
  results: T[];
};

const apiBaseUrl = "https://64.177.51.140/api";

const datasets: { source: DatasetSource; csv: string }[] = [
  { source: "Actions", csv: actionsCsv },
  { source: "Anomalies", csv: anomaliesCsv },
  { source: "Assets", csv: assetsCsv },
  { source: "Locations", csv: locationsCsv },
  { source: "Missions", csv: missionsCsv },
  { source: "Readings", csv: readingsCsv },
];

const typeKeys: Partial<Record<DatasetSource, string>> = {
  Actions: "action_type",
  Anomalies: "anomaly_type",
  Assets: "asset_type",
  Locations: "zone_type",
  Missions: "mission_status",
  Readings: "measurement_type",
};

const recordEndpoints: Record<DatasetSource, string> = {
  Actions: "actions",
  Anomalies: "anomalies",
  Assets: "assets",
  Locations: "locations",
  Missions: "missions",
  Readings: "readings",
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
    polygon: "0 0, 45% 0, 45% 12%, 65% 12%, 65% 0, 100% 0, 100% 100%, 0 100%",
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

function textValue(value: DataValue) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function lowerValue(value: DataValue) {
  return textValue(value).toLowerCase();
}

function buildLocations(rows: CsvRow[]): LocationRow[] {
  return rows.map((row) => {
    const locationId = textValue(row.location_id);
    return {
      location_id: locationId,
      location_name: textValue(row.location_name),
      zone_type: textValue(row.zone_type),
      floor: textValue(row.floor),
      environment: textValue(row.environment),
      mapX: floorPlanPositions[locationId]?.x ?? Number(row.x_coord),
      mapY: floorPlanPositions[locationId]?.y ?? Number(row.y_coord),
      zoneX: floorPlanZones[locationId]?.x ?? Number(row.x_coord) - 2,
      zoneY: floorPlanZones[locationId]?.y ?? Number(row.y_coord) - 2,
      zoneW: floorPlanZones[locationId]?.width ?? 4,
      zoneH: floorPlanZones[locationId]?.height ?? 4,
      polygon: floorPlanZones[locationId]?.polygon,
    };
  });
}

function buildMissionPaths(
  missionRows = parseCsv(missionsCsv),
  replayEvents?: ReplayEvent[],
): MissionPath[] {
  const missionNames = new Map(
    missionRows.map((row) => [textValue(row.mission_id), textValue(row.mission_name)]),
  );
  const events = (replayEvents ??
    replayNdjson
      .trim()
      .split(/\r?\n/)
      .map((line) => JSON.parse(line) as ReplayEvent))
    .filter(
      (event) =>
        event.event_type === "ACTION_STARTED" && event.details.location_id,
    )
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const paths = new Map<string, string[]>();
  events.forEach((event) => {
    const locationId = event.details.location_id;
    if (!locationId) return;
    const current = paths.get(event.mission_id) ?? [];
    if (current.at(-1) !== locationId) current.push(locationId);
    paths.set(event.mission_id, current);
  });
  return Array.from(paths.entries()).map(([missionId, locationIds]) => ({
    missionId,
    label: missionNames.get(missionId) ?? missionId,
    locationIds,
  }));
}

function titleFor(source: DatasetSource, row: CsvRow) {
  if (source === "Actions") return textValue(row.action_id);
  if (source === "Anomalies") return textValue(row.anomaly_id);
  if (source === "Assets") return textValue(row.asset_name);
  if (source === "Locations") return textValue(row.location_name);
  if (source === "Missions") return textValue(row.mission_name);
  return textValue(row.reading_id);
}

function idFor(source: DatasetSource, row: CsvRow) {
  if (source === "Actions") return textValue(row.action_id);
  if (source === "Anomalies") return textValue(row.anomaly_id);
  if (source === "Assets") return textValue(row.asset_id);
  if (source === "Locations") return textValue(row.location_id);
  if (source === "Missions") return textValue(row.mission_id);
  return textValue(row.reading_id);
}

function summaryFor(source: DatasetSource, row: CsvRow) {
  if (source === "Actions")
    return `${textValue(row.status)} ${lowerValue(row.action_type)} on ${textValue(row.asset_id) || "route"} during ${textValue(row.mission_id)}`;
  if (source === "Anomalies")
    return `${textValue(row.severity)} ${lowerValue(row.anomaly_type)} finding: ${textValue(row.description)}`;
  if (source === "Assets")
    return `${textValue(row.asset_type)} at ${textValue(row.location_id)} with ${lowerValue(row.criticality)} criticality`;
  if (source === "Locations")
    return `${textValue(row.zone_type)} zone on floor ${textValue(row.floor)} in ${textValue(row.environment)}`;
  if (source === "Missions")
    return `${textValue(row.mission_status)} ${lowerValue(row.scenario)} route, ${textValue(row.duration_min)} minutes`;
  return `${textValue(row.measurement_type)} ${textValue(row.value)} ${textValue(row.unit)} with ${lowerValue(row.quality)} quality`;
}

function buildRecords(
  rowsBySource: Partial<Record<DatasetSource, CsvRow[]>> = Object.fromEntries(
    datasets.map(({ source, csv }) => [source, parseCsv(csv)]),
  ) as Partial<Record<DatasetSource, CsvRow[]>>,
): DatasetRecord[] {
  return datasets.flatMap(({ source }) =>
    (rowsBySource[source] ?? []).map((row) => {
      const subtype = textValue(row[typeKeys[source] ?? ""]) || "UNSPECIFIED";
      const record: Omit<DatasetRecord, "searchText"> = {
        id: idFor(source, row),
        source,
        subtype,
        title: titleFor(source, row),
        locationId: textValue(row.location_id),
        summary: summaryFor(source, row),
        fields: row,
      };
      return {
        ...record,
        searchText: [
          record.id,
          record.source,
          record.subtype,
          record.title,
          record.locationId,
          record.summary,
          ...Object.values(row),
        ]
          .map(textValue)
          .join(" ")
          .toLowerCase(),
      };
    }),
  );
}

function recordKey(record: DatasetRecord) {
  return `${record.source}:${record.id}`;
}

async function fetchPaginated<T extends CsvRow>(
  path: string,
  signal: AbortSignal,
) {
  let url: string | null = `${apiBaseUrl}${path}?limit=500`;
  const rows: T[] = [];
  while (url) {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`API request failed: ${response.status}`);
    const page = (await response.json()) as PaginatedApiResponse<T>;
    rows.push(...page.results);
    url = page.next;
  }
  return rows;
}

function DatasetDashboard({ onHome }: DatasetDashboardProps) {
  const [activeWaypoint, setActiveWaypoint] = useState("WP05");
  const [selectedWaypoints, setSelectedWaypoints] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSource, setSelectedSource] = useState<DatasetSource | "All">("All");
  const [selectedSubtype, setSelectedSubtype] = useState("All");
  const [selectedLocationFilter, setSelectedLocationFilter] = useState("All");
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([]);
  const fallbackMissionPaths = useMemo(() => buildMissionPaths(), []);
  const [selectedMissionId, setSelectedMissionId] = useState(
    () => fallbackMissionPaths[0]?.missionId ?? "",
  );
  const fallbackRecords = useMemo(() => buildRecords(), []);
  const fallbackLocations = useMemo(
    () => buildLocations(parseCsv(locationsCsv)),
    [],
  );
  const [records, setRecords] = useState(fallbackRecords);
  const [locations, setLocations] = useState(fallbackLocations);
  const [missionPaths, setMissionPaths] = useState(fallbackMissionPaths);
  const [apiStatus, setApiStatus] = useState<"loading" | "ready" | "fallback">(
    "loading",
  );
  const [searchPanelHeight, setSearchPanelHeight] = useState(330);
  const searchPanelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const abortController = new AbortController();

    async function loadApiRecords() {
      try {
        setApiStatus("loading");
        const [
          actionRows,
          anomalyRows,
          assetRows,
          locationRows,
          missionRows,
          readingRows,
          replayEvents,
        ] = await Promise.all([
          fetchPaginated<CsvRow>(
            `/records/${recordEndpoints.Actions}`,
            abortController.signal,
          ),
          fetchPaginated<CsvRow>(
            `/records/${recordEndpoints.Anomalies}`,
            abortController.signal,
          ),
          fetchPaginated<CsvRow>(
            `/records/${recordEndpoints.Assets}`,
            abortController.signal,
          ),
          fetchPaginated<CsvRow>(
            `/records/${recordEndpoints.Locations}`,
            abortController.signal,
          ),
          fetchPaginated<CsvRow>(
            `/records/${recordEndpoints.Missions}`,
            abortController.signal,
          ),
          fetchPaginated<CsvRow>(
            `/records/${recordEndpoints.Readings}`,
            abortController.signal,
          ),
          fetchPaginated<ReplayEvent & CsvRow>(
            "/records/replay-events",
            abortController.signal,
          ),
        ]);
        const nextMissionPaths = buildMissionPaths(missionRows, replayEvents);
        setRecords(
          buildRecords({
            Actions: actionRows,
            Anomalies: anomalyRows,
            Assets: assetRows,
            Locations: locationRows,
            Missions: missionRows,
            Readings: readingRows,
          }),
        );
        setLocations(buildLocations(locationRows));
        setMissionPaths(nextMissionPaths);
        setSelectedMissionId((current) =>
          nextMissionPaths.some((mission) => mission.missionId === current)
            ? current
            : nextMissionPaths[0]?.missionId ?? "",
        );
        setApiStatus("ready");
      } catch (error) {
        if (abortController.signal.aborted) return;
        console.error("Failed to load dashboard API records", error);
        setRecords(fallbackRecords);
        setLocations(fallbackLocations);
        setMissionPaths(fallbackMissionPaths);
        setApiStatus("fallback");
      }
    }

    loadApiRecords();
    return () => abortController.abort();
  }, [fallbackLocations, fallbackMissionPaths, fallbackRecords]);

  const hasSelectedRecordAtLocation = (
    locationId: string,
    selectedKeys: string[],
  ) =>
    selectedKeys.some((recordId) => {
      const record = records.find((item) => recordKey(item) === recordId);
      return record?.locationId === locationId;
    });

  const toggleWaypoint = (locationId: string) => {
    const isSelected = selectedWaypoints.includes(locationId);
    setActiveWaypoint(locationId);
    setSelectedWaypoints((current) =>
      current.includes(locationId)
        ? current.filter((id) => id !== locationId)
        : [...current, locationId],
    );
    if (isSelected) {
      setSelectedRecordIds((current) =>
        current.filter((recordId) => {
          const record = records.find((item) => recordKey(item) === recordId);
          return record?.locationId !== locationId;
        }),
      );
    }
  };

  const clearSelections = () => {
    setSelectedWaypoints([]);
    setSelectedRecordIds([]);
  };

  const toggleRecord = (record: DatasetRecord) => {
    if (record.source === "Locations" && record.locationId) {
      toggleWaypoint(record.locationId);
      return;
    }

    const key = recordKey(record);
    const isSelected = selectedRecordIds.includes(key);
    const nextRecordIds = isSelected
      ? selectedRecordIds.filter((id) => id !== key)
      : [...selectedRecordIds, key];

    setSelectedRecordIds(nextRecordIds);
    if (!record.locationId) return;

    setActiveWaypoint(record.locationId);
    setSelectedWaypoints((current) => {
      if (!isSelected && !current.includes(record.locationId)) {
        return [...current, record.locationId];
      }
      if (
        isSelected &&
        current.includes(record.locationId) &&
        !hasSelectedRecordAtLocation(record.locationId, nextRecordIds)
      ) {
        return current.filter((locationId) => locationId !== record.locationId);
      }
      return current;
    });
  };

  const focusMap = () => {
    const mapSection = document.getElementById("dataset-map");
    mapSection?.scrollIntoView({
      block: "start",
      behavior: "smooth",
    });
    mapSection?.focus({ preventScroll: true });
  };

  const startSearchResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight =
      searchPanelRef.current?.getBoundingClientRect().height ?? searchPanelHeight;

    const resize = (moveEvent: PointerEvent) => {
      const maxHeight = Math.max(360, window.innerHeight - 110);
      const nextHeight = Math.min(
        maxHeight,
        Math.max(230, startHeight + moveEvent.clientY - startY),
      );
      setSearchPanelHeight(Math.round(nextHeight));
    };

    const stopResize = () => {
      window.removeEventListener("pointermove", resize);
      window.removeEventListener("pointerup", stopResize);
      document.body.classList.remove("is-resizing-search");
    };

    document.body.classList.add("is-resizing-search");
    window.addEventListener("pointermove", resize);
    window.addEventListener("pointerup", stopResize);
  };

  const activeLocation = locations.find(
    (location) => location.location_id === activeWaypoint,
  );
  const activeLocationRecords = records.filter(
    (record) => record.locationId === activeWaypoint,
  );
  const selectedLocations = selectedWaypoints
    .map((waypoint) =>
      locations.find((location) => location.location_id === waypoint),
    )
    .filter((location): location is LocationRow => Boolean(location));
  const selectedMissionPath = missionPaths.find(
    (mission) => mission.missionId === selectedMissionId,
  );
  const replayLocations = (selectedMissionPath?.locationIds ?? [])
    .map((waypoint) =>
      locations.find((location) => location.location_id === waypoint),
    )
    .filter((location): location is LocationRow => Boolean(location));
  const selectedRelayPoints = selectedLocations
    .map((location) => `${location.mapX},${location.mapY}`)
    .join(" ");
  const replayRelayPoints = replayLocations
    .map((location) => `${location.mapX},${location.mapY}`)
    .join(" ");
  const sourceOptions = datasets.map((dataset) => dataset.source);
  const subtypeOptions = Array.from(
    new Set(
      records
        .filter(
          (record) =>
            selectedSource === "All" || record.source === selectedSource,
        )
        .map((record) => record.subtype)
        .filter(Boolean),
    ),
  ).sort();
  const locationOptions = locations.map((location) => location.location_id);
  const selectedRecords = selectedRecordIds
    .map((recordId) => records.find((record) => recordKey(record) === recordId))
    .filter((record) => record?.source !== "Locations")
    .filter((record): record is DatasetRecord => Boolean(record));
  const filteredRecords = records
    .filter((record) => selectedSource === "All" || record.source === selectedSource)
    .filter(
      (record) =>
        selectedSubtype === "All" || record.subtype === selectedSubtype,
    )
    .filter(
      (record) =>
        selectedLocationFilter === "All" ||
        record.locationId === selectedLocationFilter,
    )
    .filter(
      (record) =>
        searchQuery.trim() === "" ||
        record.searchText.includes(searchQuery.trim().toLowerCase()),
    );

  return (
    <div className="dataset-dashboard">
      <aside className="dataset-rail">
        <button type="button" className="dataset-brand" onClick={onHome}>
          <span>S</span>
          <strong>SPOT</strong>
        </button>
        <label className="mission-path-control rail-control">
          <span>Replay path</span>
          <select
            value={selectedMissionId}
            onChange={(event) => setSelectedMissionId(event.target.value)}
          >
            {missionPaths.map((mission) => (
              <option key={mission.missionId} value={mission.missionId}>
                {mission.missionId} - {mission.label}
              </option>
            ))}
          </select>
        </label>
        <section className="selection-rail" aria-label="Current search selection">
          <p>Current selection</p>
          {selectedLocations.length === 0 && selectedRecords.length === 0 ? (
            <div className="rail-empty">
              Add map areas or data records to build a dive list.
            </div>
          ) : (
            <>
              <div className="rail-selection-summary">
                <strong>
                  {selectedLocations.length + selectedRecords.length} active
                </strong>
                <button type="button" onClick={clearSelections}>
                  Clear
                </button>
              </div>
              {selectedLocations.map((location) => (
                <button
                  key={location.location_id}
                  type="button"
                  onClick={() => toggleWaypoint(location.location_id)}
                  onMouseEnter={() => setActiveWaypoint(location.location_id)}
                  onFocus={() => setActiveWaypoint(location.location_id)}
                >
                  <strong>{location.location_name}</strong>
                  <span>{location.location_id}</span>
                </button>
              ))}
              {selectedRecords.map((record) => (
                <button
                  key={record.id}
                  type="button"
                  onClick={() => toggleRecord(record)}
                  onMouseEnter={() => {
                    if (record.locationId) setActiveWaypoint(record.locationId);
                  }}
                  onFocus={() => {
                    if (record.locationId) setActiveWaypoint(record.locationId);
                  }}
                >
                  <strong>{record.title}</strong>
                  <span>
                    {record.source} / {record.subtype}
                  </span>
                </button>
              ))}
            </>
          )}
        </section>
      </aside>

      <main className="dataset-main">
        <header className="dataset-page-heading">
          <h1 style={{"fontSize":"4.5rem", "marginTop":"2rem"}}>Search</h1>
          <span>
            {apiStatus === "ready"
              ? ""
              : apiStatus === "loading"
                ? "Loading API records"
                : "Fallback records"}
          </span>
        </header>
        <section
          ref={searchPanelRef}
          className="dataset-search-panel"
          aria-label="Dataset search"
          style={{ height: searchPanelHeight }}
        >
          <div className="dataset-controls">
            <label className="dataset-search">
              <span>Search data</span>
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search IDs, assets, anomalies, missions..."
              />
            </label>
            <label>
              <span>Data type</span>
              <select
                value={selectedSource}
                onChange={(event) => {
                  setSelectedSource(event.target.value as DatasetSource | "All");
                  setSelectedSubtype("All");
                }}
              >
                <option value="All">All data</option>
                {sourceOptions.map((source) => (
                  <option key={source} value={source}>
                    {source}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Subtype</span>
              <select
                value={selectedSubtype}
                onChange={(event) => setSelectedSubtype(event.target.value)}
              >
                <option value="All">All subtypes</option>
                {subtypeOptions.map((subtype) => (
                  <option key={subtype} value={subtype}>
                    {subtype}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Location</span>
              <select
                value={selectedLocationFilter}
                onChange={(event) => {
                  setSelectedLocationFilter(event.target.value);
                  if (event.target.value !== "All") setActiveWaypoint(event.target.value);
                }}
              >
                <option value="All">All locations</option>
                {locationOptions.map((locationId) => (
                  <option key={locationId} value={locationId}>
                    {locationId}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="source-chips" aria-label="Quick data filters">
            {sourceOptions.map((source) => (
              <button
                key={source}
                type="button"
                aria-pressed={selectedSource === source}
                onClick={() => {
                  setSelectedSource((current) =>
                    current === source ? "All" : source,
                  );
                  setSelectedSubtype("All");
                }}
              >
                {source}
              </button>
            ))}
          </div>

          <section className="dataset-results" aria-label="Search results">
            <div className="results-heading">
              <div>
                <h2>Search results</h2>
                <span>{filteredRecords.length} shown</span>
              </div>
              <div className="results-actions">
                <span>{selectedRecords.length} saved for dive</span>
                <button type="button" onClick={focusMap}>
                  Map
                </button>
              </div>
            </div>
            {filteredRecords.length === 0 ? (
              <div className="dataset-empty">No matching records.</div>
            ) : (
              <div className="record-grid">
                {filteredRecords.map((record) => {
                  const isSelected =
                    record.source === "Locations" && record.locationId
                      ? selectedWaypoints.includes(record.locationId)
                      : selectedRecordIds.includes(recordKey(record));
                  return (
                    <article className="record-card" key={`${record.source}-${record.id}`}>
                      <div>
                        <span>{record.source}</span>
                        <span>{record.subtype}</span>
                        {record.locationId && <span>{record.locationId}</span>}
                      </div>
                      <h3>{record.title}</h3>
                      <p>{record.summary}</p>
                      <button
                        type="button"
                        className="record-add"
                        aria-pressed={isSelected}
                        onClick={() => toggleRecord(record)}
                      >
                        {isSelected ? "Added" : "Add"}
                      </button>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
          <div
            className="resize-grip"
            aria-label="Resize search panel"
            role="separator"
            onPointerDown={startSearchResize}
          >
            <span />
            <span />
            <span />
          </div>
        </section>

        <section className="map-section" id="dataset-map" tabIndex={-1}>
          <div className="map-heading">
            <div>
              <p className="dataset-kicker">Facility map</p>
              <h2>Select with the Map!</h2>
            </div>
            <div className="map-summary">
              <strong>{activeLocation?.location_name ?? "Select an area"}</strong>
              <span>{activeWaypoint}</span>
              <small>
                {activeLocationRecords.length} matching records in current search
              </small>
            </div>
          </div>

          <div className="map-shell">
            <div className="map-canvas">
              <img src={floorPlanUrl} alt="Fictional facility floor plan" />
              <svg
                className="relay-overlay"
                viewBox="0 0 100 100"
                aria-hidden="true"
                preserveAspectRatio="none"
              >
                <polyline className="relay-path replay" points={replayRelayPoints} />
                {selectedLocations.length > 1 && (
                  <polyline
                    className="relay-path selected"
                    points={selectedRelayPoints}
                  />
                )}
                {replayLocations.map((location, index) => (
                  <g
                    className="relay-node replay"
                    key={`${selectedMissionId}-${location.location_id}-${index}`}
                    transform={`translate(${location.mapX} ${location.mapY})`}
                  >
                    <circle r="0.92" />
                  </g>
                ))}
                {selectedLocations.map((location, index) => (
                  <g
                    className="relay-node selected"
                    key={location.location_id}
                    transform={`translate(${location.mapX} ${location.mapY})`}
                  >
                    <circle r="1.45" />
                    <text y="0.35">{index + 1}</text>
                  </g>
                ))}
              </svg>
              {locations.map((location) => (
                <button
                  key={location.location_id}
                  type="button"
                  className={`waypoint-zone ${
                    activeWaypoint === location.location_id ||
                    selectedWaypoints.includes(location.location_id)
                      ? "active"
                      : ""
                  }`}
                  aria-pressed={selectedWaypoints.includes(location.location_id)}
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
                  aria-label={`${location.location_id} ${location.location_name}`}
                  onClick={() => toggleWaypoint(location.location_id)}
                  onMouseEnter={() => setActiveWaypoint(location.location_id)}
                  onFocus={() => setActiveWaypoint(location.location_id)}
                >
                  <span>{location.location_id}</span>
                </button>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default DatasetDashboard;
