import { apiURL } from "./apiConfig";
import type {
  DashboardData,
  Finding,
  LidarData,
  Metrics,
  Mission,
} from "./types";

export async function getJSON<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

export async function loadDashboard(
  mode: "demo" | "api",
  signal: AbortSignal,
): Promise<DashboardData> {
  if (mode === "demo")
    return getJSON<DashboardData>("/demo/dashboard.json", signal);
  const [health, metrics, missions, findings] = await Promise.all([
    getJSON<{ status: string }>(apiURL("health"), signal),
    getJSON<Metrics>(apiURL("metrics"), signal),
    getJSON<{ results: Mission[]; next: string | null }>(
      apiURL("missions?limit=500"),
      signal,
    ),
    getJSON<{ results: Finding[]; next: string | null }>(
      apiURL("findings?limit=500"),
      signal,
    ),
  ]);
  if (health.status !== "ok") throw new Error("The inspection API is not healthy");
  if (missions.next || findings.next)
    throw new Error(
      "This prototype supports up to 500 missions and findings; extend pagination before using a larger dataset.",
    );
  return { metrics, missions: missions.results, findings: findings.results };
}

export async function loadLidar(signal: AbortSignal): Promise<LidarData> {
  const [
    waypoints,
    history,
    obstruction,
    clustered_changes,
    waypoint_proximity,
  ] = await Promise.all([
    getJSON<LidarData["waypoints"]>("/lidar/waypoints.json", signal),
    getJSON<LidarData["history"]>("/lidar/waypoint_anomalies.json", signal),
    getJSON<LidarData["obstruction"]>("/lidar/anomalies.json", signal),
    getJSON<LidarData["clustered_changes"]>(
      // "/lidar/clustered_changes.json",
      "/lidar/real_clustered_changes.json",
      signal,
    ),
    getJSON<LidarData["waypoint_proximity"]>(
      "/lidar/waypoint_proximity.json",
      signal,
    ),
  ]);
  return {
    waypoints,
    history,
    obstruction,
    clustered_changes,
    waypoint_proximity,
  };
}
