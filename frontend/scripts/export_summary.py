"""Export a summary snapshot, including saved simulated AI results, from Django APIs."""
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'server'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

import django
django.setup()

from django.test import Client, override_settings


def get(client, path):
    response = client.get(f'/api/{path}')
    if response.status_code != 200:
        raise SystemExit(f'Export failed for {path}: HTTP {response.status_code}. Check migrations and data import.')
    return response.json()


def all_records(client, path):
    records = []
    while True:
        page = get(client, f'{path}?limit=100&offset={len(records)}')
        records.extend(page['results'])
        if not page['next']:
            return records
        if not page['results']:
            raise SystemExit(f'Pagination stopped making progress for {path}.')


with override_settings(ALLOWED_HOSTS=['testserver']):
    client = Client()
    data = {'metrics': get(client, 'metrics'), 'model_summary': get(client, 'records/ml-detections/summary')}
    if not data['metrics']['total_missions']:
        raise SystemExit('Import the challenge data before exporting the summary.')
    for name, path in {
        'missions': 'missions', 'findings': 'findings', 'assets': 'records/assets',
        'locations': 'records/locations', 'readings': 'records/readings', 'detections': 'records/ml-detections',
    }.items():
        data[name] = all_records(client, path)
    if not any(row['frame_id'].startswith('SIMULATED-') for row in data['detections']):
        raise SystemExit('Run seed_simulated_inference before exporting the summary demo.')
    data['record_counts'] = {
        key: get(client, f'records/{path}?limit=1')['count']
        for key, path in [('replays', 'replays'), ('replay_events', 'replay-events'),
                          ('import_reports', 'import-reports'), ('lidar_scans', 'lidar-scans')]
    }
    target = ROOT / 'frontend/public/demo/summary.json'
    target.write_text(json.dumps(data, indent=2) + '\n')
    print(f'Exported summary: {len(data["missions"])} missions, {len(data["findings"])} findings, '
          f'{len(data["detections"])} AI results.')
