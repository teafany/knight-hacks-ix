
import open3d as o3d
import numpy as np
import json
from pathlib import Path

Path("output").mkdir(exist_ok=True)

# Load detected changes
changes = o3d.io.read_point_cloud("data/changes.ply")

if changes.is_empty():
    raise ValueError("No changed points found.")

# Calculate bounding box
bbox = changes.get_axis_aligned_bounding_box()

center = bbox.get_center()
dimensions = bbox.get_extent()

# Create anomaly information
anomaly = {
    "id": "change_001",
    "type": "new_obstruction",
    "source": "synthetic_point_cloud_comparison",
    "coordinate_system": "facility_local",
    "units": "meters",
    "position": {
        "x": float(center[0]),
        "y": float(center[1]),
        "z": float(center[2])
    },
    "dimensions": {
        "x": float(dimensions[0]),
        "y": float(dimensions[1]),
        "z": float(dimensions[2])
    },
    "point_count": len(changes.points),
    "review_status": "unreviewed"
}

# Export JSON
with open("output/anomalies.json", "w") as f:
    json.dump(anomaly, f, indent=4)

print("Detected obstruction:")
print(json.dumps(anomaly, indent=4))

# Display the bounding box
bbox.color = (1, 0, 0)

baseline = o3d.io.read_point_cloud("data/baseline.ply")
baseline.paint_uniform_color([0.2, 0.6, 1.0])

changes.paint_uniform_color([1, 0, 0])

o3d.visualization.draw_geometries(
    [baseline, changes, bbox],
    window_name="SPOT Obstruction Detection"
)
