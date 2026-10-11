from django.db.models import Count, Max

from api.models import MLAnomalyDetection
from .inference import list_models


def summarize_models():
    catalogue = list_models()
    reviews = [value for value, _ in MLAnomalyDetection._meta.get_field('review_status').choices]

    def empty_summary(model_id, model=None):
        return {
            'model_id': model_id, 'model': model, 'total_detections': 0,
            'modalities': [model['modality']] if model else [],
            'review_status_counts': dict.fromkeys(reviews, 0),
            'status_counts': {}, 'label_counts': {}, 'unlabeled_count': 0,
            'latest_processed_at': None,
        }

    summaries = {model['id']: empty_summary(model['id'], model) for model in catalogue}
    total = 0
    review_counts = dict.fromkeys(reviews, 0)
    # Aggregate in one database snapshot; do not fetch result JSON or load weights.
    groups = MLAnomalyDetection.objects.order_by().values(
        'model_id', 'review_status', 'status', 'label', 'modality',
    ).annotate(count=Count('id'), latest=Max('processed_at'))
    for group in groups:
        model_id = group['model_id']
        if model_id not in summaries:
            summaries[model_id] = empty_summary(model_id)
        summary = summaries[model_id]
        count = group['count']
        total += count
        summary['total_detections'] += count
        review_counts[group['review_status']] += count
        summary['review_status_counts'][group['review_status']] += count
        for field, key in (('status_counts', 'status'), ('label_counts', 'label')):
            value = group[key]
            if value is not None:
                summary[field][value] = summary[field].get(value, 0) + count
        if group['label'] is None:
            summary['unlabeled_count'] += count
        if group['modality'] not in summary['modalities']:
            summary['modalities'].append(group['modality'])
        if summary['latest_processed_at'] is None or group['latest'] > summary['latest_processed_at']:
            summary['latest_processed_at'] = group['latest']
    for summary in summaries.values():
        summary['modalities'].sort()
    return {
        'total_models': len(summaries), 'registered_model_count': len(catalogue),
        'total_detections': total, 'review_status_counts': review_counts,
        'models': [summaries[key] for key in sorted(summaries)],
    }
