import open3d as o3d
import numpy as np

baseline = o3d.io.read_point_cloud("data/baseline_real.ply")
updated = o3d.io.read_point_cloud("data/updated_real.ply")

if baseline.is_empty() or updated.is_empty():
    raise ValueError("Could not load the real point clouds")

# Downsample for faster registration
baseline_small = baseline.voxel_down_sample(0.05)
updated_small = updated.voxel_down_sample(0.05)

# Align updated scan to baseline
result = o3d.pipelines.registration.registration_icp(
    updated_small,
    baseline_small,
    0.5,
    np.eye(4),
    o3d.pipelines.registration.TransformationEstimationPointToPoint(),
    o3d.pipelines.registration.ICPConvergenceCriteria(max_iteration=100)
)

print("Fitness:", result.fitness)
print("RMSE:", result.inlier_rmse)
print("Transformation:")
print(result.transformation)

# Save the transformation so the frontend can use it too
np.save("data/real_alignment.npy", result.transformation)

updated.transform(result.transformation)

o3d.io.write_point_cloud("data/aligned_updated_real.ply", updated)

baseline.paint_uniform_color([0.2, 0.5, 1.0])
updated.paint_uniform_color([1.0, 0.4, 0.2])

o3d.visualization.draw_geometries(
    [baseline, updated],
    window_name="Real Room Alignment"
)