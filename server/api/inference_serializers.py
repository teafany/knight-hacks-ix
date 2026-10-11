import math

from django.conf import settings
from rest_framework import serializers


class UploadSerializer(serializers.Serializer):
    asset_id = serializers.CharField(max_length=128)
    frame_id = serializers.CharField(max_length=128, required=False, allow_blank=True, default='')
    captured_at = serializers.DateTimeField(required=False, allow_null=True, default=None)
    threshold = serializers.FloatField(min_value=.5, max_value=1, default=.7)

    def validate_threshold(self, value):
        if not math.isfinite(value):
            raise serializers.ValidationError('Threshold must be finite.')
        return value

    def validate(self, attrs):
        upload = attrs.get('image', attrs.get('audio'))
        if upload.size > settings.INFERENCE_MAX_UPLOAD_BYTES:
            raise serializers.ValidationError('Upload exceeds the 8 MiB limit.')
        return attrs


class FrameSerializer(UploadSerializer):
    image = serializers.FileField(help_text='JPEG or PNG frame. Send each live camera frame independently.')


class CorrosionFrameSerializer(FrameSerializer):
    asset_category = serializers.ChoiceField(choices=['yoke-suspension'])
    asset_crop = serializers.BooleanField(default=False, help_text='Frame already contains one cropped asset.')
    roi = serializers.JSONField(required=False, help_text='JSON [x, y, width, height] in uploaded frame pixels.')

    def validate_roi(self, value):
        if (not isinstance(value, list) or len(value) != 4 or
                any(type(v) is not int for v in value) or
                min(value[:2]) < 0 or min(value[2:]) < 1):
            raise serializers.ValidationError('ROI must be [x, y, width, height] with nonnegative origin and positive dimensions.')
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if attrs['asset_crop'] == ('roi' in attrs):
            raise serializers.ValidationError('Supply exactly one of asset_crop=true or roi.')
        return attrs


class ThermalFrameSerializer(FrameSerializer):
    compatible_thermogram = serializers.BooleanField(
        help_text='Confirm one motor with the thermal palette/framing used for training; never visible-light video.',
    )

    def validate_compatible_thermogram(self, value):
        if not value:
            raise serializers.ValidationError('A reviewed compatible thermogram is required.')
        return value


class AcousticSerializer(UploadSerializer):
    audio = serializers.FileField(help_text='Exactly 10 seconds of 16 kHz PCM16 WAV, mono or 8 channels (channel 0 used).')
    compatible_pump_audio = serializers.BooleanField(help_text='Confirm audio matches the pump recording domain.')
    allow_experimental = serializers.BooleanField(help_text='Explicitly opt in to the experimental acoustic model.')

    def validate_compatible_pump_audio(self, value):
        if not value:
            raise serializers.ValidationError('Compatible pump audio is required.')
        return value

    def validate_allow_experimental(self, value):
        if not value:
            raise serializers.ValidationError('Acoustic inference requires explicit experimental opt-in.')
        return value


class DetectionSerializer(serializers.Serializer):
    label = serializers.CharField()
    score = serializers.FloatField()
    box_xyxy = serializers.ListField(child=serializers.FloatField(), min_length=4, max_length=4)


class InferenceResultSerializer(serializers.Serializer):
    schema_version = serializers.IntegerField()
    model_id = serializers.CharField()
    model_sha256 = serializers.CharField()
    source_sha256 = serializers.CharField()
    asset_id = serializers.CharField()
    frame_id = serializers.CharField(allow_blank=True)
    captured_at = serializers.DateTimeField(allow_null=True)
    processed_at = serializers.DateTimeField()
    inference_ms = serializers.FloatField()
    status = serializers.CharField()
    label = serializers.CharField(allow_null=True)
    reason = serializers.CharField(allow_null=True)
    scores = serializers.DictField(child=serializers.FloatField())
    scores_are_calibrated = serializers.BooleanField()
    detections = DetectionSerializer(many=True)
    image_size = serializers.ListField(child=serializers.IntegerField(), allow_null=True)
    roi = serializers.ListField(child=serializers.IntegerField(), allow_null=True)
    requires_review = serializers.BooleanField()
    quality_status = serializers.CharField()
    value = serializers.FloatField(allow_null=True)
    unit = serializers.CharField(allow_null=True)
    temperature_c = serializers.FloatField(allow_null=True)
    hazard_severity = serializers.CharField(allow_null=True)


class InferenceModelSerializer(serializers.Serializer):
    id = serializers.CharField()
    modality = serializers.CharField()
    endpoint = serializers.CharField()
    architecture = serializers.CharField()
    classes = serializers.ListField(child=serializers.CharField())
    sha256 = serializers.CharField()
    scope = serializers.CharField()
    quality_status = serializers.CharField()
    checkpoint_present = serializers.BooleanField()


class InferenceErrorSerializer(serializers.Serializer):
    detail = serializers.CharField()
