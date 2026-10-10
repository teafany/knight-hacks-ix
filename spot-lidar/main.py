import open3d as o3d
import numpy as np

# Load your LiDAR point cloud
pcd = o3d.io.read_point_cloud("data/baseline.ply")

if pcd.is_empty():
    raise ValueError("Point cloud is empty or could not be loaded")

# Print information
points = np.asarray(pcd.points)

print("Total points:", len(points))
print("First 5 points:")
print(points[:5])

# Visualize the point cloud
o3d.visualization.draw_geometries(
    [pcd],
    window_name="SPOT LiDAR Scan"
)