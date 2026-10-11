
import open3d as o3d
import numpy as np
import json
from pathlib import Path

# Create output folder
Path("output").mkdir(exist_ok=True)

# Load changes detected from the real Polycam scans
changes = o3d.io.read_point_cloud("data/aligned_changes_real.ply")

if changes.is_empty():
    raise ValueError("No changed points found.")

# Load ICP alignment transformation
transform = np.load("data/real_alignment.npy")

# Convert changed points back to original updated GLB coordinates
inverse_transform = np.linalg.inv(transform)
changes.transform(inverse_transform)

# Group nearby changed points into clusters
labels = np.array(
    changes.cluster_dbscan(
        eps=0.18,
        min_points=20,
        print_progress=True
    )
)

cluster_ids = sorted(set(labels) - {-1})

print("Total clusters detected:", len(cluster_ids))
print("Noise points:", np.sum(labels == -1))

findings = []
geometries = []

for i, cluster_id in enumerate(cluster_ids):

    indices = np.where(labels == cluster_id)[0]
    cluster = changes.select_by_index(indices.tolist())

    bbox = cluster.get_axis_aligned_bounding_box()
    center = bbox.get_center()
    extent = bbox.get_extent()

    # FILTER 1: Remove clusters with too few points
    if len(indices) < 150:
        continue

    # FILTER 2: Remove extremely large clusters
    # These may represent walls, floors, or scan artifacts
    if np.any(extent > 2.0):
        continue

    # FILTER 3: Remove very small bounding boxes
    if np.any(extent < 0.15):
        continue

    # Keep this cluster
    bbox.color = (1, 0, 0)

    findings.append({
        "id": f"real_change_{i + 1:03d}",
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
        "source": "real_polycam_scan_comparison",
        "review_status": "unreviewed"
    })

    cluster.paint_uniform_color([1, 0, 0])
    geometries.extend([cluster, bbox])

# Save filtered clusters
output_path = "output/real_candidates.json"

with open(output_path, "w") as f:
    json.dump(findings, f, indent=4)

print("\nClustering complete!")
print("Total clusters detected:", len(cluster_ids))
print("Clusters kept after filtering:", len(findings))
print("Exported:", output_path)

# Visualize updated scan and filtered boxes
updated = o3d.io.read_point_cloud("data/updated_real.ply")

if not updated.is_empty():
    updated.paint_uniform_color([0.2, 0.5, 1.0])

    o3d.visualization.draw_geometries(
        [updated] + geometries,
        window_name="Filtered Real Changes"
    )
