import { useMemo, useState, type CSSProperties } from "react";
import actionsCsv from "../../SPOT_KnightHacks_Challenge_Kit Part One/02_DATA/actions.csv?raw";
import anomaliesCsv from "../../SPOT_KnightHacks_Challenge_Kit Part One/02_DATA/anomalies.csv?raw";
import assetsCsv from "../../SPOT_KnightHacks_Challenge_Kit Part One/02_DATA/assets.csv?raw";
import locationsCsv from "../../SPOT_KnightHacks_Challenge_Kit Part One/02_DATA/locations.csv?raw";
import missionsCsv from "../../SPOT_KnightHacks_Challenge_Kit Part One/02_DATA/missions.csv?raw";
import readingsCsv from "../../SPOT_KnightHacks_Challenge_Kit Part One/02_DATA/readings.csv?raw";
import floorPlanUrl from "../../SPOT_KnightHacks_Challenge_Kit Part One/04_ASSETS/fictional_floor_plan.png";
import "./DatasetDashboard.css";

type CsvRow = Record<string, string>;

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

function titleFor(source: DatasetSource, row: CsvRow) {
  if (source === "Actions") return row.action_id;
  if (source === "Anomalies") return row.anomaly_id;
  if (source === "Assets") return row.asset_name;
  if (source === "Locations") return row.location_name;
  if (source === "Missions") return row.mission_name;
  return row.reading_id;
}

function idFor(source: DatasetSource, row: CsvRow) {
  if (source === "Actions") return row.action_id;
  if (source === "Anomalies") return row.anomaly_id;
  if (source === "Assets") return row.asset_id;
  if (source === "Locations") return row.location_id;
  if (source === "Missions") return row.mission_id;
  return row.reading_id;
}

function summaryFor(source: DatasetSource, row: CsvRow) {
  if (source === "Actions")
    return `${row.status} ${row.action_type.toLowerCase()} on ${row.asset_id || "route"} during ${row.mission_id}`;
  if (source === "Anomalies")
    return `${row.severity} ${row.anomaly_type.toLowerCase()} finding: ${row.description}`;
  if (source === "Assets")
    return `${row.asset_type} at ${row.location_id} with ${row.criticality.toLowerCase()} criticality`;
  if (source === "Locations")
    return `${row.zone_type} zone on floor ${row.floor} in ${row.environment}`;
  if (source === "Missions")
    return `${row.mission_status} ${row.scenario.toLowerCase()} route, ${row.duration_min} minutes`;
  return `${row.measurement_type} ${row.value} ${row.unit} with ${row.quality.toLowerCase()} quality`;
}

function buildRecords(): DatasetRecord[] {
  return datasets.flatMap(({ source, csv }) =>
    parseCsv(csv).map((row) => {
      const subtype = row[typeKeys[source] ?? ""] || "UNSPECIFIED";
      const record: Omit<DatasetRecord, "searchText"> = {
        id: idFor(source, row),
        source,
        subtype,
        title: titleFor(source, row),
        locationId: row.location_id ?? "",
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
          .join(" ")
          .toLowerCase(),
      };
    }),
  );
}

function DatasetDashboard({ onHome }: DatasetDashboardProps) {
  const [activeWaypoint, setActiveWaypoint] = useState("WP05");
  const [selectedWaypoints, setSelectedWaypoints] = useState<string[]>([]);
  const records = useMemo(() => buildRecords(), []);
  const locations = useMemo(
    (): LocationRow[] =>
      parseCsv(locationsCsv).map((row) => ({
        ...row,
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

  const toggleWaypoint = (locationId: string) => {
    setSelectedWaypoints((current) =>
      current.includes(locationId)
        ? current.filter((id) => id !== locationId)
        : [...current, locationId],
    );
  };

  const clearSelections = () => {
    setSelectedWaypoints([]);
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

  return (
    <div className="dataset-dashboard">
      <aside className="dataset-rail">
        <button type="button" className="dataset-brand" onClick={onHome}>
          <span>S</span>
          <strong>SPOT</strong>
        </button>
        <section className="selection-rail" aria-label="Current search selection">
          <p>Current selection</p>
          {selectedLocations.length === 0 ? (
            <div className="rail-empty">
              Select map areas to build a route view.
            </div>
          ) : (
            <>
              <div className="rail-selection-summary">
                <strong>{selectedLocations.length} active</strong>
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
            </>
          )}
        </section>
      </aside>

      <main className="dataset-main">
        <section className="map-section" id="dataset-map">
          <div className="map-heading">
            <div>
              <p className="dataset-kicker">Facility map</p>
              <h2>Hover a waypoint zone.</h2>
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
