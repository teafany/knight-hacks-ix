
import pandas as pd
import numpy as np
import open3d as o3d
import json
from pathlib import Path

Path("output").mkdir(exist_ok=True)

# Load challenge waypoint data
df = pd.read_csv("data/locations.csv")

print("Columns:", df.columns.tolist())
print(df.head())

# Adjust these names if your CSV uses different headers
x_col = "x_coord"
y_col = "y_coord"
id_col = "location_id"

# Normalize coordinates into our simulated room
x_min, x_max = df[x_col].min(), df[x_col].max()
y_min, y_max = df[y_col].min(), df[y_col].max()

def scale(value, low, high, target_min, target_max):
    if high == low:
        return (target_min + target_max) / 2
    return target_min + (
        (value - low) / (high - low)
    ) * (target_max - target_min)

waypoints = []
geometries = []

# Load existing simulated room
room = o3d.io.read_point_cloud("data/baseline.ply")
room.paint_uniform_color([0.2, 0.6, 1.0])
geometries.append(room)

for _, row in df.iterrows():
    x = scale(row[x_col], x_min, x_max, 0.4, 4.6)
    y = scale(row[y_col], y_min, y_max, 0.4, 3.6)
    z = 0.15

    # Create waypoint marker
    sphere = o3d.geometry.TriangleMesh.create_sphere(
        radius=0.08
    )
    sphere.compute_vertex_normals()
    sphere.paint_uniform_color([1.0, 0.8, 0.0])
    sphere.translate((x, y, z))
    geometries.append(sphere)

    waypoints.append({
        "location_id": str(row[id_col]),
        "position": {
            "x": float(x),
            "y": float(y),
            "z": float(z)
        },
        "position_source": "demo_scaled_from_challenge_coordinates"
    })

# Export coordinates for Three.js
with open("output/waypoints.json", "w") as f:
    json.dump(waypoints, f, indent=4)

print(f"Exported {len(waypoints)} waypoints!")

o3d.visualization.draw_geometries(
    geometries,
    window_name="SPOT Facility Waypoints",
    width=1200,
    height=800
)
