
import open3d as o3d
import numpy as np
import json
from pathlib import Path

Path("output").mkdir(exist_ok=True)

# Load changes detected after ICP
changes = o3d.io.read_point_cloud("data/aligned_changes.ply")

if changes.is_empty():
    raise ValueError("No changed points found.")

# Group nearby changed points
labels = np.array(
    changes.cluster_dbscan(
        eps=0.18,
        min_points=20,
        print_progress=True
    )
)

cluster_ids = sorted(set(labels) - {-1})

print("Clusters detected:", len(cluster_ids))
print("Noise points:", np.sum(labels == -1))

findings = []
geometries = []

for i, cluster_id in enumerate(cluster_ids):
    indices = np.where(labels == cluster_id)[0]
    cluster = changes.select_by_index(indices.tolist())

    bbox = cluster.get_axis_aligned_bounding_box()
    bbox.color = (1, 0, 0)

    center = bbox.get_center()
    extent = bbox.get_extent()

    findings.append({
        "id": f"change_{i + 1:03d}",
        "type": "geometric_change",
        "position": {
            "x": float(center[0]),
            "y": float(center[1]),
            "z": float(center[2])
        },
        "dimensions": {
            "x": float(extent[0]),
            "y": float(extent[1]),
            "z": float(extent[2])
        },
        "point_count": int(len(indices)),
        "source": "synthetic_icp_point_cloud_comparison",
        "review_status": "unreviewed"
    })

    cluster.paint_uniform_color([1, 0, 0])
    geometries.extend([cluster, bbox])

with open("output/clustered_changes.json", "w") as f:
    json.dump(findings, f, indent=4)

print("Exported output/clustered_changes.json")

baseline = o3d.io.read_point_cloud("data/baseline.ply")
baseline.paint_uniform_color([0.2, 0.5, 1.0])

o3d.visualization.draw_geometries(
    [baseline] + geometries,
    window_name="Clustered Changes After ICP"
)
