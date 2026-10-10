
import pandas as pd
import json
from pathlib import Path

Path("output").mkdir(exist_ok=True)

# Load challenge anomaly data
df = pd.read_csv("data/anomalies.csv")

# Load waypoint coordinates
with open("output/waypoints.json", "r") as f:
    waypoints = json.load(f)

priority = {
    "LOW": 1,
    "MEDIUM": 2,
    "HIGH": 3,
    "CRITICAL": 4
}

results = []

for waypoint in waypoints:
    location_id = waypoint["location_id"]

    matches = df[df["location_id"] == location_id]

    highest = (
        max(matches["severity"], key=lambda s: priority[s])
        if not matches.empty else "NONE"
    )

    results.append({
        "location_id": location_id,
        "position": waypoint["position"],
        "highest_severity": highest,
        "anomaly_count": len(matches),
        "anomaly_ids": matches["anomaly_id"].tolist(),
        "source": "synthetic_challenge_history",
        "position_source": "demo_scaled_from_challenge_coordinates"
    })

with open("output/waypoint_anomalies.json", "w") as f:
    json.dump(results, f, indent=4)

print("Successfully exported waypoint anomalies!")
print(f"Total waypoints: {len(results)}")
print(f"Total anomalies: {sum(r['anomaly_count'] for r in results)}")
