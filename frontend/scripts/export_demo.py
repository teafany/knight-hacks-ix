"""Export a demo snapshot from local Django APIs. Run using the backend venv."""
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

with override_settings(ALLOWED_HOSTS=['testserver']):
    client = Client()
    responses = {
        name: client.get(url)
        for name, url in [
            ('metrics', '/api/metrics'), ('missions', '/api/missions?limit=500'),
            ('findings', '/api/findings?limit=500'),
        ]
    }
    if any(response.status_code != 200 for response in responses.values()):
        raise SystemExit('API export failed; check migrations and dataset import.')
    payloads = {name: response.json() for name, response in responses.items()}
    if payloads['metrics']['total_missions'] == 0:
        raise SystemExit('Import the challenge data before generating a snapshot.')
    for name in ['missions', 'findings']:
        if payloads[name]['next']:
            raise SystemExit(f'{name} exceeds one page; extend this exporter before use.')
    data = {
        'metrics': payloads['metrics'], 'missions': payloads['missions']['results'],
        'findings': payloads['findings']['results'],
    }
    target = ROOT / 'frontend/public/demo/dashboard.json'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(data, indent=2) + '\n')
    print(f'Exported {len(data["missions"])} missions and {len(data["findings"])} findings to {target}')
