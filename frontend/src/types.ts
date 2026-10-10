export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "NONE";
export type Position = { x: number; y: number; z: number };
export type Waypoint = {
  location_id: string;
  position: Position;
  position_source: string;
};
export type WaypointHistory = Waypoint & {
  highest_severity: Severity;
  anomaly_count: number;
  anomaly_ids: string[];
  source: string;
};
export type Obstruction = {
  id: string;
  type: string;
  source: string;
  coordinate_system: string;
  units: string;
  position: Position;
  dimensions: Position;
  point_count: number;
  review_status: string;
};
export type Outcomes = {
  total_missions: number;
  completed_missions: number;
  mission_completion_pct: number | null;
  total_actions: number;
  successful_actions: number;
  failed_actions: number;
  action_success_pct: number | null;
};
export type Metrics = Outcomes & {
  latest_record_at: string | null;
  total_readings: number;
  total_anomalies: number;
  review_required_count: number;
  anomalies_by_severity: Record<string, number>;
  by_scenario: Record<string, Outcomes>;
};
export type Mission = {
  mission_id: string;
  mission_name: string;
  scenario: string;
  mission_status: string;
  start_time: string;
  duration_min: number;
  battery_used_pct: number;
  total_actions: number;
  failed_actions: number;
  synthetic: boolean;
};
export type Finding = {
  anomaly_id: string;
  mission_id: string;
  asset_name: string;
  location_id: string;
  location_name: string;
  timestamp: string;
  severity: Severity;
  description: string;
  operator_review_required: boolean;
  synthetic: boolean;
};
export type DashboardData = {
  metrics: Metrics;
  missions: Mission[];
  findings: Finding[];
};
export type LidarData = {
  waypoints: Waypoint[];
  history: WaypointHistory[];
  obstruction: Obstruction;
};
