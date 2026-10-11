# knight-hacks-ix

Robotic facility inspection dashboard for Knight Hacks IX. React displays
mission analytics, findings, and a simulated LiDAR room; Django REST Framework
serves the local inspection data. All supplied operational data is synthetic.

## Prerequisites

- Python 3.10 or newer (tested with Python 3.14).
- Node.js 22.12 or newer (tested with Node.js 24) and npm.
- PostgreSQL 17 (or Docker with Compose to run the included database).

The commands below are for macOS/Linux and run from the repository root unless
otherwise stated. No virtual environment activation is required.

## First-time setup

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r server/requirements.txt
npm ci --prefix frontend
docker compose up -d --wait postgres
export DATABASE_URL='postgresql://knight_hacks:knight_hacks_dev@127.0.0.1:5432/knight_hacks'
.venv/bin/python server/manage.py migrate
.venv/bin/python server/manage.py import_challenge_data
```

The importer reads all six original CSVs, `replay.ndjson`, and
`validation_results.json` in `SPOT_KnightHacks_Challenge_Kit Part One/02_DATA/`
and stores them in PostgreSQL. It leaves the source files unchanged. Repeated
imports skip identical records; conflicting IDs or invalid rows roll back the
entire import. Replay events retain source order, including equal timestamps.
Docker stores the database in the persistent `postgres_data` volume.

All records are global. There are no application users, accounts, login routes,
ownership fields, or authentication sessions. Keep this unauthenticated API on
a trusted local/private network; do not expose it publicly.

## Start the project

Start the frontend and backend together:

```sh
npm run dev
```

| Service | URL |
| --- | --- |
| React dashboard | http://localhost:5173 |
| Django API | http://127.0.0.1:8000/api/health |
| Swagger API docs | http://127.0.0.1:8000/api/docs |

**Ctrl+C stops both servers.** The launcher also stops the other server if one
fails. On macOS/Linux, frontend and backend changes reload automatically.

The dashboard defaults to **Demo data**, a bundled snapshot of the synthetic
challenge dataset. Choose **Django API** to load records from your local database.
Both modes display historical data, not live robot telemetry. API failures clear
previous values and display an error; they do not silently substitute demo data.

Vite proxies `/api` requests to Django on port 8000. The frontend uses port 5173
and does not automatically switch ports if it is occupied. These are local
development servers, not a production deployment.

## Run a service independently

For the frontend alone, including demo mode without Django:

```sh
npm --prefix frontend run dev
```

For the backend alone:

```sh
.venv/bin/python server/manage.py runserver 127.0.0.1:8000
```

If running both independently, use separate terminals and stop each with Ctrl+C.

## Checks and frontend build

```sh
.venv/bin/python server/manage.py check
.venv/bin/python server/manage.py test api
.venv/bin/python server/manage.py spectacular --validate --fail-on-warn
npm --prefix frontend run build
```

The frontend build is written to `frontend/dist/`. To preview that build:

```sh
npm --prefix frontend run preview
```

Open the URL printed by Vite. Demo mode works without Django. For Django API
mode, start the backend separately; the preview inherits the local `/api` proxy.

## Update the demo snapshot

After migrating and importing the local dataset, regenerate the bundled snapshot:

```sh
.venv/bin/python frontend/scripts/export_demo.py
```

This updates `frontend/public/demo/dashboard.json` using the Django API
serializers. It does not require a running Django server.

## Backend configuration

Django reads `DJANGO_DEBUG`, `DJANGO_SECRET_KEY`, and `DJANGO_ALLOWED_HOSTS`
(comma-separated) from environment variables. Local defaults enable debug and
use a development-only key. Disabling debug requires an explicit secret key.
Environment files are not automatically loaded; export variables in your shell.
CORS allows the React origin `http://localhost:5173`.

`DATABASE_URL` selects PostgreSQL and supports optional `sslmode` and
`connect_timeout` query parameters. Defaults match the local Compose database;
see `.env.example`. PostgreSQL tests create and remove a separate
`test_knight_hacks` database, so the test connection needs `CREATEDB` permission.
For an explicit lightweight fallback, export `DJANGO_DB_BACKEND=sqlite` before
migrating. Existing SQLite data is not copied or deleted automatically.

The source timestamps have no timezone. The importer assumes UTC by default;
use `--source-timezone <IANA timezone>` when importing a fresh database if a
different source convention is confirmed. Dashboard timestamps display UTC.

## Troubleshooting

- **Missing dependencies:** run the first-time setup commands above.
- **Missing database tables:** run `migrate`, then `import_challenge_data`.
- **Database connection refused:** start PostgreSQL with
  `docker compose up -d --wait postgres` or your local PostgreSQL installation.
  Only one database server can bind port 5432; use a different `POSTGRES_PORT`
  and matching `DATABASE_URL` when necessary.
- **Empty API dashboard:** import the dataset, select Django API, and refresh.
- **API unavailable:** confirm Django is running on port 8000. Demo mode remains
  available when you explicitly select it.
- **Port already in use:** stop the existing server before running `npm run dev`.

See [LiDAR integration notes](frontend/INTEGRATION.md) for asset formats,
coordinate conventions, and the prototype's limitations.

## Camera and Model Inference

Stateless frame/audio endpoints are available under `/api/inference/` for the
registered gauge, corrosion, thermal, and experimental acoustic checkpoints.
Install `server/requirements-inference.txt` for model execution. Webcam, browser,
and Spot SDK camera clients send independent frame requests without server-side
camera sessions. See [inference setup, API contracts, and camera commands](docs/inference-api.md).

## Global Records and Replays

Full CRUD is available for locations, assets, missions, actions, readings,
anomalies, LiDAR scans, ML detections, replays, replay events, and import reports
under `/api/records/`. Existing dashboard and inference routes remain unchanged.
All operations are documented in Swagger at `/api/docs`.
See [database schemas, API contracts, and examples](docs/database-api.md).
