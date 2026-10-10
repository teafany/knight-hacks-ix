from django.urls import path

from .views import FindingDetailView, FindingListView, HealthView, MetricsView, MissionListView

app_name = 'api'

urlpatterns = [
    path('health', HealthView.as_view(), name='health'),
    path('metrics', MetricsView.as_view(), name='metrics'),
    path('missions', MissionListView.as_view(), name='missions'),
    path('findings', FindingListView.as_view(), name='findings'),
    path('findings/<str:anomaly_id>', FindingDetailView.as_view(), name='finding-detail'),
]
