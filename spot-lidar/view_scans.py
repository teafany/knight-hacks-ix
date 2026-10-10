
import open3d as o3d

baseline = o3d.io.read_point_cloud("data/baseline.ply")
updated = o3d.io.read_point_cloud("data/updated.ply")

baseline.paint_uniform_color([0.2, 0.6, 1.0])
updated.paint_uniform_color([1.0, 0.5, 0.2])

print("Opening baseline scan...")
o3d.visualization.draw_geometries([baseline])

print("Opening updated scan...")
o3d.visualization.draw_geometries([updated])
