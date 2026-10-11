import json
import math
from collections.abc import Mapping

from django.core.exceptions import ValidationError as ModelValidationError
from django.db import models
from rest_framework import serializers

from .inference_serializers import InferenceModelSerializer, InferenceResultSerializer
from .models import Action, Anomaly, Asset, ImportReport, LidarScan, Location, MLAnomalyDetection, Mission, Reading, Replay, ReplayEvent
from .services.records import validate_record


class GlobalRecordSerializer(serializers.ModelSerializer):
    def get_fields(self):
        fields = super().get_fields()
        # Public FK names match the CSVs and use IDs rather than nested records.
        for model_field in self.Meta.model._meta.fields:
            if model_field.many_to_one and model_field.name in fields:
                field = fields.pop(model_field.name)
                field.source = model_field.name
                if isinstance(model_field.target_field, models.UUIDField):
                    field.pk_field = serializers.UUIDField()
                fields[model_field.attname] = field
        return fields

    def to_internal_value(self, data):
        if not isinstance(data, Mapping):
            return super().to_internal_value(data)
        unknown = set(data) - set(self.fields)
        if unknown:
            raise serializers.ValidationError({key: 'Unknown field.' for key in unknown})
        pk = self.Meta.model._meta.pk
        if self.instance and pk.name in data and str(data[pk.name]) != str(self.instance.pk):
            raise serializers.ValidationError({pk.name: 'Primary keys cannot be changed.'})
        return super().to_internal_value(data)

    def validate(self, attrs):
        model = self.Meta.model
        values = {field.attname: getattr(self.instance, field.attname) for field in model._meta.fields} if self.instance else {}
        candidate = model(**values)
        for name, value in attrs.items():
            setattr(candidate, name, value)
        for field in model._meta.fields:
            if isinstance(field, models.JSONField):
                value = getattr(candidate, field.name)
                if not isinstance(value, dict):
                    raise serializers.ValidationError({field.name: 'Expected a JSON object.'})
                try:
                    json.dumps(value, allow_nan=False)
                except (ValueError, TypeError) as exc:
                    raise serializers.ValidationError({field.name: 'JSON must contain finite, serializable values.'}) from exc
        try:
            candidate.full_clean(exclude=['created_at', 'updated_at'], validate_unique=False, validate_constraints=False)
            validate_record(candidate, self.instance)
        except ModelValidationError as exc:
            messages = exc.message_dict if hasattr(exc, 'message_dict') else {'non_field_errors': exc.messages}
            public = {field.name: field.attname for field in model._meta.fields if field.many_to_one}
            raise serializers.ValidationError({public.get(key, key): value for key, value in messages.items()}) from exc
        return attrs

    class Meta:
        fields = '__all__'


class LocationRecordSerializer(GlobalRecordSerializer):
    class Meta(GlobalRecordSerializer.Meta):
        model = Location


class AssetRecordSerializer(GlobalRecordSerializer):
    class Meta(GlobalRecordSerializer.Meta):
        model = Asset


class MissionRecordSerializer(GlobalRecordSerializer):
    class Meta(GlobalRecordSerializer.Meta):
        model = Mission


class ActionRecordSerializer(GlobalRecordSerializer):
    class Meta(GlobalRecordSerializer.Meta):
        model = Action


class ReadingRecordSerializer(GlobalRecordSerializer):
    class Meta(GlobalRecordSerializer.Meta):
        model = Reading


class AnomalyRecordSerializer(GlobalRecordSerializer):
    class Meta(GlobalRecordSerializer.Meta):
        model = Anomaly


class LidarScanSerializer(GlobalRecordSerializer):
    class Meta(GlobalRecordSerializer.Meta):
        model = LidarScan


class MLAnomalyDetectionSerializer(GlobalRecordSerializer):
    derived_fields = ('model_id', 'model_sha256', 'source_sha256', 'frame_id', 'captured_at', 'processed_at', 'status', 'label')

    def validate_result(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError('Expected an inference response object.')
        payload = InferenceResultSerializer(data=value)
        payload.is_valid(raise_exception=True)
        row = payload.validated_data
        if row['schema_version'] != 1:
            raise serializers.ValidationError('Unsupported inference schema version.')
        scores = row['scores']
        if any(not math.isfinite(score) or not 0 <= score <= 1 for score in scores.values()):
            raise serializers.ValidationError('Classification scores must be finite and between zero and one.')
        if scores and not math.isclose(sum(scores.values()), 1, abs_tol=1e-4):
            raise serializers.ValidationError('Classification scores must sum to one.')
        if not math.isfinite(row['inference_ms']) or row['inference_ms'] < 0:
            raise serializers.ValidationError('Inference duration must be finite and nonnegative.')
        for box in row['detections']:
            x1, y1, x2, y2 = box['box_xyxy']
            if not 0 <= box['score'] <= 1 or not all(math.isfinite(v) for v in box['box_xyxy']) or not (0 <= x1 < x2 and 0 <= y1 < y2):
                raise serializers.ValidationError('Invalid detection score or bounding box.')
        return value

    def validate(self, attrs):
        result = attrs.get('result', self.instance.result if self.instance else None)
        if result is not None:
            parsed = InferenceResultSerializer(data=result)
            parsed.is_valid(raise_exception=True)
            attrs.update({key: parsed.validated_data[key] for key in self.derived_fields})
            asset = attrs.get('asset', self.instance.asset if self.instance else None)
            if asset and result['asset_id'] != asset.pk:
                raise serializers.ValidationError({'asset_id': 'Asset does not match the inference result.'})
        return super().validate(attrs)

    class Meta(GlobalRecordSerializer.Meta):
        model = MLAnomalyDetection
        read_only_fields = ('model_id', 'model_sha256', 'source_sha256', 'frame_id', 'captured_at', 'processed_at', 'status', 'label')


class ModelDetectionSummarySerializer(serializers.Serializer):
    model_id = serializers.CharField()
    model = InferenceModelSerializer(allow_null=True, help_text='Current registry metadata; null for historical/unregistered models.')
    total_detections = serializers.IntegerField()
    modalities = serializers.ListField(child=serializers.CharField())
    review_status_counts = serializers.DictField(child=serializers.IntegerField())
    status_counts = serializers.DictField(child=serializers.IntegerField())
    label_counts = serializers.DictField(child=serializers.IntegerField())
    unlabeled_count = serializers.IntegerField()
    latest_processed_at = serializers.DateTimeField(allow_null=True)


class MLDetectionSummarySerializer(serializers.Serializer):
    total_models = serializers.IntegerField()
    registered_model_count = serializers.IntegerField()
    total_detections = serializers.IntegerField()
    review_status_counts = serializers.DictField(child=serializers.IntegerField())
    models = ModelDetectionSummarySerializer(many=True)


class ReplaySerializer(GlobalRecordSerializer):
    event_count = serializers.SerializerMethodField()

    def get_event_count(self, obj) -> int:
        return obj.event_count if hasattr(obj, 'event_count') else obj.events.count()

    class Meta(GlobalRecordSerializer.Meta):
        model = Replay


class ReplayEventSerializer(GlobalRecordSerializer):
    class Meta(GlobalRecordSerializer.Meta):
        model = ReplayEvent


class ImportReportSerializer(GlobalRecordSerializer):
    class Meta(GlobalRecordSerializer.Meta):
        model = ImportReport
