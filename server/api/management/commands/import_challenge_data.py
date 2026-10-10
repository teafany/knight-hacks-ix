"""Import source records without modifying files or overwriting existing IDs."""
import csv
import json
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import IntegrityError, models, transaction
from django.utils import timezone

from api.models import Action, Anomaly, Asset, Location, Mission, Reading

DATASETS = [
    ('locations', Location), ('assets', Asset), ('missions', Mission),
    ('actions', Action), ('readings', Reading), ('anomalies', Anomaly),
]


def parse_row(model, row, source_timezone):
    values = {}
    for field in model._meta.fields:
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
    if isinstance(record, Mission) and record.end_time < record.start_time:
        raise ValueError('end_time precedes start_time')
    if isinstance(record, Action):
        if (record.scenario, record.configuration_version) != (
            record.mission.scenario, record.mission.configuration_version
        ):
            raise ValueError('Scenario/configuration does not match the mission')
        if (record.status == 'FAILED') != bool(record.failure_type):
            raise ValueError('failure_type must be present only for failed actions')
    if isinstance(record, (Reading, Anomaly)):
        for name in ['mission_id', 'asset_id', 'location_id']:
            if getattr(record, name) != getattr(record.action, name):
                raise ValueError(f'{name} does not match the referenced action')
    # An action location is intentionally not forced to equal its asset location.


class Command(BaseCommand):
    help = 'Import the six challenge CSVs atomically; unchanged IDs are skipped and conflicts rejected.'
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
                        expected = {field.attname for field in model._meta.fields}
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
                validation_path = data_dir / 'validation_results.json'
                if validation_path.exists():
                    context = str(validation_path)
                    validation = json.loads(validation_path.read_text(encoding='utf-8'))
                    for name, count in counts.items():
                        if validation['counts'].get(name) != count:
                            raise ValueError(f'{name}: imported {count} rows, expected {validation["counts"].get(name)}')
        except (OSError, ValueError, ValidationError, IntegrityError, KeyError, TypeError, csv.Error) as exc:
            raise CommandError(f'{context}: {exc}. Import rolled back.') from exc
        self.stdout.write(f'Naive source timestamps interpreted in {source_timezone}.')
        for summary in summaries:
            self.stdout.write(summary)
        self.stdout.write(self.style.SUCCESS('Import complete. Source files unchanged.'))
