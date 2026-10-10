
import open3d as o3d
import numpy as np

# Load existing synthetic scans
baseline = o3d.io.read_point_cloud("data/baseline.ply")
updated = o3d.io.read_point_cloud("data/updated.ply")

# Simulate a scan captured from a different position
angle = np.radians(5)

rotation = baseline.get_rotation_matrix_from_xyz(
    (0, 0, angle)
)

transform = np.eye(4)
transform[:3, :3] = rotation
transform[:3, 3] = [0.15, -0.10, 0.0]

updated.transform(transform)

# ICP registration
threshold = 0.4

result = o3d.pipelines.registration.registration_icp(
    updated,
    baseline,
    threshold,
    np.eye(4),
    o3d.pipelines.registration.TransformationEstimationPointToPoint()
)

# Apply calculated alignment
updated.transform(result.transformation)

# Save aligned scan
o3d.io.write_point_cloud(
    "data/aligned_updated.ply",
    updated
)

print("ICP alignment complete!")
print("Fitness:", result.fitness)
print("RMSE:", result.inlier_rmse)
print("Transformation:")
print(result.transformation)

# Visualize results
baseline.paint_uniform_color([0.2, 0.5, 1.0])
updated.paint_uniform_color([1.0, 0.4, 0.2])

o3d.visualization.draw_geometries(
    [baseline, updated],
    window_name="ICP Aligned Scans"
)
