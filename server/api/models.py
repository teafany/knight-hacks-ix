from django.db import models
from django.core.validators import MaxValueValidator


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
