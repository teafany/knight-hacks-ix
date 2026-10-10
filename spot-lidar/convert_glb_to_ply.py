
import open3d as o3d
import sys
from pathlib import Path

def convert_glb_to_ply(input_file, output_file):
    mesh = o3d.io.read_triangle_mesh(str(input_file))

    if mesh.is_empty() or not mesh.has_triangles():
        raise ValueError("No triangle mesh found in GLB file.")

    print(f"Loaded mesh with {len(mesh.vertices)} vertices")

    # Sample points from the mesh surface
    point_cloud = mesh.sample_points_uniformly(
        number_of_points=100000
    )

    o3d.io.write_point_cloud(str(output_file), point_cloud)

    print(f"Saved {len(point_cloud.points)} points to {output_file}")

if __name__ == "__main__":
    input_file = Path(sys.argv[1])
    output_file = Path(sys.argv[2])
    convert_glb_to_ply(input_file, output_file)
