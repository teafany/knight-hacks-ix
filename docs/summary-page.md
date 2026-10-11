# Inspection summary

Open `/summary` (or `/#summary`) from the **Inspection summary** action on the
home page. The page follows the map and replay workspaces' dark panels, amber
accents, Bitcount headings, and responsive layout.

The overview keeps four opening metrics and four compact charts: daily action
success, finding severity, facility hotspots, and AI review status. A small
coverage link opens sensor, asset, replay, and spatial evidence details.

Select a date, severity, facility area, or AI model to open the records behind
that signal. These views retain the searchable review queue, expandable model
outputs, scenario comparisons, mission pagination, and collected evidence.
**View all details** opens the original comprehensive view. A prominent **Back to
summary** button above the heading returns to the charts and stays visible while
scrolling on desktop and mobile, including during loading or errors.
Drill-down filters and the selected data source are stored
in the URL, so browser history, reloads, and shared links preserve the view.

Daily action success is weighted by the number of actions, rather than averaging
mission percentages. Days without actions appear as gaps. Facility hotspots
show the top five areas ranked by high/critical priority, with separate bar
segments for high/critical and other findings. AI bars show operator review
status, rather than treating model classification scores as hazard severity.

## Data sources

**Demo data** loads `frontend/public/demo/summary.json`, an independent snapshot
with 28 missions, 46 findings, and all nine simulated gauge, corrosion, thermal,
and acoustic outputs. The six linked AI findings remain searchable under
`SIM-AI-M001`. This does not change the older LiDAR dashboard's demo snapshot.

**Backend data** uses the configured `VITE_API_BASE_URL`. Collection requests
use `limit=100` and follow all pages using offsets; reading, finding, mission,
asset, location, and detection summaries therefore include records beyond the
first page. Replay/event/import/scan totals use each list endpoint's `count`.
The model-summary endpoint supplies registry metadata and per-model counts.
Backend failures show an explicit error and retry controls.

The displayed spatial comparison always comes from the bundled
`real_clustered_changes.json`, and is labeled separately from database scan
records. If it cannot load, the other summary sections remain available.

Simulated outputs are marked using their `SIMULATED-` frame IDs. Expand saved
results to inspect classification scores, gauge boxes, review status, and notes.
Uncalibrated scores are labeled. The page does not invent gauge values,
radiometric temperatures, or model hazard severity.

## Refresh the demo

From the repository root, with the database configured:

```sh
.venv/bin/python server/manage.py migrate
.venv/bin/python server/manage.py import_challenge_data
.venv/bin/python server/manage.py seed_simulated_inference
.venv/bin/python frontend/scripts/export_summary.py
```

The exporter follows backend pagination and requires saved simulated results,
so regeneration retains the mock AI examples. It writes only the summary
snapshot and does not run inference.

## Checks

```sh
node --experimental-strip-types --test frontend/scripts/test_summary.mjs
npm --prefix frontend run build
```

The summary tests cover snapshot consistency, review prioritization, all-page
loading, stalled pagination, empty record sets, weighted chart aggregation,
chart-to-record consistency, and drill-down URL filters. AI, finding, and mission
lists have visible pagination controls in detail views.
