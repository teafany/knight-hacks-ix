import {
  CheckCircle2,
  FileSearch,
  MapPin,
  PanelLeft,
  Play,
  Plus,
  Search,
  TableProperties,
  Trash2,
} from "lucide-react";
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
import { apiURL } from "./apiConfig";
import "./DatasetDashboard.css";

type DataValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Record<string, unknown>
  | unknown[];
type CsvRow = Record<string, DataValue>;

type DatasetSource =
  | "Actions"
  | "Anomalies"
  | "Assets"
  | "Locations"
  | "Missions"
  | "Readings"
  | "Connected";

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
  onOpenReplay?: (missionId: string) => void;
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

type PanelMode = "search" | "more-info";

type SummaryRelatedGroup = {
  label: string;
  endpoint: string;
  records: CsvRow[];
};

type RelatedRecordPreview = {
  key: string;
  row: CsvRow;
  record: DatasetRecord;
  missionId: string;
  locationId: string;
};

type SummaryState = {
  key: string;
  status: "loading" | "ready" | "error";
  primary?: CsvRow;
  groups: SummaryRelatedGroup[];
  modelSummary?: CsvRow;
  error?: string;
};

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

const recordEndpoints: Partial<Record<DatasetSource, string>> = {
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
  let url: string | null = apiURL(
    `${path}${path.includes("?") ? "&" : "?"}limit=500`,
  );
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

async function fetchRecord<T extends CsvRow>(
  path: string,
  signal: AbortSignal,
) {
  const response = await fetch(apiURL(path), { signal });
  if (!response.ok) throw new Error(`API request failed: ${response.status}`);
  return (await response.json()) as T;
}

function fieldValue(record: DatasetRecord | undefined, key: string) {
  return textValue(record?.fields[key]);
}

function filteredSearchLabel(
  selectedSource: DatasetSource | "All",
  selectedSubtype: string,
  selectedLocationFilter: string,
  searchQuery: string,
) {
  const parts = [
    selectedSource === "All" ? "all data" : selectedSource,
    selectedSubtype === "All" ? "" : selectedSubtype,
    selectedLocationFilter === "All" ? "" : selectedLocationFilter,
    searchQuery.trim() ? `"${searchQuery.trim()}"` : "",
  ].filter(Boolean);
  return parts.join(" / ");
}

function relatedSummaryRequests(record: DatasetRecord) {
  const id = encodeURIComponent(record.id);
  const missionId = encodeURIComponent(fieldValue(record, "mission_id"));
  const actionId = encodeURIComponent(fieldValue(record, "action_id"));
  const assetId = encodeURIComponent(fieldValue(record, "asset_id"));
  const locationId = encodeURIComponent(record.locationId);
  const mlDetectionId = encodeURIComponent(fieldValue(record, "ml_detection_id"));

  if (record.source === "Actions") {
    return [
      { label: "Readings from action", endpoint: `records/readings?action_id=${id}` },
      { label: "Findings from action", endpoint: `records/anomalies?action_id=${id}` },
      { label: "Replay events", endpoint: `records/replay-events?action_id=${id}` },
      { label: "LiDAR scans", endpoint: `records/lidar-scans?action_id=${id}` },
      { label: "ML detections", endpoint: `records/ml-detections?action_id=${id}` },
    ];
  }
  if (record.source === "Anomalies") {
    return [
      actionId && { label: "Action readings", endpoint: `records/readings?action_id=${actionId}` },
      actionId && { label: "Replay events", endpoint: `records/replay-events?action_id=${actionId}` },
      assetId && { label: "Asset detections", endpoint: `records/ml-detections?asset_id=${assetId}` },
      mlDetectionId && { label: "ML detections", endpoint: "records/ml-detections" },
    ].filter(Boolean) as { label: string; endpoint: string }[];
  }
  if (record.source === "Assets") {
    return [
      { label: "Asset actions", endpoint: `records/actions?asset_id=${id}` },
      { label: "Asset readings", endpoint: `records/readings?asset_id=${id}` },
      { label: "Asset findings", endpoint: `records/anomalies?asset_id=${id}` },
      { label: "ML detections", endpoint: `records/ml-detections?asset_id=${id}` },
    ];
  }
  if (record.source === "Locations") {
    return [
      { label: "Assets in area", endpoint: `records/assets?location_id=${locationId}` },
      { label: "Actions in area", endpoint: `records/actions?location_id=${locationId}` },
      { label: "Replay events in area", endpoint: `records/replay-events?location_id=${locationId}` },
      { label: "LiDAR scans", endpoint: `records/lidar-scans?location_id=${locationId}` },
    ];
  }
  if (record.source === "Missions") {
    return [
      { label: "Mission actions", endpoint: `records/actions?mission_id=${id}` },
      { label: "Mission readings", endpoint: `records/readings?mission_id=${id}` },
      { label: "Mission findings", endpoint: `records/anomalies?mission_id=${id}` },
      { label: "Mission replays", endpoint: `records/replays?mission_id=${id}` },
      { label: "Replay events", endpoint: `records/replay-events?mission_id=${id}` },
      { label: "LiDAR scans", endpoint: `records/lidar-scans?mission_id=${id}` },
      { label: "ML detections", endpoint: `records/ml-detections?mission_id=${id}` },
    ];
  }
  return [
    actionId && { label: "Sibling action readings", endpoint: `records/readings?action_id=${actionId}` },
    missionId && { label: "Mission findings", endpoint: `records/anomalies?mission_id=${missionId}` },
    actionId && { label: "Replay events", endpoint: `records/replay-events?action_id=${actionId}` },
    assetId && { label: "Asset detections", endpoint: `records/ml-detections?asset_id=${assetId}` },
  ].filter(Boolean) as { label: string; endpoint: string }[];
}

function summaryHighlights(
  record: DatasetRecord,
  groups: SummaryRelatedGroup[],
  searchLabel: string,
) {
  const relationshipCount = groups.reduce(
    (total, group) => total + group.records.length,
    0,
  );
  const status =
    fieldValue(record, "status") ||
    fieldValue(record, "mission_status") ||
    fieldValue(record, "quality") ||
    fieldValue(record, "severity") ||
    fieldValue(record, "criticality") ||
    fieldValue(record, "zone_type");
  return [
    { label: "Search context", value: searchLabel || "all data" },
    { label: "Selected type", value: `${record.source} / ${record.subtype}` },
    { label: "Primary state", value: status || "Not recorded" },
    { label: "Related records", value: String(relationshipCount) },
  ];
}

function previewTitle(row: CsvRow) {
  return (
    textValue(row.action_id) ||
    textValue(row.anomaly_id) ||
    textValue(row.asset_name) ||
    textValue(row.asset_id) ||
    textValue(row.location_name) ||
    textValue(row.location_id) ||
    textValue(row.mission_name) ||
    textValue(row.mission_id) ||
    textValue(row.reading_id) ||
    textValue(row.event_id) ||
    textValue(row.name) ||
    textValue(row.id) ||
    "Record"
  );
}

function previewMeta(row: CsvRow) {
  return [
    textValue(row.event_type),
    textValue(row.status) || textValue(row.review_status) || textValue(row.quality),
    textValue(row.location_id),
    textValue(row.asset_id),
    textValue(row.mission_id),
  ]
    .filter(Boolean)
    .join(" / ");
}

function sourceFromRelatedEndpoint(endpoint: string): DatasetSource | undefined {
  const [path] = endpoint.split("?");
  const segment = path.split("/").at(-1);
  return Object.entries(recordEndpoints).find(
    ([, value]) => value === segment,
  )?.[0] as DatasetSource | undefined;
}

function relatedPreviewFor(
  group: SummaryRelatedGroup,
  row: CsvRow,
  records: DatasetRecord[],
): RelatedRecordPreview {
  const source = sourceFromRelatedEndpoint(group.endpoint);
  const id = source ? idFor(source, row) : "";
  const matchedRecord =
    source && id
      ? records.find((item) => item.source === source && item.id === id)
      : undefined;
  const key =
    matchedRecord?.id ||
    id ||
    textValue(row.event_id) ||
    textValue(row.scan_id) ||
    textValue(row.detection_id) ||
    textValue(row.id) ||
    JSON.stringify(row);
  const locationId = textValue(row.location_id);
  const missionId = textValue(row.mission_id);
  const record =
    matchedRecord ?? {
      id: `${group.endpoint}:${key}`,
      source: "Connected" as const,
      subtype: group.label,
      title: previewTitle(row),
      locationId,
      summary: previewMeta(row) || "Record connection",
      fields: row,
      searchText: [
        key,
        group.label,
        previewTitle(row),
        previewMeta(row),
        missionId,
        locationId,
        ...Object.values(row),
      ]
        .map(textValue)
        .join(" ")
        .toLowerCase(),
    };

  return {
    key,
    row,
    record,
    missionId,
    locationId,
  };
}

function DatasetDashboard({ onHome, onOpenReplay }: DatasetDashboardProps) {
  const [activeWaypoint, setActiveWaypoint] = useState("WP05");
  const [selectedWaypoints, setSelectedWaypoints] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSource, setSelectedSource] = useState<DatasetSource | "All">("All");
  const [selectedSubtype, setSelectedSubtype] = useState("All");
  const [selectedLocationFilter, setSelectedLocationFilter] = useState("All");
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([]);
  const [selectedConnectedRecords, setSelectedConnectedRecords] = useState<
    DatasetRecord[]
  >([]);
  const [summaryRecordId, setSummaryRecordId] = useState("");
  const [panelMode, setPanelMode] = useState<PanelMode>("search");
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
  const [summaryState, setSummaryState] = useState<SummaryState | null>(null);
  const [summaryRelatedSearch, setSummaryRelatedSearch] = useState("");
  const [summaryRelatedGroup, setSummaryRelatedGroup] = useState("All");
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

  const toggleWaypoint = (locationId: string) => {
    setActiveWaypoint(locationId);
    setSelectedWaypoints((current) =>
      current.includes(locationId)
        ? current.filter((id) => id !== locationId)
        : [...current, locationId],
    );
  };

  const clearSelections = () => {
    setSelectedWaypoints([]);
    setSelectedRecordIds([]);
    setSelectedConnectedRecords([]);
    setSummaryRecordId("");
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
    setSelectedConnectedRecords((current) => {
      if (record.source !== "Connected") return current;
      return isSelected
        ? current.filter((item) => recordKey(item) !== key)
        : current.some((item) => recordKey(item) === key)
          ? current
          : [...current, record];
    });
    if (record.locationId) setActiveWaypoint(record.locationId);
  };

  const deleteRailRecord = (record: DatasetRecord) => {
    const key = recordKey(record);
    setSelectedRecordIds((current) => current.filter((id) => id !== key));
    setSelectedConnectedRecords((current) =>
      current.filter((item) => recordKey(item) !== key),
    );
    if (record.source === "Locations" && record.locationId) {
      setSelectedWaypoints((current) =>
        current.filter((id) => id !== record.locationId),
      );
    }
    setSummaryRecordId((current) => (current === key ? "" : current));
  };

  const selectSummaryRecord = (record: DatasetRecord) => {
    setSummaryRecordId(recordKey(record));
    if (record.locationId) setActiveWaypoint(record.locationId);
  };

  const selectRelatedLocation = (locationId: string) => {
    if (!locationId) return;
    setActiveWaypoint(locationId);
    setSelectedWaypoints((current) =>
      current.includes(locationId) ? current : [...current, locationId],
    );
    focusMap();
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
  const selectableRecords = [...records, ...selectedConnectedRecords];
  const selectedRecords = selectedRecordIds
    .map((recordId) =>
      selectableRecords.find((record) => recordKey(record) === recordId),
    )
    .filter((record) => record?.source !== "Locations")
    .filter((record): record is DatasetRecord => Boolean(record));
  const selectedLocationRecords = selectedWaypoints
    .map((locationId) =>
      records.find(
        (record) =>
          record.source === "Locations" && record.locationId === locationId,
      ),
    )
    .filter((record): record is DatasetRecord => Boolean(record));
  const selectedRailRecords = [...selectedLocationRecords, ...selectedRecords];
  const summaryRecord =
    selectedRailRecords.find((record) => recordKey(record) === summaryRecordId) ??
    selectedRecords.at(-1) ??
    selectedLocationRecords.at(-1) ??
    records.find(
      (record) =>
        record.source === "Locations" && record.locationId === activeWaypoint,
    );
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
  const summarySearchLabel = filteredSearchLabel(
    selectedSource,
    selectedSubtype,
    selectedLocationFilter,
    searchQuery,
  );
  const summaryKey = summaryRecord ? recordKey(summaryRecord) : "";
  const summaryEndpoint = summaryRecord
    ? recordEndpoints[summaryRecord.source]
    : undefined;
  const summaryApiPath = summaryRecord && summaryEndpoint
    ? `records/${summaryEndpoint}/${encodeURIComponent(summaryRecord.id)}`
    : "";
  const summaryHighlightsList = summaryRecord
    ? summaryHighlights(
        summaryRecord,
        summaryState?.key === summaryKey ? summaryState.groups : [],
        summarySearchLabel,
      )
    : [];
  const summaryLocationId = summaryRecord?.locationId || activeWaypoint;
  const summaryLocation = locations.find(
    (location) => location.location_id === summaryLocationId,
  );
  const summaryMissionId = summaryRecord
    ? fieldValue(summaryRecord, "mission_id") ||
      (summaryRecord.source === "Missions" ? summaryRecord.id : "")
    : "";
  const connectedRecordItems =
    summaryState?.key === summaryKey && summaryState.status === "ready"
      ? summaryState.groups.flatMap((group) =>
          group.records.map((row, index) => ({
            ...relatedPreviewFor(group, row, records),
            groupLabel: group.label,
            endpoint: group.endpoint,
            index,
          })),
        )
      : [];
  const connectedGroupOptions = Array.from(
    new Set(connectedRecordItems.map((item) => item.groupLabel)),
  ).sort();
  const filteredConnectedRecordItems = connectedRecordItems.filter((item) => {
    const matchesGroup =
      summaryRelatedGroup === "All" || item.groupLabel === summaryRelatedGroup;
    const query = summaryRelatedSearch.trim().toLowerCase();
    const matchesSearch =
      query === "" ||
      [
        item.groupLabel,
        previewTitle(item.row),
        previewMeta(item.row),
        item.missionId,
        item.locationId,
        ...Object.entries(item.row).flatMap(([key, value]) => [
          key,
          textValue(value),
        ]),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    return matchesGroup && matchesSearch;
  });

  useEffect(() => {
    if (panelMode !== "more-info" || !summaryRecord) return;
    const abortController = new AbortController();
    const recordForSummary = summaryRecord;
    const currentKey = recordKey(recordForSummary);
    const currentEndpoint = recordEndpoints[recordForSummary.source];
    const currentApiPath = currentEndpoint
      ? `records/${currentEndpoint}/${encodeURIComponent(recordForSummary.id)}`
      : "";

    async function loadSummary() {
      if (!currentApiPath) {
        setSummaryState({
          key: currentKey,
          status: "ready",
          primary: recordForSummary.fields,
          groups: [],
        });
        return;
      }

      try {
        setSummaryState({
          key: currentKey,
          status: "loading",
          groups: [],
        });
        const requests = relatedSummaryRequests(recordForSummary);
        const [primary, groups, modelSummary] = await Promise.all([
          fetchRecord<CsvRow>(currentApiPath, abortController.signal),
          Promise.all(
            requests.map(async (request) => ({
              label: request.label,
              endpoint: request.endpoint,
              records: await fetchPaginated<CsvRow>(
                `/${request.endpoint}`,
                abortController.signal,
              ),
            })),
          ),
          recordForSummary.source === "Assets" ||
          recordForSummary.source === "Anomalies"
            ? fetchRecord<CsvRow>(
                "/records/ml-detections/summary",
                abortController.signal,
              ).catch(() => undefined)
            : Promise.resolve(undefined),
        ]);

        setSummaryState({
          key: currentKey,
          status: "ready",
          primary,
          groups,
          modelSummary,
        });
      } catch (error) {
        if (abortController.signal.aborted) return;
        console.error("Failed to load record details", error);
        setSummaryState({
          key: currentKey,
          status: "error",
          primary: recordForSummary.fields,
          groups: [],
          error:
            error instanceof Error
              ? error.message
              : "Unable to load connected records.",
        });
      }
    }

    loadSummary();
    return () => abortController.abort();
  }, [panelMode, summaryApiPath, summaryKey, summaryRecord]);

  useEffect(() => {
    setSummaryRelatedSearch("");
    setSummaryRelatedGroup("All");
  }, [summaryKey]);

  return (
    <div className="dataset-dashboard">
      <aside className="dataset-rail">
        <button type="button" className="dataset-brand" onClick={onHome}>
          <span>S</span>
          <strong>SPOT</strong>
        </button>
        <section className="selection-rail" aria-label="Current search selection">
          <p>Current selection</p>
          {selectedRailRecords.length === 0 ? (
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
              {selectedRailRecords.map((record) => {
                const isSummaryRecord =
                  summaryRecord && recordKey(record) === recordKey(summaryRecord);
                return (
                  <article
                    key={`${record.source}-${record.id}`}
                    className={`rail-item ${isSummaryRecord ? "active" : ""}`}
                    onMouseEnter={() => {
                      if (record.locationId) setActiveWaypoint(record.locationId);
                    }}
                >
                    <button
                      type="button"
                      className="rail-item-main"
                      onClick={() =>
                        panelMode === "more-info"
                          ? selectSummaryRecord(record)
                          : record.source === "Locations"
                            ? toggleWaypoint(record.locationId)
                            : toggleRecord(record)
                      }
                      onFocus={() => {
                        if (record.locationId) setActiveWaypoint(record.locationId);
                      }}
                    >
                      <strong>{record.title}</strong>
                      <span>
                        {record.source} / {record.subtype}
                      </span>
                    </button>
                    {panelMode === "more-info" ? (
                      <button
                        type="button"
                        className="rail-item-action select"
                        aria-pressed={Boolean(isSummaryRecord)}
                        onClick={() => selectSummaryRecord(record)}
                        title="Select for more info"
                      >
                        <CheckCircle2 size={14} aria-hidden="true" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="rail-item-action delete"
                        onClick={() => deleteRailRecord(record)}
                        title="Delete from rail"
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    )}
                  </article>
                );
              })}
            </>
          )}
        </section>
        <div className="rail-view-toggle" aria-label="Dataset panel mode">
          <button
            type="button"
            aria-pressed={panelMode === "search"}
            onClick={() => setPanelMode("search")}
            title="Show search"
          >
            <Search size={17} aria-hidden="true" />
            <span>Search</span>
          </button>
          <button
            type="button"
            aria-pressed={panelMode === "more-info"}
            onClick={() => setPanelMode("more-info")}
            title="Show more info"
          >
            <FileSearch size={17} aria-hidden="true" />
            <span>More info</span>
          </button>
        </div>
      </aside>

      <main className="dataset-main">
        <header className="dataset-page-heading">
          <h1 style={{"fontSize":"4.5rem", "marginTop":"2rem"}}>
            {panelMode === "search" ? "Search" : "More info"}
          </h1>
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
          className={`dataset-search-panel ${
            panelMode === "more-info" ? "more-info-page" : ""
          }`}
          aria-label={panelMode === "search" ? "Dataset search" : "Dataset more info"}
          style={panelMode === "search" ? { height: searchPanelHeight } : undefined}
        >
          {panelMode === "search" ? (
            <>
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
            </>
          ) : (
            <section className="summary-panel" aria-label="Selected record more info">
              {summaryRecord ? (
                <>
                  <div className="summary-heading">
                    <div>
                      <p className="dataset-kicker">More info</p>
                      <h2>{summaryRecord.title}</h2>
                      <span>
                        {summaryRecord.source} / {summaryRecord.subtype}
                        {summaryRecord.locationId ? ` / ${summaryRecord.locationId}` : ""}
                      </span>
                    </div>
                    <button type="button" onClick={() => setPanelMode("search")}>
                      <PanelLeft size={16} aria-hidden="true" />
                      Search
                    </button>
                  </div>
                  <div className="summary-body">
                    <div className="summary-insights">
                      {summaryHighlightsList.map((item) => (
                        <article key={item.label}>
                          <span>{item.label}</span>
                          <strong>{item.value}</strong>
                        </article>
                      ))}
                    </div>
                    <div className="summary-details">
                      <section className="summary-primary">
                        <div className="summary-section-title">
                          <TableProperties size={16} aria-hidden="true" />
                          <h3>Primary record</h3>
                        </div>
                        <p>{summaryRecord.summary}</p>
                        <dl>
                          {Object.entries(summaryState?.primary ?? summaryRecord.fields)
                            .filter(([, value]) => textValue(value) !== "")
                            .slice(0, 12)
                            .map(([key, value]) => (
                              <div key={key}>
                                <dt>{key.replaceAll("_", " ")}</dt>
                                <dd>{textValue(value)}</dd>
                              </div>
                            ))}
                        </dl>
                      </section>
                      {summaryLocation && (
                        <section className="summary-map">
                          <div className="summary-section-title">
                            <MapPin size={16} aria-hidden="true" />
                            <h3>Waypoint on map</h3>
                          </div>
                          <div className="summary-map-shell">
                            <div className="summary-map-canvas">
                              <img src={floorPlanUrl} alt="Fictional facility floor plan" />
                              <span
                                className="summary-map-pin"
                                style={
                                  {
                                    left: `${summaryLocation.mapX}%`,
                                    top: `${summaryLocation.mapY}%`,
                                  } as CSSProperties
                                }
                              >
                                {summaryLocation.location_id}
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="summary-map-action"
                            onClick={() => selectRelatedLocation(summaryLocation.location_id)}
                          >
                            Add waypoint to selection
                          </button>
                        </section>
                      )}
                      <section className="summary-related">
                        <div className="summary-section-title">
                          <FileSearch size={16} aria-hidden="true" />
                          <h3>Connected records</h3>
                        </div>
                        {summaryState?.key === summaryKey &&
                        summaryState.status === "loading" ? (
                          <div className="dataset-empty">Loading connected records.</div>
                        ) : summaryState?.key === summaryKey &&
                          summaryState.status === "error" ? (
                          <div className="dataset-empty">
                            {summaryState.error}
                          </div>
                        ) : connectedRecordItems.length ? (
                          <>
                            <div className="summary-related-filters">
                              <label>
                                <span>Search</span>
                                <div className="summary-related-search">
                                  <Search size={14} aria-hidden="true" />
                                  <input
                                    type="search"
                                    value={summaryRelatedSearch}
                                    placeholder="Record, status, mission"
                                    onChange={(event) =>
                                      setSummaryRelatedSearch(event.target.value)
                                    }
                                  />
                                </div>
                              </label>
                              <label>
                                <span>Type</span>
                                <select
                                  value={summaryRelatedGroup}
                                  onChange={(event) =>
                                    setSummaryRelatedGroup(event.target.value)
                                  }
                                >
                                  <option value="All">All connected records</option>
                                  {connectedGroupOptions.map((group) => (
                                    <option key={group} value={group}>
                                      {group}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <button
                                type="button"
                                onClick={() => {
                                  setSummaryRelatedSearch("");
                                  setSummaryRelatedGroup("All");
                                }}
                              >
                                Clear
                              </button>
                              <strong>
                                {filteredConnectedRecordItems.length} of{" "}
                                {connectedRecordItems.length}
                              </strong>
                            </div>
                            {filteredConnectedRecordItems.length ? (
                          <div className="summary-related-list">
                            {filteredConnectedRecordItems.map((preview) => {
                              const isSelected =
                                preview.record.source === "Locations" &&
                                preview.record.locationId
                                  ? selectedWaypoints.includes(
                                      preview.record.locationId,
                                    )
                                  : selectedRecordIds.includes(
                                      recordKey(preview.record),
                                    );
                              return (
                              <article
                                key={`${preview.endpoint}-${preview.key}-${preview.index}`}
                              >
                                <div>
                                  <strong>{previewTitle(preview.row)}</strong>
                                  <span>{preview.groupLabel}</span>
                                </div>
                                <p>{previewMeta(preview.row) || "Record connection"}</p>
                                <div className="summary-related-actions">
                                  <button
                                    type="button"
                                    aria-pressed={isSelected}
                                    onClick={() => toggleRecord(preview.record)}
                                    title="Add to selection"
                                  >
                                    <Plus size={13} aria-hidden="true" />
                                    {isSelected ? "Added" : "Add"}
                                  </button>
                                </div>
                              </article>
                              );
                            })}
                          </div>
                            ) : (
                              <div className="dataset-empty">
                                No connected records match these filters.
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="dataset-empty">No connected records found.</div>
                        )}
                      </section>
                      {summaryMissionId && onOpenReplay && (
                        <section className="summary-relay-link">
                          <div>
                            <span>Mission relay</span>
                            <strong>{summaryMissionId}</strong>
                          </div>
                          <button
                            type="button"
                            onClick={() => onOpenReplay(summaryMissionId)}
                          >
                            <Play size={15} aria-hidden="true" />
                            Open relay
                          </button>
                        </section>
                      )}
                      {summaryState?.modelSummary && (
                        <section className="summary-models">
                          <div className="summary-section-title">
                            <FileSearch size={16} aria-hidden="true" />
                            <h3>ML detection summary</h3>
                          </div>
                          <dl>
                            <div>
                              <dt>Total models</dt>
                              <dd>{textValue(summaryState.modelSummary.total_models)}</dd>
                            </div>
                            <div>
                              <dt>Total detections</dt>
                              <dd>{textValue(summaryState.modelSummary.total_detections)}</dd>
                            </div>
                            <div>
                              <dt>Registered models</dt>
                              <dd>
                                {textValue(
                                  summaryState.modelSummary.registered_model_count,
                                )}
                              </dd>
                            </div>
                          </dl>
                        </section>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="summary-empty">
                  <FileSearch size={24} aria-hidden="true" />
                  <h2>No location or record selected.</h2>
                </div>
              )}
            </section>
          )}
          {panelMode === "search" && (
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
          )}
        </section>

        {panelMode === "search" && (
          <section className="map-section" id="dataset-map" tabIndex={-1}>
            <div className="map-heading">
              <div>
                <p className="dataset-kicker">Facility map</p>
                <h2>Select with the Map!</h2>
              </div>
              <div className="map-summary">
                <strong>
                  {`${activeLocation?.location_name ?? "Select an area"}${activeWaypoint ? ` ( ${activeWaypoint} )` : ""}`}
                </strong>
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
        )}
        {panelMode === "search" && (
          <div className="map-replay-controls">
            <label className="mission-path-control map-replay-control">
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
            <button
              type="button"
              className="map-replay-button"
              onClick={() => onOpenReplay?.(selectedMissionId)}
              disabled={!selectedMissionId}
            >
              Replay selected path
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export default DatasetDashboard;
