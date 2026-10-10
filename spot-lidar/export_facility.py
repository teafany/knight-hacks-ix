
import open3d as o3d
import numpy as np
import trimesh
from pathlib import Path

Path("output").mkdir(exist_ok=True)

# Load the simulated room point cloud
pcd = o3d.io.read_point_cloud("data/baseline.ply")

if pcd.is_empty():
    raise ValueError("Could not load baseline point cloud")

# Convert each point into a small cube for Three.js
points = np.asarray(pcd.points)

scene = trimesh.Scene()

for point in points[::10]:
    cube = trimesh.creation.box(extents=[0.025, 0.025, 0.025])
    cube.apply_translation(point)
    scene.add_geometry(cube)

scene.export("output/facility.glb")

print("Exported output/facility.glb")
