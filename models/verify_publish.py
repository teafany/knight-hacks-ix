"""Verify selected final models and report a model-only publishing payload."""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent


def digest(file):
    result = hashlib.sha256()
    with file.open('rb') as stream:
        for block in iter(lambda: stream.read(1024*1024), b''):
            result.update(block)
    return result.hexdigest()


def local_file(relative):
    relative = Path(relative)
    candidate = ROOT/relative
    if relative.is_absolute() or '..' in relative.parts or not candidate.is_file():
        raise ValueError('Unsafe or missing registry path: '+str(relative))
    if candidate.is_symlink() or not candidate.resolve().is_relative_to(ROOT):
        raise ValueError('Registry path escapes model directory')
    return candidate


def verify():
    registry = json.loads((ROOT/'registry.json').read_text())
    errors, models, seen = [], [], set()
    for row in registry['models']:
        try:
            file = local_file(row['path'])
            if row['path'] in seen:
                raise ValueError('Duplicate checkpoint registration')
            seen.add(row['path'])
            if file.stat().st_size != row['size_bytes'] or digest(file) != row['sha256']:
                raise ValueError('Checkpoint size/checksum mismatch')
            if file.stat().st_size > 100*1024*1024:
                raise ValueError('Checkpoint exceeds regular Git limit: configure Git LFS/release assets')
            metadata_file = local_file(row['metadata'])
            metadata = json.loads(metadata_file.read_text())
            if metadata['architecture'] != row['architecture'] or metadata['classes'] != row['classes']:
                raise ValueError('Metadata architecture/class mapping mismatch')
            manifest = file.parent/'manifest.json'
            if manifest.is_file():
                for name, expected in json.loads(manifest.read_text()).items():
                    candidate = local_file((file.parent/Path(name)).relative_to(ROOT))
                    if digest(candidate) != expected:
                        raise ValueError('Export manifest checksum mismatch: '+name)
            relative = str(file.relative_to(ROOT.parent))
            ignored = subprocess.run(['git', 'check-ignore', '-q', '--', relative],
                                     cwd=ROOT.parent, capture_output=True)
            if ignored.returncode == 0:
                raise ValueError('Checkpoint is still ignored by Git')
            if ignored.returncode != 1:
                raise ValueError('Cannot inspect Git ignore policy')
            models.append({'id':row['id'], 'path':relative, 'bytes':row['size_bytes'],
                           'sha256':row['sha256'], 'git_trackable':True})
        except (ValueError, KeyError, OSError, TypeError) as exc:
            errors.append(row.get('id', 'unknown')+': '+str(exc))
    return {'models':models, 'total_checkpoint_bytes':sum(r['bytes'] for r in models),
            'errors':errors, 'committed':False, 'pushed':False}


if __name__ == '__main__':
    result = verify()
    print(json.dumps(result, indent=2))
    raise SystemExit(bool(result['errors']))
