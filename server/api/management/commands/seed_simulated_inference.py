"""Create deterministic, explicitly simulated examples without loading model weights."""
from datetime import datetime, timedelta, timezone
import hashlib
from uuid import NAMESPACE_URL, uuid5

from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import IntegrityError, transaction
from rest_framework.exceptions import ValidationError as SerializerValidationError

from api.models import Action, Anomaly, Asset, Location, MLAnomalyDetection, Mission
from api.record_serializers import MLAnomalyDetectionSerializer
from api.services.inference import InferenceUnavailable, list_models
from api.services.records import validate_record


START = datetime(2026, 9, 10, 12, tzinfo=timezone.utc)
MISSION_ID = 'SIM-AI-M001'
SAMPLES = [
    {
        'key': 'gauge-detected', 'kind': 'gauge', 'asset': 'GAUGE-209',
        'status': 'DETECTED', 'label': None,
        'reason': 'Detection only. Whole-pointer boxes do not provide a calibrated numeric reading.',
        'detections': [
            {'label': 'Gauge', 'score': .97, 'box_xyxy': [120, 80, 520, 440]},
            {'label': 'Center', 'score': .94, 'box_xyxy': [302, 242, 326, 266]},
            {'label': 'Needle', 'score': .91, 'box_xyxy': [310, 140, 420, 260]},
        ],
    },
    {
        'key': 'gauge-no-detections', 'kind': 'gauge', 'asset': 'GAUGE-209',
        'status': 'NO_DETECTIONS', 'label': None,
        'reason': 'Detection only. Whole-pointer boxes do not provide a calibrated numeric reading.',
        'finding': 'No gauge parts detected in the sample frame; review framing before another capture.',
    },
    {
        'key': 'corrosion-suspected', 'kind': 'corrosion', 'asset': 'SIM-AI-YOKE',
        'status': 'CORROSION_SUSPECTED', 'label': 'corrosion',
        'scores': {'normal': .08, 'corrosion': .92},
        'finding': 'Corrosion pattern suspected in a manually cropped yoke-suspension sample.',
    },
    {
        'key': 'corrosion-normal', 'kind': 'corrosion', 'asset': 'SIM-AI-YOKE',
        'status': 'NO_CORROSION_DETECTED', 'label': 'normal',
        'scores': {'normal': .95, 'corrosion': .05},
    },
    {
        'key': 'corrosion-ambiguous', 'kind': 'corrosion', 'asset': 'SIM-AI-YOKE',
        'status': 'REVIEW_REQUIRED', 'label': None,
        'scores': {'normal': .48, 'corrosion': .52},
        'reason': 'Low or ambiguous classification score.',
        'finding': 'Ambiguous corrosion scores; inspect the crop before assigning a condition.',
    },
    {
        'key': 'thermal-fault', 'kind': 'thermal', 'asset': 'MOTOR-206',
        'status': 'FAULT_PATTERN_SUSPECTED', 'label': 'cooling_fan_failure',
        'top_score': .88,
        'finding': 'Cooling fan failure pattern suspected in a compatible single-motor thermogram.',
    },
    {
        'key': 'thermal-healthy', 'kind': 'thermal', 'asset': 'MOTOR-206',
        'status': 'HEALTHY_REFERENCE_PATTERN', 'label': 'healthy_no_load',
        'top_score': .91,
    },
    {
        'key': 'acoustic-review', 'kind': 'acoustic', 'asset': 'PUMP-205',
        'status': 'REVIEW_REQUIRED', 'label': None,
        'scores': {'normal': .19, 'anomalous': .81},
        'reason': 'Experimental acoustic model has poor held-out-machine performance; scores require review.',
        'finding': 'Experimental pump audio scores favor anomalous; no automatic fault label is assigned.',
    },
    {
        'key': 'acoustic-unreadable', 'kind': 'acoustic', 'asset': 'PUMP-205',
        'status': 'UNREADABLE', 'label': None,
        'reason': 'Silent or near-silent audio.',
        'finding': 'Silent pump audio sample; capture a usable recording before interpreting a condition.',
    },
]


def sample_result(sample, model, sequence):
    captured = START + timedelta(minutes=sequence - 1)
    scores = sample.get('scores', {})
    if 'top_score' in sample:
        others = (1 - sample['top_score']) / (len(model['classes']) - 1)
        scores = {label: sample['top_score'] if label == sample['label'] else others
                  for label in model['classes']}
    return {
        'schema_version': 1, 'model_id': model['id'], 'model_sha256': model['sha256'],
        # This digest identifies a fabricated sample, not a real image/audio capture.
        'source_sha256': hashlib.sha256(f'simulated-inference-v1:{sample["key"]}'.encode()).hexdigest(),
        'asset_id': sample['asset'], 'frame_id': f'SIMULATED-{sample["key"]}',
        'captured_at': captured.isoformat(), 'processed_at': (captured + timedelta(seconds=1)).isoformat(),
        'inference_ms': 35.0 + sequence * 7,
        'status': sample['status'], 'label': sample['label'], 'reason': sample.get('reason'),
        'scores': scores, 'scores_are_calibrated': False,
        'detections': sample.get('detections', []),
        'image_size': None if sample['kind'] == 'acoustic' else [640, 480], 'roi': None,
        'requires_review': True, 'quality_status': model['quality_status'],
        'value': None, 'unit': None, 'temperature_c': None, 'hazard_severity': None,
    }


