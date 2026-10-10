
import open3d as o3d
import numpy as np

# Load the baseline and ICP-aligned updated scan
baseline = o3d.io.read_point_cloud("data/baseline.ply")
updated = o3d.io.read_point_cloud("data/aligned_updated.ply")

if baseline.is_empty() or updated.is_empty():
    raise ValueError("One or both point clouds could not be loaded")

# Calculate distance from each updated point to baseline
distances = np.asarray(
    updated.compute_point_cloud_distance(baseline)
)

# Points farther than 15 cm are considered changes
threshold = 0.15
changed_indices = np.where(distances > threshold)[0]

changes = updated.select_by_index(changed_indices)

# Save results
o3d.io.write_point_cloud("data/aligned_changes.ply", changes)

print("Change detection complete!")
print("Total updated points:", len(updated.points))
print("Changed points:", len(changes.points))

# Visualize baseline and changes
baseline.paint_uniform_color([0.2, 0.5, 1.0])
changes.paint_uniform_color([1.0, 0.1, 0.1])

o3d.visualization.draw_geometries(
    [baseline, changes],
    window_name="Changes After ICP Alignment"
)
