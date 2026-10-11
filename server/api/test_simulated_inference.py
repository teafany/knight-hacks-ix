from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase
from rest_framework.test import APIClient

from .models import Action, Anomaly, Asset, MLAnomalyDetection, Mission
from .services.inference import classification_result, list_models
from .tests import import_data


def seed():
    output = StringIO()
    call_command('seed_simulated_inference', stdout=output)
    return output.getvalue()


class SimulatedInferenceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        import_data()

    def test_samples_follow_model_contracts_without_executing_models(self):
        with patch('api.services.inference.load_model', side_effect=AssertionError('No inference allowed')):
            output = seed()
        self.assertIn('detections: 9 created', output)
        self.assertIn('findings: 6 created', output)
        self.assertEqual(Action.objects.filter(mission_id='SIM-AI-M001').count(), 9)
        catalogue = {model['id']: model for model in list_models()}
        detections = MLAnomalyDetection.objects.filter(mission_id='SIM-AI-M001')
        self.assertEqual(detections.count(), 9)
        self.assertEqual(set(detections.values_list('model_id', flat=True)), set(catalogue))
        for detection in detections:
            with self.subTest(frame=detection.frame_id):
                result = detection.result
                model = catalogue[detection.model_id]
                self.assertEqual(result['model_sha256'], model['sha256'])
                self.assertTrue(result['frame_id'].startswith('SIMULATED-'))
                self.assertIn('[SIMULATED]', detection.notes)
                self.assertTrue(result['requires_review'])
                self.assertFalse(result['scores_are_calibrated'])
                for name in ('value', 'unit', 'temperature_c', 'hazard_severity'):
                    self.assertIsNone(result[name])
                self.assertEqual(detection.asset_id, detection.action.asset_id)
                self.assertEqual(detection.mission_id, detection.action.mission_id)
                if result['scores']:
                    self.assertEqual(set(result['scores']), set(model['classes']))
                    self.assertAlmostEqual(sum(result['scores'].values()), 1)
                    kind = model['endpoint'].rsplit('/', 1)[-1]
                    expected = classification_result(result['scores'], kind, .7)
                    self.assertEqual(result['status'], expected['status'])
                    self.assertEqual(result['label'], expected['label'])
                for box in result['detections']:
                    self.assertIn(box['label'], model['classes'])
        self.assertEqual(Anomaly.objects.filter(ml_detection__isnull=False).count(), 6)

    def test_dashboard_serves_linked_results_and_updated_metrics(self):
        client = APIClient()
        original = client.get('/api/findings/AN001').json()
        self.assertIsNone(original['ml_detection_id'])
        self.assertIsNone(original['inference_result'])
        seed()
        with self.assertNumQueries(2):
            response = client.get('/api/findings?mission_id=SIM-AI-M001')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['count'], 6)
        for finding in response.json()['results']:
            self.assertTrue(finding['synthetic'])
            self.assertTrue(finding['operator_review_required'])
            self.assertTrue(finding['description'].startswith('[SIMULATED]'))
            self.assertIsNotNone(finding['ml_detection_id'])
            self.assertEqual(finding['inference_result']['asset_id'], finding['asset_id'])
            detail = client.get(f'/api/findings/{finding["anomaly_id"]}')
            self.assertEqual(detail.json(), finding)
        metrics = client.get('/api/metrics').json()
        self.assertEqual(metrics['total_anomalies'], 46)
        self.assertEqual(metrics['total_missions'], 28)
        summary = client.get('/api/records/ml-detections/summary').json()
        self.assertEqual(summary['total_detections'], 9)
        self.assertEqual(summary['total_models'], 4)

    def test_reruns_preserve_reviews_and_source_import_remains_repeatable(self):
        seed()
        detection = MLAnomalyDetection.objects.get(frame_id='SIMULATED-corrosion-suspected')
        detection.review_status = 'confirmed'
        detection.notes = 'Reviewed by an operator.'
        detection.save()
        finding = Anomaly.objects.get(ml_detection=detection)
        finding.operator_review_required = False
        finding.description = '[SIMULATED] Reviewed demo example.'
        finding.severity = 'MEDIUM'
        finding.save()
        output = seed()
        for name in ('assets', 'missions', 'actions', 'detections', 'findings'):
            self.assertIn(f'{name}: 0 created', output)
        detection.refresh_from_db()
        finding.refresh_from_db()
        self.assertEqual(detection.review_status, 'confirmed')
        self.assertEqual(detection.notes, 'Reviewed by an operator.')
        self.assertFalse(finding.operator_review_required)
        self.assertEqual(finding.severity, 'MEDIUM')
        self.assertEqual(finding.description, '[SIMULATED] Reviewed demo example.')
        import_data()
        self.assertEqual(MLAnomalyDetection.objects.count(), 9)
        self.assertEqual(Anomaly.objects.count(), 46)

    def test_late_conflict_rolls_back_seed_without_overwriting_records(self):
        source = Action.objects.get(pk='A0001')
        source.pk = 'SIM-AI-A009'
        source.sequence = 999
        source.save(force_insert=True)
        with self.assertRaisesRegex(CommandError, 'conflicts with the demo'):
            seed()
        self.assertFalse(Mission.objects.filter(pk='SIM-AI-M001').exists())
        self.assertFalse(Asset.objects.filter(pk='SIM-AI-YOKE').exists())
        self.assertEqual(MLAnomalyDetection.objects.count(), 0)
        self.assertEqual(Anomaly.objects.count(), 40)
        self.assertEqual(Action.objects.get(pk='SIM-AI-A009').mission_id, 'M001')


class SimulatedInferencePrerequisiteTests(TestCase):
    def test_missing_challenge_data_explains_setup_and_creates_nothing(self):
        with self.assertRaisesRegex(CommandError, 'Import the synthetic challenge data first'):
            seed()
        self.assertEqual(Mission.objects.count(), 0)
        self.assertEqual(Asset.objects.count(), 0)
        self.assertEqual(MLAnomalyDetection.objects.count(), 0)
