# Local dashboard integration

This prototype runs on `tiff/frontend-backend-integration`. It displays synthetic
challenge history and a simulated LiDAR room. It never represents real robot
telemetry. Demo mode is the default and does not require Django.

## API integration

All setup, startup, testing, build, and snapshot-export commands are in the
[root README](../README.md).

Choose **Demo data** for the bundled snapshot or **Django API** to fetch
`/api/health`, `/api/metrics`, `/api/missions`, and
`/api/findings`. Vite proxies `/api` to the local Django server on port 8000.
Failed API requests clear previous dashboard data and show an error; the app
does not silently fall back to the snapshot. Refresh retries the selected source.

The current API mode reads up to 500 missions/findings and rejects additional
pages instead of silently truncating them. Extend pagination when the dataset
grows. This is a development proxy, not production hosting configuration.

## LiDAR asset handoff

The four files in `public/lidar/` are unchanged exports from the teammate's
`Lidar` branch at commit `d1366b9`:

| File | Use |
| --- | --- |
| `facility.glb` | Room geometry loaded with Three.js GLTFLoader |
| `waypoints.json` | 15 marker positions and their position source |
| `waypoint_anomalies.json` | Historical counts, highest severity, and anomaly IDs |
| `anomalies.json` | One separately detected synthetic obstruction and its bounding box |

These exports use **Z up**, X/Y as the floor plane, and meters. The viewer sets
its camera up direction accordingly and places model, markers, and the obstruction
using their supplied coordinates. Waypoints are explicitly demo-scaled; their
positions do not imply real SPOT localization or unmodified CSV coordinates.

Waypoint history always represents all missions. The findings table has separate
severity, waypoint, and mission filters. Clicking **View waypoint findings**
applies a waypoint filter; clicking a mission applies a mission filter. The
obstruction is separate from the 40 original challenge anomalies. Confidence is
unavailable, and review decisions are not saved by this prototype.

The exports are static frontend assets for this dummy dashboard. The agreed
`GET /api/scans/{scan_id}` schema remains unchanged and is not yet implemented.
Replace all four exports together when a revised model/coordinate mapping arrives.

## Data conventions

`public/demo/dashboard.json` is exported from the imported dataset through the
Django serializers, not hand-written metrics. See the root README to regenerate it.

The source timestamps have no timezone. The importer assumes UTC unless
`--source-timezone` is specified; dashboard timestamps display UTC consistently.
The latest-record label reports historical dataset time, not page-load time.
Cloud connectivity is not configured, and robot connectivity is simulated.
