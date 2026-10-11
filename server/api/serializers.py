from rest_framework import serializers

from .inference_serializers import InferenceResultSerializer
from .models import Anomaly, Mission, SCENARIOS, SEVERITIES


class HealthSerializer(serializers.Serializer):
    status = serializers.CharField()
    service = serializers.CharField()


class MissionSerializer(serializers.ModelSerializer):
    total_actions = serializers.IntegerField(read_only=True)
    successful_actions = serializers.IntegerField(read_only=True)
    failed_actions = serializers.IntegerField(read_only=True)
    battery_used_pct = serializers.IntegerField(read_only=True)

    class Meta:
        model = Mission
        fields = [
            'mission_id', 'mission_name', 'scenario', 'configuration_version',
            'start_time', 'end_time', 'duration_min', 'start_battery_pct',
            'end_battery_pct', 'mission_status', 'operator_mode', 'synthetic',
            'total_actions', 'successful_actions', 'failed_actions', 'battery_used_pct',
        ]


class FindingSerializer(serializers.ModelSerializer):
    asset_name = serializers.CharField(source='asset.asset_name', read_only=True)
    location_name = serializers.CharField(source='location.location_name', read_only=True)
    inference_result = InferenceResultSerializer(source='ml_detection.result', read_only=True, allow_null=True)

    class Meta:
        model = Anomaly
        fields = [
            'anomaly_id', 'action_id', 'mission_id', 'asset_id', 'asset_name',
            'location_id', 'location_name', 'timestamp', 'anomaly_type',
            'severity', 'operator_review_required', 'description', 'synthetic',
            'ml_detection_id', 'inference_result',
        ]


class MissionQuerySerializer(serializers.Serializer):
    scenario = serializers.ChoiceField(choices=SCENARIOS, required=False)
    mission_status = serializers.ChoiceField(choices=Mission._meta.get_field('mission_status').choices, required=False)


class FindingQuerySerializer(serializers.Serializer):
    mission_id = serializers.CharField(max_length=32, required=False)
    severity = serializers.ChoiceField(choices=SEVERITIES, required=False)
    operator_review_required = serializers.BooleanField(required=False)


class OutcomeMetricsSerializer(serializers.Serializer):
    total_missions = serializers.IntegerField()
    completed_missions = serializers.IntegerField()
    mission_completion_pct = serializers.FloatField(allow_null=True)
    total_actions = serializers.IntegerField()
    successful_actions = serializers.IntegerField()
    failed_actions = serializers.IntegerField()
    action_success_pct = serializers.FloatField(allow_null=True)


class FailureLocationSerializer(serializers.Serializer):
    location_id = serializers.CharField()
    location_name = serializers.CharField()
    failed_actions = serializers.IntegerField()


class MetricsSerializer(OutcomeMetricsSerializer):
    data_source = serializers.CharField()
    latest_record_at = serializers.DateTimeField(allow_null=True)
    total_readings = serializers.IntegerField()
    total_anomalies = serializers.IntegerField()
    review_required_count = serializers.IntegerField()
    anomalies_by_severity = serializers.DictField(child=serializers.IntegerField())
    by_scenario = serializers.DictField(child=OutcomeMetricsSerializer())
    failures_by_location = FailureLocationSerializer(many=True)
    wp05_navigation_failure_pct = serializers.FloatField(allow_null=True)