def create_once(model, pk, values, preserve=()):
    existing = model.objects.filter(pk=pk).first()
    if existing:
        conflicts = [name for name, value in values.items()
                     if name not in preserve and getattr(existing, name) != value]
        if conflicts:
            raise CommandError(f'{model.__name__} {pk} conflicts with the demo: {conflicts}. No records overwritten.')
        return existing, False
    record = model(pk=pk, **values)
    record.full_clean()
    validate_record(record)
    record.save(force_insert=True)
    return record, True


class Command(BaseCommand):
    help = 'Seed nine simulated inference results and six dashboard review findings; reruns preserve reviews.'
    requires_migrations_checks = True

    def handle(self, *args, **options):
        counts = {name: 0 for name in ('assets', 'missions', 'actions', 'detections', 'findings')}
        try:
            catalogue = {model['endpoint'].rsplit('/', 1)[-1]: model for model in list_models()}
            missing = {sample['kind'] for sample in SAMPLES} - catalogue.keys()
            if missing:
                raise CommandError(f'Missing registered models: {sorted(missing)}.')
            with transaction.atomic():
                assets = {asset.pk: asset for asset in Asset.objects.filter(
                    pk__in=['GAUGE-209', 'MOTOR-206', 'PUMP-205'], synthetic=True,
                )}
                location = Location.objects.filter(pk='WP05', synthetic=True).first()
                if len(assets) != 3 or location is None:
                    raise CommandError('Import the synthetic challenge data first: manage.py import_challenge_data.')
                assets['SIM-AI-YOKE'], created = create_once(Asset, 'SIM-AI-YOKE', {
                    'asset_name': 'Simulated yoke-suspension sample', 'asset_type': 'Yoke suspension',
                    'location': location, 'criticality': 'LOW', 'synthetic': True,
                })
                counts['assets'] += created
                mission, created = create_once(Mission, MISSION_ID, {
                    'mission_name': '[SIMULATED] AI inference examples', 'scenario': 'IMPROVED',
                    'configuration_version': 'V2', 'start_time': START,
                    'end_time': START + timedelta(minutes=9), 'duration_min': 9,
                    'start_battery_pct': 100, 'end_battery_pct': 91,
                    'mission_status': 'COMPLETED', 'operator_mode': 'SIMULATED', 'synthetic': True,
                })
                counts['missions'] += created
                for sequence, sample in enumerate(SAMPLES, start=1):
                    asset = assets[sample['asset']]
                    action, created = create_once(Action, f'SIM-AI-A{sequence:03}', {
                        'mission': mission, 'asset': asset, 'location': asset.location,
                        'sequence': sequence, 'timestamp': START + timedelta(minutes=sequence - 1),
                        'action_type': 'ACOUSTIC_INSPECTION' if sample['kind'] == 'acoustic' else (
                            'THERMAL_INSPECTION' if sample['kind'] == 'thermal' else 'VISUAL_INSPECTION'),
                        'battery_pct': 100 - sequence, 'status': 'SUCCESS', 'failure_type': '',
                        'duration_sec': 10, 'scenario': mission.scenario,
                        'configuration_version': mission.configuration_version, 'synthetic': True,
                    })
                    counts['actions'] += created
                    serializer = MLAnomalyDetectionSerializer(data={
                        'asset_id': asset.pk, 'mission_id': mission.pk, 'action_id': action.pk,
                        'modality': catalogue[sample['kind']]['modality'],
                        'result': sample_result(sample, catalogue[sample['kind']], sequence),
                        'review_status': 'pending',
                        'notes': '[SIMULATED] Fabricated demo response; no model was executed and no source capture exists.',
                    })
                    serializer.is_valid(raise_exception=True)
                    detection, created = create_once(
                        MLAnomalyDetection,
                        uuid5(NAMESPACE_URL, f'knight-hacks-ix/simulated-inference/v1/{sample["key"]}'),
                        serializer.validated_data, preserve=('review_status', 'notes'),
                    )
                    counts['detections'] += created
                    if 'finding' in sample:
                        _, created = create_once(Anomaly, f'SIM-AI-AN{sequence:03}', {
                            'action': action, 'mission': mission, 'asset': asset, 'location': action.location,
                            'timestamp': detection.processed_at, 'anomaly_type': f'AI_{sample["kind"].upper()}',
                            'severity': 'LOW', 'operator_review_required': True, 'synthetic': True,
                            'description': f'[SIMULATED] {sample["finding"]} '
                                           'LOW is a demo review priority; the model does not assign hazard severity.',
                            'ml_detection': detection,
                        }, preserve=('severity', 'operator_review_required', 'description'))
                        counts['findings'] += created
        except (InferenceUnavailable, ValidationError, SerializerValidationError, IntegrityError) as exc:
            raise CommandError(f'Simulated inference seed rolled back: {exc}') from exc
        self.stdout.write(self.style.SUCCESS('Simulated inference examples ready. No model execution was performed.'))
        for name, count in counts.items():
            self.stdout.write(f'{name}: {count} created')
        self.stdout.write(f'Dashboard mission: {MISSION_ID}; saved results: /api/records/ml-detections?mission_id={MISSION_ID}')
