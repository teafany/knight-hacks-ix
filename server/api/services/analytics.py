"""Metrics calculated from source records; mission and action outcomes are distinct."""
from django.db.models import Count, Max, Q

from api.models import Action, Anomaly, Mission, Reading, SCENARIOS, SEVERITIES


def percentage(numerator, denominator):
    return round(100 * numerator / denominator, 1) if denominator else None


def outcome_metrics(missions, actions):
    mission_counts = missions.aggregate(total=Count('pk'), completed=Count('pk', filter=Q(mission_status='COMPLETED')))
    action_counts = actions.aggregate(
        total=Count('pk'), successful=Count('pk', filter=Q(status='SUCCESS')),
        failed=Count('pk', filter=Q(status='FAILED')),
    )
    return {
        'total_missions': mission_counts['total'],
        'completed_missions': mission_counts['completed'],
        'mission_completion_pct': percentage(mission_counts['completed'], mission_counts['total']),
        'total_actions': action_counts['total'],
        'successful_actions': action_counts['successful'],
        'failed_actions': action_counts['failed'],
        'action_success_pct': percentage(action_counts['successful'], action_counts['total']),
    }


def dashboard_metrics():
    metrics = outcome_metrics(Mission.objects.all(), Action.objects.all())
    severity_counts = dict(Anomaly.objects.values('severity').annotate(count=Count('pk')).values_list('severity', 'count'))
    latest_times = [
        Mission.objects.aggregate(latest=Max('end_time'))['latest'],
        Action.objects.aggregate(latest=Max('timestamp'))['latest'],
        Reading.objects.aggregate(latest=Max('timestamp'))['latest'],
        Anomaly.objects.aggregate(latest=Max('timestamp'))['latest'],
    ]
    navigation = Action.objects.filter(location_id='WP05', action_type='NAVIGATION')
    failures = Action.objects.filter(status='FAILED').values('location_id', 'location__location_name').annotate(failed_actions=Count('pk')).order_by('-failed_actions', 'location_id')
    metrics.update({
        'data_source': 'synthetic_challenge',
        'latest_record_at': max((value for value in latest_times if value is not None), default=None),
        'total_readings': Reading.objects.count(),
        'total_anomalies': Anomaly.objects.count(),
        'review_required_count': Anomaly.objects.filter(operator_review_required=True).count(),
        'anomalies_by_severity': {severity: severity_counts.get(severity, 0) for severity, _ in SEVERITIES},
        'by_scenario': {
            scenario: outcome_metrics(Mission.objects.filter(scenario=scenario), Action.objects.filter(scenario=scenario))
            for scenario, _ in SCENARIOS
        },
        'failures_by_location': [
            {'location_id': row['location_id'], 'location_name': row['location__location_name'], 'failed_actions': row['failed_actions']}
            for row in failures
        ],
        'wp05_navigation_failure_pct': percentage(navigation.filter(status='FAILED').count(), navigation.count()),
    })
    return metrics
