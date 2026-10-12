# Spotlight

◝(ᵔᗜᵔ)◜ **Turning robot data into actionable insights**

Spotlight is a facility inspection dashboard that connects mission history,
sensor readings, and spatial data so operators can explore **what happened,
where it happened, and what needs attention**.

Built at **Knight Hacks IX 2026** for **NextEra Energy’s SPOT Operational Intelligence
Challenge**, using the challenge’s synthetic dataset. Inspection records are
historical and synthetic, and replayed robot movement is simulated.

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

- **Inspection summary:** Bring mission performance, priority findings, saved AI results (including simulated examples), and spatial evidence together in one view
- **Mission overview:** Compare mission completion, action outcomes, and inspection findings
- **Interactive LiDAR:** Explore a room scan in 3D and toggle bounding boxes around detected geometric changes
- **Mission replay:** Play back recorded mission events and follow SPOT’s simulated movement through the facility
- **Dataset exploration:** Browse the challenge data and explore relationships between missions, actions, readings, anomalies, assets, and locations
- **LiDAR change detection:** Align point clouds and group geometric changes into possible obstructions for the LiDAR view
- **Machine learning APIs:** Run gauge detection, corrosion classification, thermal-image classification, and experimental acoustic analysis through backend endpoints
- **Demo and API modes:** Use the Summary page to explore a bundled snapshot or load backend inspection records

---

## Architecture & Tech Stack

We built the frontend with **React, TypeScript, and Vite**, and deployed the
application on **Vultr**. **Three.js** powers the 3D LiDAR view. **Django REST Framework** serves
inspection data and model inference, while **PostgreSQL** stores records and saved results.

**Open3D** aligns point clouds and detects changes. **PyTorch** powers our machine
learning models, and we used **AMD AI compute** during development.

**Vultr** hosts Spotlight’s frontend, backend APIs, PostgreSQL database, and
machine learning inference, bringing the project together in one online application.

### Technology Used

- **Frontend:** React, TypeScript, Vite, Three.js
- **Backend:** Python, Django, Django REST Framework
- **Database:** PostgreSQL
- **Machine learning:** PyTorch, OpenCV
- **LiDAR processing:** Open3D, NumPy
- **AI compute:** AMD AI compute
- **Hosting:** Vultr for the frontend, backend APIs, PostgreSQL, and model inference
- **Local development:** Docker Compose

---

## Getting Started

### Prerequisites

- Python 3.10 or newer
- Node.js 22.12 or newer and npm
- PostgreSQL 17 (or Docker with Compose to run the included database)

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
### Start the project

Run the frontend and backend together:

```sh
VITE_API_BASE_URL=/api npm run dev
```

| Service | URL |
| --- | --- |
| Dashboard | http://localhost:5173 |
| API health check | http://127.0.0.1:8000/api/health |
| API documentation | http://127.0.0.1:8000/api/docs |

### Test and build

```sh
.venv/bin/python server/manage.py check
.venv/bin/python server/manage.py test api
VITE_API_BASE_URL=/api npm --prefix frontend run build
```

---

## Additional Documentation

- [Deployment guide](docs/deployment.md)
- [Model inference APIs and simulated examples](docs/inference-api.md)
- [Database and record APIs](docs/database-api.md)
- [LiDAR integration](frontend/INTEGRATION.md)

---

## What’s Next

We would like to improve our models, test them on more representative data, and keep refining the interface.

---

*Made with love by [Carlos](https://www.linkedin.com/in/carlomen/), [Zhiting](https://www.linkedin.com/in/zhitingli/), [Anthony](https://www.linkedin.com/in/l-anthony/), and [Tiffany](https://www.linkedin.com/in/ttiffanychen/), the 16 Eyes Team (we all wear glasses).*
