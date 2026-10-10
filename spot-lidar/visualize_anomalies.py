
import open3d as o3d
import pandas as pd
import json

# Load the challenge anomalies
anomalies = pd.read_csv("data/anomalies.csv")

# Load your exported waypoint positions
with open("output/waypoints.json", "r") as f:
    waypoints = json.load(f)

# Severity priority
priority = {
    "LOW": 1,
    "MEDIUM": 2,
    "HIGH": 3,
    "CRITICAL": 4
}

colors = {
    "LOW": [0, 1, 0],
    "MEDIUM": [1, 0.6, 0],
    "HIGH": [1, 0, 0],
    "CRITICAL": [0.6, 0, 0.8]
}

# Load the simulated facility
room = o3d.io.read_point_cloud("data/baseline.ply")
room.paint_uniform_color([0.2, 0.6, 1.0])

geometries = [room]

for waypoint in waypoints:
    location_id = waypoint["location_id"]
    position = waypoint["position"]

    # Find anomalies at this waypoint
    matches = anomalies[
        anomalies["location_id"] == location_id
    ]

    # Determine highest severity
    if matches.empty:
        color = [1, 0.8, 0]  # Yellow = no anomalies
        severity = "NONE"
    else:
        severity = max(
            matches["severity"],
            key=lambda s: priority.get(s, 0)
        )
        color = colors[severity]

    # Create waypoint sphere
    sphere = o3d.geometry.TriangleMesh.create_sphere(
        radius=0.10
    )
    sphere.compute_vertex_normals()
    sphere.paint_uniform_color(color)

    sphere.translate([
        position["x"],
        position["y"],
        position["z"]
    ])

    geometries.append(sphere)

    print(
        location_id,
        "Highest severity:", severity,
        "Anomalies:", len(matches)
    )

o3d.visualization.draw_geometries(
    geometries,
    window_name="SPOT - Anomaly Visualization",
    width=1200,
    height=800
)
