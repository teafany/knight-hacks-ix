"""Calculate demo waypoint proximity to synthetic LiDAR change bounding boxes.

Run from spot-lidar:
    python check_waypoint_proximity.py

Inputs:
    output/waypoints.json
    output/clustered_changes.json
Output:
    output/waypoint_proximity.json

Note: Demo-scaled waypoint coordinates are not registered robot localization.
"""

import json
import math
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR / "output"
NEAR_THRESHOLD_M = 0.5
CAUTION_THRESHOLD_M = 1.0


def load_json(path: Path):
    if not path.exists():
        raise FileNotFoundError(f"Missing {path}. Generate this export first.")
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def distance_to_box(point: dict, center: dict, dimensions: dict) -> float:
    """Euclidean distance from a point to an axis-aligned 3D bounding box."""
    outside = []
    for axis in ("x", "y", "z"):
        half_extent = max(0.0, float(dimensions[axis])) / 2.0
        gap = max(abs(float(point[axis]) - float(center[axis])) - half_extent, 0.0)
        outside.append(gap)
    return math.sqrt(sum(gap * gap for gap in outside))


def classify(distance: float) -> str:
    if distance <= NEAR_THRESHOLD_M:
        return "NEAR_OBSTRUCTION"
    if distance <= CAUTION_THRESHOLD_M:
        return "CAUTION"
    return "CLEAR"


def main() -> None:
    waypoints = load_json(OUTPUT_DIR / "waypoints.json")
    changes = load_json(OUTPUT_DIR / "clustered_changes.json")

    if not isinstance(waypoints, list) or not isinstance(changes, list):
        raise ValueError("Both input JSON files must contain arrays.")

    results = []
    for waypoint in waypoints:
        waypoint_id = waypoint["location_id"]
        position = waypoint["position"]

        if changes:
            closest = min(
                changes,
                key=lambda change: distance_to_box(
                    position, change["position"], change["dimensions"]
                ),
            )
            distance = distance_to_box(
                position, closest["position"], closest["dimensions"]
            )
            nearest_id = closest["id"]
            status = classify(distance)
        else:
            distance = None
            nearest_id = None
            status = "NO_DETECTED_CHANGES"

        results.append(
            {
                "waypoint_id": waypoint_id,
                "nearest_obstruction": nearest_id,
                "distance_m": round(distance, 3) if distance is not None else None,
                "status": status,
            }
        )

    output_path = OUTPUT_DIR / "waypoint_proximity.json"
    with output_path.open("w", encoding="utf-8") as file:
        json.dump(results, file, indent=2)

    print(f"Saved {len(results)} waypoint proximity records to {output_path}")
    for row in results:
        distance_text = (
            f'{row["distance_m"]:.3f} m' if row["distance_m"] is not None else "N/A"
        )
        print(f'{row["waypoint_id"]}: {distance_text} - {row["status"]}')


if __name__ == "__main__":
    main()
