# Global inspection database and CRUD API

PostgreSQL is the default backend. Everything is global: no application user,
account, tenant, owner, login, or session models are installed. Database roles
are infrastructure credentials only. The API is unauthenticated, including
writes and deletes; bind it to localhost or protect it at a trusted network
boundary before deployment.

## Setup

From the repository root, with Docker running:

```sh
docker compose up -d --wait postgres
export DATABASE_URL='postgresql://knight_hacks:knight_hacks_dev@127.0.0.1:5432/knight_hacks'
.venv/bin/python -m pip install -r server/requirements.txt
.venv/bin/python server/manage.py migrate
.venv/bin/python server/manage.py import_challenge_data
.venv/bin/python server/manage.py runserver 127.0.0.1:8000
```

The included password is for local development only. Use separate deployment
credentials and set `DATABASE_URL` accordingly. Percent-encode URL credentials
containing reserved characters. Optional URL parameters: `sslmode` and
`connect_timeout` (1-60 seconds). `.env.example` is a reference; Django does not
load it automatically. Compose binds PostgreSQL to loopback and persists data
in a named volume. `docker compose stop postgres` stops it without deleting data.

A native PostgreSQL installation can be used instead of Compose. The local
development database initialized during implementation lives in the ignored
`.postgres/` directory. On this machine its lifecycle commands are:

```sh
/opt/homebrew/opt/postgresql@17/bin/pg_ctl -D .postgres -l .postgres/server.log -o '-h 127.0.0.1 -p 5432 -k /tmp' start
/opt/homebrew/opt/postgresql@17/bin/pg_ctl -D .postgres stop
```

Stop that instance before starting Compose on the same port. Native and Docker
databases are separate; import the dataset into whichever database you select.
An optional SQLite fallback requires explicit `DJANGO_DB_BACKEND=sqlite`.
Switching backends does not transfer or remove an existing database.

## Schemas

Foreign keys are exposed as `*_id` fields containing a related record's primary
key, not nested objects. The original CSV entities keep their source string
primary keys. The five new entities use server-generated UUID `id` values plus
read-only `created_at` and `updated_at` timestamps. Timestamps use UTC in API
responses. PostgreSQL stores structured JSON fields as JSONB and measurements
and coordinates as exact decimals.

| Resource / table | Fields |
| --- | --- |
| `locations` / `api_location` | `location_id` PK, `location_name`, `zone_type`, `floor`, `x_coord` decimal(12,4), `y_coord` decimal(12,4), `environment`, `synthetic` |
| `assets` / `api_asset` | `asset_id` PK, `asset_name`, `asset_type`, `location_id` FK, `criticality`, `synthetic` |
| `missions` / `api_mission` | `mission_id` PK, `mission_name`, `scenario`, `configuration_version`, `start_time`, `end_time`, `duration_min`, `start_battery_pct`, `end_battery_pct`, `mission_status`, `operator_mode`, `synthetic` |
| `actions` / `api_action` | `action_id` PK, `mission_id` FK, `sequence`, `timestamp`, `location_id` FK, `asset_id` FK, `action_type`, `battery_pct`, `status`, `failure_type`, `duration_sec`, `scenario`, `configuration_version`, `synthetic` |
| `readings` / `api_reading` | `reading_id` PK, `action_id` FK, `mission_id` FK, `asset_id` FK, `location_id` FK, `timestamp`, `measurement_type`, `value` decimal(16,6), `unit`, `quality`, `synthetic` |
| `anomalies` / `api_anomaly` | `anomaly_id` PK, `action_id` FK, `mission_id` FK, `location_id` FK, `asset_id` FK, `timestamp`, `anomaly_type`, `severity`, `operator_review_required`, `description`, `synthetic`, nullable `ml_detection_id` FK |
| `lidar-scans` / `api_lidarscan` | UUID/timestamps, `name`, `captured_at`, `source`, `point_cloud_uri`, `file_format` (ply/pcd), nullable `point_count`, `coordinate_frame`, `units`, `mesh_uri`, `metadata` JSONB, nullable `mission_id` / `action_id` / `location_id` FKs |
| `ml-detections` / `api_mlanomalydetection` | UUID/timestamps, `asset_id` FK, nullable `mission_id` / `action_id` / `lidar_scan_id` FKs, `modality` (image/audio), `model_id`, `model_sha256`, `source_sha256`, `frame_id`, nullable `captured_at`, `processed_at`, `status`, nullable `label`, `result` JSONB, `review_status` (pending/confirmed/dismissed), `notes` |
| `replays` / `api_replay` | UUID/timestamps, `name`, nullable `mission_id` FK, `description`, nullable unique `source_sha256`; API also returns read-only `event_count` |
| `replay-events` / `api_replayevent` | UUID/timestamps, `event_id` source identifier, `replay_id` FK, `sequence` >= 1, `mission_id` FK, nullable `action_id` FK, `timestamp`, `event_type`, `details` JSONB |
| `import-reports` / `api_importreport` | UUID/timestamps, `source_name`, unique `source_sha256`, `validation_status`, nullable `generated_at`, `report` JSONB |

