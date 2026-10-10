
import open3d as o3d
import numpy as np

# Load both point clouds
baseline = o3d.io.read_point_cloud("data/baseline.ply")
updated = o3d.io.read_point_cloud("data/updated.ply")

# Calculate distance from each updated point
# to its nearest baseline point
distances = np.asarray(
    updated.compute_point_cloud_distance(baseline)
)

# Identify points more than 15 cm from baseline
threshold = 0.15
changed_indices = np.where(distances > threshold)[0]

# Extract changed points
changes = updated.select_by_index(
    changed_indices.tolist()
)

# Color unchanged points blue
updated.paint_uniform_color([0.2, 0.6, 1.0])

# Color changed points red
changes.paint_uniform_color([1.0, 0.0, 0.0])

print("Total updated points:", len(updated.points))
print("Changed points:", len(changes.points))

# Save detected changes
o3d.io.write_point_cloud(
    "data/changes.ply", changes
)

# Show baseline with changes highlighted
baseline.paint_uniform_color([0.2, 0.6, 1.0])

o3d.visualization.draw_geometries(
    [baseline, changes],
    window_name="SPOT - Change Detection"
)
