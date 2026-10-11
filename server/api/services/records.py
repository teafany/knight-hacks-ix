from django.core.exceptions import ValidationError
from django.db.models import Q

from api.models import Action, Anomaly, LidarScan, MLAnomalyDetection, Mission, Reading, Replay, ReplayEvent


def validate_record(record, previous=None):
    """Preserve inspection relationships across imports, creates and partial updates."""
    errors = {}
    if isinstance(record, Mission):
        if record.end_time < record.start_time:
            errors['end_time'] = 'end_time precedes start_time'
        if previous and previous.actions.exclude(scenario=record.scenario, configuration_version=record.configuration_version).exists():
            errors['configuration_version'] = 'Existing actions must match the mission scenario/configuration.'
    if isinstance(record, Action):
        if (record.scenario, record.configuration_version) != (record.mission.scenario, record.mission.configuration_version):
            errors['mission'] = 'Scenario/configuration does not match the mission'
        if (record.status == 'FAILED') != bool(record.failure_type):
            errors['failure_type'] = 'failure_type must be present only for failed actions'
        if previous and any(getattr(previous, name) != getattr(record, name) for name in ('mission_id', 'asset_id', 'location_id')):
            if any(getattr(previous, name).exists() for name in ('readings', 'anomalies', 'replay_events', 'lidar_scans', 'ml_detections')):
                errors['action_id'] = 'Cannot change action context while dependent records exist.'
    if isinstance(record, (Reading, Anomaly)):
        for name in ('mission_id', 'asset_id', 'location_id'):
            if getattr(record, name) != getattr(record.action, name):
                errors[name.removesuffix('_id')] = f'{name} does not match the referenced action'
    if isinstance(record, (LidarScan, MLAnomalyDetection, ReplayEvent)) and record.action_id:
        for name in ('mission_id', 'asset_id', 'location_id'):
            if hasattr(record, name) and getattr(record, name) is not None and getattr(record, name) != getattr(record.action, name):
                errors[name.removesuffix('_id')] = f'{name} does not match the referenced action'
    if isinstance(record, MLAnomalyDetection) and record.lidar_scan_id:
        scan = record.lidar_scan
        for name in ('mission_id', 'action_id'):
            if getattr(record, name) and getattr(scan, name) and getattr(record, name) != getattr(scan, name):
                errors['lidar_scan'] = 'Detection context does not match the scan.'
    if isinstance(record, Anomaly) and record.ml_detection_id:
        detection = record.ml_detection
        for name in ('asset_id', 'mission_id', 'action_id'):
            if getattr(detection, name) and getattr(detection, name) != getattr(record, name):
                errors['ml_detection'] = 'Finding context does not match the ML detection.'
    if isinstance(record, ReplayEvent):
        if record.replay.mission_id and record.mission_id != record.replay.mission_id:
            errors['mission'] = 'Event must belong to the replay mission.'
        if isinstance(record.details, dict):
            expected = {'action_id': record.action_id}
            if record.action_id:
                expected.update(asset_id=record.action.asset_id, location_id=record.action.location_id)
            for key, value in expected.items():
                if key in record.details and record.details[key] != value:
                    errors['details'] = f'{key} in details does not match the event context.'
    if isinstance(record, Replay) and previous and record.mission_id:
        if previous.events.exclude(mission_id=record.mission_id).exists():
            errors['mission'] = 'Existing replay events belong to other missions.'
    if isinstance(record, LidarScan) and previous:
        for name in ('mission_id', 'action_id'):
            value = getattr(record, name)
            if value and previous.ml_detections.filter(~Q(**{name: value}), **{f'{name}__isnull': False}).exists():
                errors[name.removesuffix('_id')] = 'Existing ML detections have different scan context.'
    if isinstance(record, MLAnomalyDetection) and previous:
        expected = {'asset_id': record.asset_id}
        if record.mission_id:
            expected['mission_id'] = record.mission_id
        if record.action_id:
            expected['action_id'] = record.action_id
        if previous.anomalies.exclude(**expected).exists():
            errors['asset'] = 'Existing findings have different detection context.'
    if errors:
        raise ValidationError(errors)
