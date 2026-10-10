
import open3d as o3d
import numpy as np
from pathlib import Path

Path("data").mkdir(exist_ok=True)

# Generate a rectangular room: 5m x 4m x 3m
rng = np.random.default_rng(42)
n = 5000

# Floor
floor = np.column_stack((
    rng.uniform(0, 5, n),
    rng.uniform(0, 4, n),
    np.zeros(n)
))

# Walls
wall1 = np.column_stack((
    rng.uniform(0, 5, n),
    np.zeros(n),
    rng.uniform(0, 3, n)
))

wall2 = np.column_stack((
    np.zeros(n),
    rng.uniform(0, 4, n),
    rng.uniform(0, 3, n)
))

room = np.vstack((floor, wall1, wall2))

# Add a box-shaped obstruction to the updated scan
box = o3d.geometry.TriangleMesh.create_box(
    width=0.8,
    height=0.8,
    depth=1.0
)
box.translate((2.0, 1.5, 0.0))

obstacle = np.asarray(
    box.sample_points_uniformly(3000).points
)

def save_scan(points, filename):
    cloud = o3d.geometry.PointCloud()
    cloud.points = o3d.utility.Vector3dVector(points)
    o3d.io.write_point_cloud(filename, cloud)

save_scan(room, "data/baseline.ply")
save_scan(
    np.vstack((room, obstacle)),
    "data/updated.ply"
)

print("Synthetic LiDAR scans generated!")