LiDAR metadata stores references to PLY/PCD point clouds and optional derived
meshes; point-cloud arrays, videos, images, and file blobs are not placed in
PostgreSQL. Upload/storage of those files remains the caller's responsibility.
This API records URIs without downloading or inspecting them.

Anomalies are inspection findings; ML detections are raw inference outputs with
model/input provenance and review state. They remain distinct, with an optional
link from a finding to its supporting ML detection.

## CRUD contract

All eleven resources use the same routes, without trailing slashes:

| Method | Route | Result |
| --- | --- | --- |
| GET | `/api/records/{resource}` | Paginated list, 200 |
| POST | `/api/records/{resource}` | Create from JSON, 201 |
| GET | `/api/records/{resource}/{primary_key}` | Retrieve, 200 |
| PUT | `/api/records/{resource}/{primary_key}` | Replace writable fields, 200 |
| PATCH | `/api/records/{resource}/{primary_key}` | Update supplied fields, 200 |
| DELETE | `/api/records/{resource}/{primary_key}` | Delete, 204 with no body |

Missing records return 404. Invalid fields, relationships, duplicate IDs or
sequences return 400. Primary keys cannot be changed. Unknown input fields are
rejected. Automatically generated/read-only fields are not writable.
`PUT` requires the resource's required writable fields; optional omitted fields
follow DRF's normal update behavior. Use `PATCH` for small edits.

Lists return `{ "count", "next", "previous", "results" }`. Use `limit` (default
100, maximum 500) and `offset`; ordering is stable. Exact-match filters:

| Resource | Filters |
| --- | --- |
| locations | zone_type, floor |
| assets | location_id, asset_type, criticality |
| missions | scenario, mission_status |
| actions | mission_id, asset_id, location_id, status |
| readings | mission_id, action_id, asset_id, measurement_type |
| anomalies | mission_id, action_id, asset_id, severity |
| lidar-scans | mission_id, action_id, location_id, file_format |
| ml-detections | asset_id, mission_id, action_id, lidar_scan_id, model_id, modality, review_status |
| replays | mission_id |
| replay-events | replay_id, mission_id, action_id, event_type |
| import-reports | validation_status |

Deleting a location, asset, mission, or action still referenced by other records
returns **409**, without cascading through inspection history. Delete or reassign
the dependent records first. Deleting a replay cascades only to its events;
missions/actions survive. Deleting a scan clears ML `lidar_scan_id`; deleting an
ML detection clears finding `ml_detection_id` without deleting the finding.
Deleting metadata does not remove external files.

The API validates action scenario/configuration against the mission and reading
or finding context against the action. Parent context changes that contradict
existing dependents are rejected. Asset and action locations may legitimately
differ, as they do in the supplied dataset. Mission end time cannot precede start
time; battery percentages are 0-100; failed actions require `failure_type` and
successful actions must leave it empty. JSON fields must be objects with finite
JSON-compatible values.

### LiDAR scan example

```sh
curl -X POST http://127.0.0.1:8000/api/records/lidar-scans \
  -H 'Content-Type: application/json' \
  -d '{"name":"Facility scan","captured_at":"2026-10-10T12:00:00Z","point_cloud_uri":"s3://inspection/scans/facility.ply","file_format":"ply","location_id":"WP01","metadata":{"sensor":"spot"}}'
```

Use the returned UUID to retrieve, update, or delete the record:

```sh
curl http://127.0.0.1:8000/api/records/lidar-scans/SCAN_UUID
curl -X PATCH http://127.0.0.1:8000/api/records/lidar-scans/SCAN_UUID \
  -H 'Content-Type: application/json' -d '{"name":"Reviewed facility scan"}'
curl -X DELETE http://127.0.0.1:8000/api/records/lidar-scans/SCAN_UUID
```

### Persisting live inference

Inference routes under `/api/inference/` remain stateless: invoking a model does
not write to this database. To save a selected response, POST its entire schema
version 1 object as `result` to `/api/records/ml-detections`, with an existing
`asset_id` and `modality`. Optional `mission_id`, `action_id`, `lidar_scan_id`,
`notes`, and `review_status` attach context and review state. For example:

