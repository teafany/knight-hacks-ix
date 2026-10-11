"""Import source records without modifying files or overwriting existing IDs."""
import csv
import json
import hashlib
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import IntegrityError, models, transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from api.models import Action, Anomaly, Asset, ImportReport, Location, Mission, Reading, Replay, ReplayEvent
from api.services.records import validate_record

DATASETS = [
    ('locations', Location), ('assets', Asset), ('missions', Mission),
    ('actions', Action), ('readings', Reading), ('anomalies', Anomaly),
]


def parse_row(model, row, source_timezone):
    values = {}
    for field in model._meta.fields:
        if field.attname not in row:
            continue
        raw = row[field.attname]
        if raw is None:
            raise ValueError(f'Missing value for {field.attname}')
        if isinstance(field, models.BooleanField):
            if raw.lower() not in {'true', 'false'}:
                raise ValueError(f'{field.attname} must be True or False')
            value = raw.lower() == 'true'
        elif isinstance(field, models.ForeignKey):
            value = raw
        else:
            value = field.to_python(raw)
        if isinstance(field, models.DateTimeField) and timezone.is_naive(value):
            # Source files have no offset; never use the execution host timezone.
            value = timezone.make_aware(value, source_timezone)
        values[field.attname] = value
    return values


def validate_relationships(record):
    if not record.synthetic:
        raise ValueError('This importer only accepts synthetic challenge records')
    validate_record(record)
    # An action location is intentionally not forced to equal its asset location.


def source_datetime(value, source_timezone):
    timestamp = parse_datetime(value)
    if timestamp is None:
        raise ValueError('Invalid source timestamp')
    return timezone.make_aware(timestamp, source_timezone) if timezone.is_naive(timestamp) else timestamp


def import_replay(data_dir, source_timezone):
    path = data_dir / 'replay.ndjson'
    raw = path.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    replay, _ = Replay.objects.get_or_create(source_sha256=digest, defaults={
        'name': 'Challenge replay', 'description': 'Imported synthetic challenge events in source order.',
    })
    created = unchanged = 0
    seen = set()
    for sequence, line in enumerate(raw.decode('utf-8-sig').splitlines(), start=1):
        if not line.strip():
            raise ValueError(f'{path.name}: line {sequence}: empty replay event')
        try:
            event = json.loads(line)
            if set(event) != {'event_id', 'mission_id', 'timestamp', 'event_type', 'details'} or not isinstance(event['details'], dict):
                raise ValueError('Expected event_id, mission_id, timestamp, event_type and object details')
            if event['event_id'] in seen:
                raise ValueError('Duplicate source event ID')
            seen.add(event['event_id'])
            values = {
                'replay_id': replay.pk, 'event_id': event['event_id'], 'sequence': sequence,
                'mission_id': event['mission_id'], 'action_id': event['details'].get('action_id'),
                'timestamp': source_datetime(event['timestamp'], source_timezone),
                'event_type': event['event_type'], 'details': event['details'],
            }
            json.dumps(event['details'], allow_nan=False)
            record = ReplayEvent(**values)
            existing = ReplayEvent.objects.filter(replay=replay, event_id=event['event_id']).first()
            if existing:
                conflicts = [key for key, value in values.items() if getattr(existing, key) != value]
                if conflicts:
                    raise ValueError(f'Existing event has conflicting fields: {conflicts}')
                unchanged += 1
                continue
            record.full_clean()
            validate_record(record)
            record.save(force_insert=True)
            created += 1
        except (ValueError, ValidationError, KeyError, TypeError) as exc:
            raise ValueError(f'{path.name}: line {sequence}: {exc}') from exc
    return len(seen), f'replay_events: {created} created, {unchanged} unchanged'


