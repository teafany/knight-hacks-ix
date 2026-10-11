# Spotlight

◝(ᵔᗜᵔ)◜ **Turning robot data into actionable insights**

Spotlight is a facility inspection dashboard that connects mission history,
sensor readings, and spatial data so operators can explore **what happened,
where it happened, and what needs attention**.

Built at **Knight Hacks IX** for **NextEra Energy’s SPOT Operational Intelligence
Challenge**, using the challenge’s synthetic dataset. The facility and robot
movement are simulated; the dashboard shows recorded inspection data.

**Devpost:** https://devpost.com/software/spotlight-fxqamj

---

## Inspiration

Robotic inspections can collect a lot of useful information, but understanding
that information is a different challenge. Mission logs, sensor readings, and
spatial data can feel disconnected when someone is trying to figure out what
happened and what needs attention.

NextEra Energy’s challenge asked us to bring those pieces together into something
an operator could understand and act on. We built **Spotlight** to make inspection
data easier to explore and give users a clearer view of the facility they are
looking at.

---

## Features

- **Inspection summary:** Bring mission performance, priority findings, saved AI results (including simulated examples), and spatial evidence together at `/summary`. See [summary data and setup](docs/summary-page.md).
- **Mission overview:** Compare mission completion, action outcomes, and inspection findings.
- **Interactive digital twin:** Explore a simulated facility in 3D, select waypoints, and view historical findings and synthetic obstructions.
- **Mission replay:** Play back recorded mission events and follow SPOT’s simulated movement through the facility.
- **Dataset exploration:** Browse the challenge data and explore relationships between missions, actions, readings, anomalies, assets, and locations.
- **LiDAR change detection:** Align point clouds and group geometric changes into possible obstructions for the digital twin.
- **Machine learning APIs:** Run gauge detection, corrosion classification, thermal-image classification, and experimental acoustic analysis through backend endpoints.
- **Demo and API modes:** Explore a bundled dataset snapshot or connect the dashboard to Django inspection records.

---

## Architecture & Tech Stack

We built the frontend with **React and TypeScript**, using **Vite** for development
and builds. **Three.js** displays the facility model, waypoints, and obstruction
overlays in the digital twin.

The **Django REST Framework** backend serves dashboard data, record APIs, and
stateless model inference. **PostgreSQL** stores inspection records, replay
events, and saved machine learning results. The importer connects the challenge’s
original datasets without modifying their source files.

Our LiDAR pipeline uses **Open3D** to align point clouds and identify changes. 
**PyTorch** powers our machine learning models. We also used **AMD AI compute** during development and deployed the application on **Vultr**.

### Technology Used

- **Frontend:** React, TypeScript, Vite, Three.js
- **Backend:** Python, Django, Django REST Framework
- **Database:** PostgreSQL
- **Machine learning:** PyTorch, OpenCV
- **LiDAR processing:** Open3D, NumPy
- **AI compute:** AMD AI compute
- **Deployment:** Vultr
- **Local development:** Docker Compose

---

## Getting Started

### Prerequisites

- Python 3.10 or newer (tested with Python 3.14).
- Node.js 22.12 or newer (tested with Node.js 24) and npm.
- PostgreSQL 17 (or Docker with Compose to run the included database).

The commands below are for macOS/Linux and run from the repository root unless
otherwise stated. No virtual environment activation is required.

### First-time setup

Clone the repository, then run the setup commands from its root:

```sh
git clone https://github.com/teafany/knight-hacks-ix.git
cd knight-hacks-ix
```

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r server/requirements.txt
npm ci --prefix frontend
docker compose up -d --wait postgres
export DATABASE_URL='postgresql://knight_hacks:knight_hacks_dev@127.0.0.1:5432/knight_hacks'
.venv/bin/python server/manage.py migrate
.venv/bin/python server/manage.py import_challenge_data
```

The importer loads the challenge datasets into PostgreSQL without changing the source files or duplicating existing records.

### Start the project

Run the frontend and backend together using your local API:

```sh
VITE_API_BASE_URL=/api npm run dev
```

| Service | URL |
| --- | --- |
| Dashboard | http://localhost:5173 |
| API health check | http://127.0.0.1:8000/api/health |
| API documentation | http://127.0.0.1:8000/api/docs |

Choose **Demo data** to explore the bundled dataset or **Django API** to load your imported records. Both display historical, synthetic inspection data.

### Test and build

```sh
.venv/bin/python server/manage.py check
.venv/bin/python server/manage.py test api
VITE_API_BASE_URL=/api npm --prefix frontend run build
```

The frontend build is saved to `frontend/dist/`.

---

## Additional Documentation

- [Deployment guide](docs/deployment.md)
- [Model inference APIs](docs/inference-api.md)
- [Database and record APIs](docs/database-api.md)
- [LiDAR integration](frontend/INTEGRATION.md)

---

## What’s Next

We would like to improve our models, test them on more representative data, and keep refining the interface.

---

## Simulated AI examples

After importing the challenge data, add nine saved gauge, corrosion, thermal and
acoustic responses plus six linked review findings under mission `SIM-AI-M001`:

```sh
.venv/bin/python server/manage.py seed_simulated_inference
```

Examples are labeled `[SIMULATED]`. The command requires no model execution;
reruns preserve reviews and create no duplicates. See the
[simulated inference documentation](docs/inference-api.md#simulated-dashboard-data).

---

*Built together at Knight Hacks IX.*
<br>
*Made with love by Carlos, Zhiting, Anthony, and Tiffany, the 16 Eyes Team (we all wear glasses).*
