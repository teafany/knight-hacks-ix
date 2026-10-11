from django.db import models
from django.core.validators import MaxValueValidator
from django.core.validators import MinValueValidator, RegexValidator
import uuid


SCENARIOS = [('BASELINE', 'Baseline'), ('IMPROVED', 'Improved')]
VERSIONS = [('V1', 'V1'), ('V2', 'V2')]
SEVERITIES = [(value, value.title()) for value in ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']]


class Location(models.Model):
    location_id = models.CharField(primary_key=True, max_length=32)
    location_name = models.CharField(max_length=200)
    zone_type = models.CharField(max_length=64)
    floor = models.IntegerField()
    x_coord = models.DecimalField(max_digits=12, decimal_places=4)
    y_coord = models.DecimalField(max_digits=12, decimal_places=4)
    environment = models.CharField(max_length=64)
    synthetic = models.BooleanField()


class Asset(models.Model):
    asset_id = models.CharField(primary_key=True, max_length=32)
    asset_name = models.CharField(max_length=200)
    asset_type = models.CharField(max_length=64)
    location = models.ForeignKey(Location, on_delete=models.PROTECT, related_name='assets')
    criticality = models.CharField(max_length=16, choices=SEVERITIES)
    synthetic = models.BooleanField()


class Mission(models.Model):
    mission_id = models.CharField(primary_key=True, max_length=32)
    mission_name = models.CharField(max_length=200)
    scenario = models.CharField(max_length=16, choices=SCENARIOS)
    configuration_version = models.CharField(max_length=16, choices=VERSIONS)
    start_time = models.DateTimeField(db_index=True)
    end_time = models.DateTimeField()
    duration_min = models.PositiveIntegerField()
    start_battery_pct = models.PositiveSmallIntegerField(validators=[MaxValueValidator(100)])
    end_battery_pct = models.PositiveSmallIntegerField(validators=[MaxValueValidator(100)])
    mission_status = models.CharField(max_length=16, choices=[('COMPLETED', 'Completed'), ('FAILED', 'Failed')])
    operator_mode = models.CharField(max_length=64)
    synthetic = models.BooleanField()


class Action(models.Model):
    action_id = models.CharField(primary_key=True, max_length=32)
    mission = models.ForeignKey(Mission, on_delete=models.PROTECT, related_name='actions')
    sequence = models.PositiveIntegerField()
    timestamp = models.DateTimeField(db_index=True)
    location = models.ForeignKey(Location, on_delete=models.PROTECT, related_name='actions')
    asset = models.ForeignKey(Asset, on_delete=models.PROTECT, related_name='actions')
    action_type = models.CharField(max_length=64)
    battery_pct = models.PositiveSmallIntegerField(validators=[MaxValueValidator(100)])
    status = models.CharField(max_length=16, choices=[('SUCCESS', 'Success'), ('FAILED', 'Failed')])
    failure_type = models.CharField(max_length=64, blank=True)
    duration_sec = models.PositiveIntegerField()
    scenario = models.CharField(max_length=16, choices=SCENARIOS)
    configuration_version = models.CharField(max_length=16, choices=VERSIONS)
    synthetic = models.BooleanField()

    class Meta:
        constraints = [models.UniqueConstraint(fields=['mission', 'sequence'], name='unique_mission_action_sequence')]


class Reading(models.Model):
    reading_id = models.CharField(primary_key=True, max_length=32)
    action = models.ForeignKey(Action, on_delete=models.PROTECT, related_name='readings')
    mission = models.ForeignKey(Mission, on_delete=models.PROTECT, related_name='readings')
    asset = models.ForeignKey(Asset, on_delete=models.PROTECT, related_name='readings')
    location = models.ForeignKey(Location, on_delete=models.PROTECT, related_name='readings')
    timestamp = models.DateTimeField(db_index=True)
    measurement_type = models.CharField(max_length=64)
    value = models.DecimalField(max_digits=16, decimal_places=6)
    unit = models.CharField(max_length=32)
    quality = models.CharField(max_length=32)
    synthetic = models.BooleanField()


class Anomaly(models.Model):
    anomaly_id = models.CharField(primary_key=True, max_length=32)
    action = models.ForeignKey(Action, on_delete=models.PROTECT, related_name='anomalies')
    mission = models.ForeignKey(Mission, on_delete=models.PROTECT, related_name='anomalies')
    location = models.ForeignKey(Location, on_delete=models.PROTECT, related_name='anomalies')
    asset = models.ForeignKey(Asset, on_delete=models.PROTECT, related_name='anomalies')
    timestamp = models.DateTimeField(db_index=True)
    anomaly_type = models.CharField(max_length=64)
    severity = models.CharField(max_length=16, choices=SEVERITIES)
    operator_review_required = models.BooleanField()
    description = models.TextField()
    synthetic = models.BooleanField()
    ml_detection = models.ForeignKey('MLAnomalyDetection', null=True, blank=True, on_delete=models.SET_NULL, related_name='anomalies')


class TimestampedRecord(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class LidarScan(TimestampedRecord):
    name = models.CharField(max_length=200)
    captured_at = models.DateTimeField(db_index=True)
    source = models.CharField(max_length=128, blank=True)
    point_cloud_uri = models.TextField()
    file_format = models.CharField(max_length=16, choices=[('ply', 'PLY'), ('pcd', 'PCD')])
    point_count = models.PositiveBigIntegerField(null=True, blank=True)
    coordinate_frame = models.CharField(max_length=64, default='facility_local')
    units = models.CharField(max_length=16, default='meters')
    mesh_uri = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    mission = models.ForeignKey(Mission, null=True, blank=True, on_delete=models.PROTECT, related_name='lidar_scans')
    action = models.ForeignKey(Action, null=True, blank=True, on_delete=models.PROTECT, related_name='lidar_scans')
    location = models.ForeignKey(Location, null=True, blank=True, on_delete=models.PROTECT, related_name='lidar_scans')


SHA256_VALIDATOR = RegexValidator(r'^[0-9a-f]{64}$', 'Must be a lowercase SHA-256 hexadecimal digest.')


class MLAnomalyDetection(TimestampedRecord):
    lidar_scan = models.ForeignKey(LidarScan, null=True, blank=True, on_delete=models.SET_NULL, related_name='ml_detections')
    asset = models.ForeignKey(Asset, on_delete=models.PROTECT, related_name='ml_detections')
    mission = models.ForeignKey(Mission, null=True, blank=True, on_delete=models.PROTECT, related_name='ml_detections')
    action = models.ForeignKey(Action, null=True, blank=True, on_delete=models.PROTECT, related_name='ml_detections')
    model_id = models.CharField(max_length=128, db_index=True)
    model_sha256 = models.CharField(max_length=64, validators=[SHA256_VALIDATOR])
    source_sha256 = models.CharField(max_length=64, validators=[SHA256_VALIDATOR])
    modality = models.CharField(max_length=16, choices=[('image', 'Image'), ('audio', 'Audio')])
    frame_id = models.CharField(max_length=128, blank=True)
    captured_at = models.DateTimeField(null=True, blank=True, db_index=True)
    processed_at = models.DateTimeField(db_index=True)
    status = models.CharField(max_length=64, db_index=True)
    label = models.CharField(max_length=128, null=True, blank=True)
    result = models.JSONField()
    review_status = models.CharField(max_length=16, default='pending', db_index=True,
                                    choices=[('pending', 'Pending'), ('confirmed', 'Confirmed'), ('dismissed', 'Dismissed')])
    notes = models.TextField(blank=True)


class Replay(TimestampedRecord):
    name = models.CharField(max_length=200)
    mission = models.ForeignKey(Mission, null=True, blank=True, on_delete=models.PROTECT, related_name='replays')
    description = models.TextField(blank=True)
    source_sha256 = models.CharField(max_length=64, validators=[SHA256_VALIDATOR], null=True, blank=True, unique=True)


class ReplayEvent(TimestampedRecord):
    event_id = models.CharField(max_length=32)
    replay = models.ForeignKey(Replay, on_delete=models.CASCADE, related_name='events')
    sequence = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    mission = models.ForeignKey(Mission, on_delete=models.PROTECT, related_name='replay_events')
    action = models.ForeignKey(Action, null=True, blank=True, on_delete=models.PROTECT, related_name='replay_events')
    timestamp = models.DateTimeField(db_index=True)
    event_type = models.CharField(max_length=64)
    details = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ['sequence', 'id']
        constraints = [
            models.UniqueConstraint(fields=['replay', 'sequence'], name='unique_replay_sequence'),
            models.UniqueConstraint(fields=['replay', 'event_id'], name='unique_replay_source_event'),
            models.CheckConstraint(condition=models.Q(sequence__gte=1), name='positive_replay_sequence'),
        ]


class ImportReport(TimestampedRecord):
    source_name = models.CharField(max_length=255)
    source_sha256 = models.CharField(max_length=64, validators=[SHA256_VALIDATOR], unique=True)
    validation_status = models.CharField(max_length=32)
    generated_at = models.DateTimeField(null=True, blank=True)
    report = models.JSONField()
