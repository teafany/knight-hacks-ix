import open3d as o3d
import numpy as np

baseline = o3d.io.read_point_cloud("data/baseline_real.ply")
updated = o3d.io.read_point_cloud("data/aligned_updated_real.ply")

if baseline.is_empty() or updated.is_empty():
    raise ValueError("Could not load real point clouds")

distances = np.asarray(
    updated.compute_point_cloud_distance(baseline)
)

threshold = 0.15
changed_indices = np.where(distances > threshold)[0]

changes = updated.select_by_index(changed_indices)

o3d.io.write_point_cloud("data/aligned_changes_real.ply", changes)

print("Change detection complete!")
print("Total updated points:", len(updated.points))
print("Changed points:", len(changes.points))

baseline.paint_uniform_color([0.2, 0.5, 1.0])
changes.paint_uniform_color([1.0, 0.1, 0.1])

o3d.visualization.draw_geometries(
    [baseline, changes],
    window_name="Real Room Changes"
)