```javascript
const response = await fetch('/api/records/ml-detections', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ asset_id: inference.asset_id, modality: 'image', result: inference }),
});
```

The raw result is preserved. Indexed model/hash/frame/time/status/label columns
are derived from that payload, not client-supplied duplicates. The asset must
match the result. Hashes must be lowercase SHA-256 digests. Classification
scores must be finite, within 0-1, and sum to one when present. Detector scores
and bounding boxes are validated. Saving a result validates its structure; it
does not independently rerun the model or verify provenance against a file.

### Replays

Create a replay with a `name`, then POST ordered events referencing its UUID.
Use unique `event_id` and positive `sequence` values within each replay.
A replay can be mission-specific or contain events from multiple missions;
events must match the replay's mission when one is assigned. Each event has its
own mission and optional action context. Details referencing an action must
agree with that context.

```sh
curl -X POST http://127.0.0.1:8000/api/records/replays \
  -H 'Content-Type: application/json' -d '{"name":"Morning inspection","mission_id":"M001"}'
curl 'http://127.0.0.1:8000/api/records/replay-events?replay_id=REPLAY_UUID&limit=100&offset=0'
```

Events are returned in replay/sequence order, not timestamp order. Sequence is
the stable tie-breaker when multiple events share a timestamp; playback clients
follow pagination until all events are loaded. Replay CRUD stores the timeline;
it does not create server-side playback sessions or render a video.

## Complete challenge import

`import_challenge_data` loads every object in `02_DATA/`: 15 locations, 20 assets,
27 missions, 270 actions, 220 readings, 40 anomalies, one replay containing 500
events, and one validation report. Source identifiers, decimals, flags, JSON
details, counts, metrics, and validation problems are retained. No placeholder
scans or ML results are fabricated: those are created through their CRUD routes.

The importer is atomic and idempotent. CSV primary keys and source content hashes
identify existing imports. Identical records are skipped; conflicting records,
invalid relationships, duplicate event IDs, or validation count mismatches roll
back the entire operation without overwriting edited records. `synthetic` must
be true for this importer; the CRUD API also accepts real records with false.
Naive source timestamps default to UTC; use `--source-timezone America/New_York`
only when that source convention is confirmed, on a fresh import.

## ML model summary

`GET /api/records/ml-detections/summary` returns an unpaginated global overview
of every registered model, including those with no saved detections, plus any
historical model IDs still present in PostgreSQL. It is read-only, unauthenticated,
and does not load model weights or run inference. No list filters apply here.

The response contains `total_models`, `registered_model_count`,
`total_detections`, global `review_status_counts`, and a `models` array sorted by
`model_id`. Each entry includes current registry metadata in `model` (null for
unregistered IDs), detection totals, modalities, review/status/label counts,
`unlabeled_count`, and nullable `latest_processed_at`. Review counts always
include pending, confirmed, and dismissed, even when zero. Null labels are
counted separately rather than treated as a predicted class.

Counts combine all saved versions with the same `model_id`; the nested metadata
describes the current registry version. `checkpoint_present` only indicates a
file exists, not that the model is healthy or suitable for deployment. The gauge
model is included as an inspection companion, not a normal/anomaly classifier.
Labels and inference statuses are reported as stored, without inferring a
universal anomaly count across incompatible model tasks. An unreadable registry
returns 503, consistent with `/api/inference/models`.

```sh
curl http://127.0.0.1:8000/api/records/ml-detections/summary
```

## Verification

```sh
.venv/bin/python server/manage.py check
.venv/bin/python server/manage.py makemigrations --check --dry-run
.venv/bin/python server/manage.py test api --noinput
.venv/bin/python server/manage.py spectacular --validate --fail-on-warn
```

Tests use a separate PostgreSQL database (the connection role needs CREATEDB)
and cover anonymous CRUD for all resources, JSONB storage, filtering, ordering,
constraints, protected deletion, nullable links, full import/rollback, and
existing dashboard/inference behavior. Interactive Swagger: `/api/docs`;
OpenAPI schema: `/api/schema`; ReDoc: `/api/redoc`.

Swagger and ReDoc group record CRUD operations by resource: Locations, Assets,
Missions, Actions, Readings, Anomalies, LiDAR Scans, ML Detections, Replays,
Replay Events, and Import Reports. Each section describes the records it manages.
The saved detection summary is in ML Detections; model execution is in Inference.
Dashboard groups the read-only analytics and finding endpoints, including finding
details, while Health contains the API process check.
