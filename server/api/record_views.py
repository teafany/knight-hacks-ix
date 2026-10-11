from django.db import IntegrityError, transaction
from django.db.models import Count
from django.db.models.deletion import ProtectedError
from drf_spectacular.utils import extend_schema, extend_schema_view, OpenApiParameter, OpenApiResponse
from rest_framework import serializers, status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from .models import Action, Anomaly, Asset, ImportReport, LidarScan, Location, MLAnomalyDetection, Mission, Reading, Replay, ReplayEvent
from .record_serializers import (
    ActionRecordSerializer, AnomalyRecordSerializer, AssetRecordSerializer, ImportReportSerializer,
    LidarScanSerializer, LocationRecordSerializer, MLAnomalyDetectionSerializer, MissionRecordSerializer,
    MLDetectionSummarySerializer, ReadingRecordSerializer, ReplayEventSerializer, ReplaySerializer,
)
from .inference_serializers import InferenceErrorSerializer
from .services.inference import InferenceUnavailable
from .services.ml_summary import summarize_models
from .views import DashboardPagination


def record_schema(*filters):
    return extend_schema_view(
        list=extend_schema(parameters=[OpenApiParameter(name, str, description='Exact match filter.') for name in filters]),
        destroy=extend_schema(responses={204: None, 409: OpenApiResponse(description='Referenced records prevent deletion.')}),
    )


class GlobalRecordViewSet(ModelViewSet):
    authentication_classes = []
    permission_classes = [AllowAny]
    pagination_class = DashboardPagination
    filter_fields = ()
    http_method_names = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        queryset = super().get_queryset()
        if getattr(self, 'swagger_fake_view', False):
            return queryset.none()
        fields = self.get_serializer().fields
        for name in self.filter_fields:
            if name in self.request.query_params:
                field = fields[name]
                try:
                    value = field.run_validation(self.request.query_params[name])
                except serializers.ValidationError as exc:
                    raise ValidationError({name: exc.detail}) from exc
                queryset = queryset.filter(**{field.source: value})
        return queryset

    def perform_create(self, serializer):
        self.save_record(serializer)

    def perform_update(self, serializer):
        self.save_record(serializer)

    def save_record(self, serializer):
        try:
            with transaction.atomic():
                serializer.save()
        except IntegrityError as exc:
            raise ValidationError({'detail': 'Database constraint conflict. Check record IDs and related objects.'}) from exc

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        try:
            with transaction.atomic():
                instance.delete()
        except (ProtectedError, IntegrityError):
            return Response({'detail': 'This record is referenced by other records. Delete or update those references first.'}, status=409)
        return Response(status=status.HTTP_204_NO_CONTENT)


@record_schema('zone_type', 'floor')
@extend_schema(tags=['Locations'])
class LocationViewSet(GlobalRecordViewSet):
    queryset = Location.objects.order_by('location_id')
    serializer_class = LocationRecordSerializer
    filter_fields = ('zone_type', 'floor')


@record_schema('location_id', 'asset_type', 'criticality')
@extend_schema(tags=['Assets'])
class AssetViewSet(GlobalRecordViewSet):
    queryset = Asset.objects.select_related('location').order_by('asset_id')
    serializer_class = AssetRecordSerializer
    filter_fields = ('location_id', 'asset_type', 'criticality')


@record_schema('scenario', 'mission_status')
@extend_schema(tags=['Missions'])
class MissionViewSet(GlobalRecordViewSet):
    queryset = Mission.objects.order_by('start_time', 'mission_id')
    serializer_class = MissionRecordSerializer
    filter_fields = ('scenario', 'mission_status')


@record_schema('mission_id', 'asset_id', 'location_id', 'status')
@extend_schema(tags=['Actions'])
class ActionViewSet(GlobalRecordViewSet):
    queryset = Action.objects.select_related('mission', 'asset', 'location').order_by('timestamp', 'action_id')
    serializer_class = ActionRecordSerializer
    filter_fields = ('mission_id', 'asset_id', 'location_id', 'status')


@record_schema('mission_id', 'action_id', 'asset_id', 'measurement_type')
@extend_schema(tags=['Readings'])
class ReadingViewSet(GlobalRecordViewSet):
    queryset = Reading.objects.select_related('action', 'mission', 'asset', 'location').order_by('timestamp', 'reading_id')
    serializer_class = ReadingRecordSerializer
    filter_fields = ('mission_id', 'action_id', 'asset_id', 'measurement_type')


@record_schema('mission_id', 'action_id', 'asset_id', 'severity')
@extend_schema(tags=['Anomalies'])
class AnomalyViewSet(GlobalRecordViewSet):
    queryset = Anomaly.objects.select_related('action', 'mission', 'asset', 'location', 'ml_detection').order_by('timestamp', 'anomaly_id')
    serializer_class = AnomalyRecordSerializer
    filter_fields = ('mission_id', 'action_id', 'asset_id', 'severity')


@record_schema('mission_id', 'action_id', 'location_id', 'file_format')
@extend_schema(tags=['LiDAR Scans'])
class LidarScanViewSet(GlobalRecordViewSet):
    queryset = LidarScan.objects.select_related('mission', 'action', 'location').order_by('-captured_at', 'id')
    serializer_class = LidarScanSerializer
    filter_fields = ('mission_id', 'action_id', 'location_id', 'file_format')


@record_schema('asset_id', 'mission_id', 'action_id', 'lidar_scan_id', 'model_id', 'modality', 'review_status')
@extend_schema(tags=['ML Detections'])
class MLAnomalyDetectionViewSet(GlobalRecordViewSet):
    queryset = MLAnomalyDetection.objects.select_related('asset', 'mission', 'action', 'lidar_scan').order_by('-processed_at', 'id')
    serializer_class = MLAnomalyDetectionSerializer
    filter_fields = ('asset_id', 'mission_id', 'action_id', 'lidar_scan_id', 'model_id', 'modality', 'review_status')

    @extend_schema(
        responses={200: MLDetectionSummarySerializer, 503: InferenceErrorSerializer},
        summary='Summarize all ML models and their saved detections',
        description='Global, unpaginated summary. Includes registered models with zero detections and historical model IDs no longer registered. Counts span all saved model versions. Does not run inference. Checkpoint presence is not a runtime health check.',
        filters=False,
    )
    @action(detail=False, methods=['get'], pagination_class=None)
    def summary(self, request):
        try:
            data = summarize_models()
        except InferenceUnavailable as exc:
            return Response({'detail': str(exc)}, status=503)
        return Response(MLDetectionSummarySerializer(data).data)


@record_schema('mission_id')
@extend_schema(tags=['Replays'])
class ReplayViewSet(GlobalRecordViewSet):
    queryset = Replay.objects.annotate(event_count=Count('events')).order_by('-created_at', 'id')
    serializer_class = ReplaySerializer
    filter_fields = ('mission_id',)


@record_schema('replay_id', 'mission_id', 'action_id', 'event_type')
@extend_schema(tags=['Replay Events'])
class ReplayEventViewSet(GlobalRecordViewSet):
    queryset = ReplayEvent.objects.select_related('replay', 'mission', 'action').order_by('replay_id', 'sequence', 'id')
    serializer_class = ReplayEventSerializer
    filter_fields = ('replay_id', 'mission_id', 'action_id', 'event_type')


@record_schema('validation_status')
@extend_schema(tags=['Import Reports'])
class ImportReportViewSet(GlobalRecordViewSet):
    queryset = ImportReport.objects.order_by('-created_at', 'id')
    serializer_class = ImportReportSerializer
    filter_fields = ('validation_status',)
