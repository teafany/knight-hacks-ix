from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.pagination import LimitOffsetPagination
from django.db.models import Count, F, Q
from drf_spectacular.utils import extend_schema

from .models import Anomaly, Mission
from .serializers import (
    FindingQuerySerializer, FindingSerializer, HealthSerializer,
    MetricsSerializer, MissionQuerySerializer, MissionSerializer,
)
from .services.analytics import dashboard_metrics


class HealthView(APIView):
    """Report that the local API process is responding."""

    authentication_classes = []
    permission_classes = [AllowAny]

    @extend_schema(responses=HealthSerializer, tags=['Health'])
    def get(self, request):
        serializer = HealthSerializer({'status': 'ok', 'service': 'server'})
        return Response(serializer.data)


class DashboardPagination(LimitOffsetPagination):
    default_limit = 100
    max_limit = 500


class MissionListView(ListAPIView):
    serializer_class = MissionSerializer
    pagination_class = DashboardPagination

    @extend_schema(parameters=[MissionQuerySerializer], tags=['Dashboard'])
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)

    def get_queryset(self):
        query = MissionQuerySerializer(data=self.request.query_params)
        query.is_valid(raise_exception=True)
        return Mission.objects.filter(**query.validated_data).annotate(
            total_actions=Count('actions'),
            successful_actions=Count('actions', filter=Q(actions__status='SUCCESS')),
            failed_actions=Count('actions', filter=Q(actions__status='FAILED')),
            battery_used_pct=F('start_battery_pct') - F('end_battery_pct'),
        ).order_by('start_time', 'mission_id')


class FindingListView(ListAPIView):
    serializer_class = FindingSerializer
    pagination_class = DashboardPagination

    @extend_schema(parameters=[FindingQuerySerializer], tags=['Dashboard'])
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)

    def get_queryset(self):
        # Treat filters as API values rather than HTML checkbox input. Otherwise
        # DRF interprets an omitted BooleanField as false and silently filters out
        # findings that require review.
        query = FindingQuerySerializer(data=dict(self.request.query_params.items()))
        query.is_valid(raise_exception=True)
        return Anomaly.objects.filter(**query.validated_data).select_related('asset', 'location', 'ml_detection').order_by('timestamp', 'anomaly_id')


@extend_schema(tags=['Dashboard'])
class FindingDetailView(RetrieveAPIView):
    serializer_class = FindingSerializer
    queryset = Anomaly.objects.select_related('asset', 'location', 'ml_detection')
    lookup_field = 'anomaly_id'


class MetricsView(APIView):
    @extend_schema(responses=MetricsSerializer, tags=['Dashboard'])
    def get(self, request):
        return Response(MetricsSerializer(dashboard_metrics()).data)
