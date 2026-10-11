from django.urls import include, path
from rest_framework.routers import SimpleRouter
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView, SpectacularRedocView

from .views import FindingDetailView, FindingListView, HealthView, MetricsView, MissionListView
from .inference_views import (
    AcousticInferenceView, CorrosionInferenceView, GaugeInferenceView,
    InferenceModelsView, ThermalInferenceView,
)
from .record_views import (
    ActionViewSet, AnomalyViewSet, AssetViewSet, ImportReportViewSet, LidarScanViewSet,
    LocationViewSet, MLAnomalyDetectionViewSet, MissionViewSet, ReadingViewSet, ReplayEventViewSet, ReplayViewSet,
)

records = SimpleRouter(trailing_slash=False)
for resource, viewset in [
    ('locations', LocationViewSet), ('assets', AssetViewSet), ('missions', MissionViewSet),
    ('actions', ActionViewSet), ('readings', ReadingViewSet), ('anomalies', AnomalyViewSet),
    ('lidar-scans', LidarScanViewSet), ('ml-detections', MLAnomalyDetectionViewSet),
    ('replays', ReplayViewSet), ('replay-events', ReplayEventViewSet), ('import-reports', ImportReportViewSet),
]:
    records.register(resource, viewset, basename=resource)

app_name = 'api'

urlpatterns = [
    path('records/', include(records.urls)),
    path('schema', SpectacularAPIView.as_view(), name='schema'),
    path('docs', SpectacularSwaggerView.as_view(url_name='api:schema'), name='swagger-ui'),
    path('redoc', SpectacularRedocView.as_view(url_name='api:schema'), name='redoc'),
    path('inference/models', InferenceModelsView.as_view(), name='inference-models'),
    path('inference/gauge', GaugeInferenceView.as_view(), name='inference-gauge'),
    path('inference/corrosion', CorrosionInferenceView.as_view(), name='inference-corrosion'),
    path('inference/thermal', ThermalInferenceView.as_view(), name='inference-thermal'),
    path('inference/acoustic', AcousticInferenceView.as_view(), name='inference-acoustic'),
    path('health', HealthView.as_view(), name='health'),
    path('metrics', MetricsView.as_view(), name='metrics'),
    path('missions', MissionListView.as_view(), name='missions'),
    path('findings', FindingListView.as_view(), name='findings'),
    path('findings/<str:anomaly_id>', FindingDetailView.as_view(), name='finding-detail'),
]