class Command(BaseCommand):
    help = 'Import all challenge CSVs, replay events and validation report atomically; conflicts are rejected.'
    requires_migrations_checks = True

    def add_arguments(self, parser):
        parser.add_argument('--data-dir', type=Path, default=(
            settings.BASE_DIR.parent / 'SPOT_KnightHacks_Challenge_Kit Part One' / '02_DATA'
        ))
        parser.add_argument('--source-timezone', default='UTC', help='IANA timezone for timestamps without an offset (default: UTC assumption).')

    def handle(self, *args, **options):
        try:
            source_timezone = ZoneInfo(options['source_timezone'])
        except ZoneInfoNotFoundError as exc:
            raise CommandError('Unknown --source-timezone') from exc
        data_dir = options['data_dir']
        summaries = []
        counts = {}
        context = str(data_dir)
        try:
            with transaction.atomic():
                for name, model in DATASETS:
                    path = data_dir / f'{name}.csv'
                    context = str(path)
                    created = unchanged = 0
                    seen = set()
                    with path.open(encoding='utf-8-sig', newline='') as source:
                        reader = csv.DictReader(source)
                        expected = {field.attname for field in model._meta.fields if field.name != 'ml_detection'}
                        if (len(reader.fieldnames or []) != len(expected)
                                or set(reader.fieldnames or []) != expected):
                            raise ValueError(f'Expected columns: {sorted(expected)}')
                        for row in reader:
                            context = f'{path.name}: row {reader.line_num}'
                            if None in row:
                                raise ValueError('Extra CSV values')
                            values = parse_row(model, row, source_timezone)
                            pk = values[model._meta.pk.attname]
                            if pk in seen:
                                raise ValueError(f'Duplicate source ID: {pk}')
                            seen.add(pk)
                            record = model(**values)
                            existing = model.objects.filter(pk=pk).first()
                            if existing:
                                conflicts = [key for key, value in values.items() if getattr(existing, key) != value]
                                if conflicts:
                                    raise ValueError(f'Existing ID {pk} has conflicting fields: {conflicts}; no records overwritten')
                                unchanged += 1
                                continue
                            record.full_clean()
                            validate_relationships(record)
                            record.save(force_insert=True)
                            created += 1
                    counts[name] = len(seen)
                    summaries.append(f'{name}: {created} created, {unchanged} unchanged')
                context = str(data_dir / 'replay.ndjson')
                counts['replay_events'], replay_summary = import_replay(data_dir, source_timezone)
                summaries.append(replay_summary)
                validation_path = data_dir / 'validation_results.json'
                if validation_path.exists():
                    context = str(validation_path)
                    validation = json.loads(validation_path.read_text(encoding='utf-8'))
                    for name, count in counts.items():
                        if validation['counts'].get(name) != count:
                            raise ValueError(f'{name}: imported {count} rows, expected {validation["counts"].get(name)}')
                    json.dumps(validation, allow_nan=False)
                    digest = hashlib.sha256(validation_path.read_bytes()).hexdigest()
                    values = {
                        'source_name': validation_path.name, 'validation_status': validation['validation_status'],
                        'generated_at': source_datetime(validation['generated_at'], source_timezone), 'report': validation,
                    }
                    existing = ImportReport.objects.filter(source_sha256=digest).first()
                    if existing and any(getattr(existing, key) != value for key, value in values.items()):
                        raise ValueError('Existing validation report has conflicting fields')
                    if not existing:
                        record = ImportReport(source_sha256=digest, **values)
                        record.full_clean()
                        record.save(force_insert=True)
                    summaries.append(f'import_reports: {0 if existing else 1} created, {1 if existing else 0} unchanged')
        except (OSError, ValueError, ValidationError, IntegrityError, KeyError, TypeError, csv.Error) as exc:
            raise CommandError(f'{context}: {exc}. Import rolled back.') from exc
        self.stdout.write(f'Naive source timestamps interpreted in {source_timezone}.')
        for summary in summaries:
            self.stdout.write(summary)
        self.stdout.write(self.style.SUCCESS('Import complete. Source files unchanged.'))
