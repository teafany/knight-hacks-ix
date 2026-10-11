import json
import shutil
from copy import deepcopy
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.core.management.base import CommandError
from django.db import connection
from django.test import SimpleTestCase, TestCase, override_settings
from rest_framework.test import APIClient

from config.database import database_configuration
from .models import Anomaly, ImportReport, MLAnomalyDetection, Mission, Replay, ReplayEvent
from .record_serializers import LidarScanSerializer
from .tests import DATA_DIR, import_data

STAMP = '2026-09-01T18:00:00Z'


def inference_result():
    return {
        'schema_version': 1, 'model_id': 'gauge-detector-yolo11n',
        'model_sha256': 'a' * 64, 'source_sha256': 'b' * 64,
        'asset_id': 'AS_TEST', 'frame_id': '', 'captured_at': None,
        'processed_at': STAMP, 'inference_ms': 1.5,
        'status': 'NO_DETECTIONS', 'label': None, 'reason': 'Detection only.',
        'scores': {}, 'scores_are_calibrated': False, 'detections': [],
        'image_size': [96, 96], 'roi': None, 'requires_review': True,
        'quality_status': 'prototype_requires_review', 'value': None,
        'unit': None, 'temperature_c': None, 'hazard_severity': None,
    }


class GlobalCRUDTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.records = {}
        self.payloads = {}
        self.create('locations', {
            'location_id': 'L_TEST', 'location_name': 'Test bay', 'zone_type': 'INDOOR',
            'floor': 1, 'x_coord': '1.25', 'y_coord': '2.5', 'environment': 'INDOOR', 'synthetic': False,
        })
        self.create('assets', {
            'asset_id': 'AS_TEST', 'asset_name': 'Test pump', 'asset_type': 'PUMP',
            'location_id': 'L_TEST', 'criticality': 'HIGH', 'synthetic': False,
        })
        self.create('missions', {
            'mission_id': 'M_TEST', 'mission_name': 'Test inspection', 'scenario': 'BASELINE',
            'configuration_version': 'V1', 'start_time': STAMP, 'end_time': '2026-09-01T18:10:00Z',
            'duration_min': 10, 'start_battery_pct': 100, 'end_battery_pct': 90,
            'mission_status': 'COMPLETED', 'operator_mode': 'AUTONOMOUS', 'synthetic': False,
        })
        self.create('actions', {
            'action_id': 'A_TEST', 'mission_id': 'M_TEST', 'asset_id': 'AS_TEST', 'location_id': 'L_TEST',
            'sequence': 1, 'timestamp': STAMP, 'action_type': 'INSPECT', 'battery_pct': 99,
            'status': 'SUCCESS', 'failure_type': '', 'duration_sec': 15,
            'scenario': 'BASELINE', 'configuration_version': 'V1', 'synthetic': False,
        })

    def create(self, resource, payload):
        response = self.client.post(f'/api/records/{resource}', payload, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.records[resource] = response.json()
        self.payloads[resource] = deepcopy(payload)
        return response.json()

    def detail(self, resource, row=None):
        row = row or self.records[resource]
        key = {'locations': 'location_id', 'assets': 'asset_id', 'missions': 'mission_id',
               'actions': 'action_id', 'readings': 'reading_id', 'anomalies': 'anomaly_id'}.get(resource, 'id')
        return f'/api/records/{resource}/{row[key]}'

    def create_remaining(self):
        context = {'action_id': 'A_TEST', 'mission_id': 'M_TEST', 'asset_id': 'AS_TEST', 'location_id': 'L_TEST'}
        self.create('readings', {
            **context, 'reading_id': 'R_TEST', 'timestamp': STAMP, 'measurement_type': 'TEMPERATURE',
            'value': '21.5', 'unit': 'C', 'quality': 'GOOD', 'synthetic': False,
        })
        scan = self.create('lidar-scans', {
            'name': 'Test scan', 'captured_at': STAMP, 'point_cloud_uri': 's3://inspection/scan.ply',
            'file_format': 'ply', 'point_count': 42, 'mission_id': 'M_TEST', 'action_id': 'A_TEST',
            'location_id': 'L_TEST', 'metadata': {'sensor': 'spot'},
        })
        detection = self.create('ml-detections', {
            'asset_id': 'AS_TEST', 'mission_id': 'M_TEST', 'action_id': 'A_TEST',
            'lidar_scan_id': scan['id'], 'modality': 'image', 'result': inference_result(),
        })
        self.create('anomalies', {
            **context, 'anomaly_id': 'AN_TEST', 'timestamp': STAMP, 'anomaly_type': 'TEMPERATURE',
            'severity': 'HIGH', 'operator_review_required': True, 'description': 'Review pump',
            'synthetic': False, 'ml_detection_id': detection['id'],
        })
        replay = self.create('replays', {'name': 'Test replay', 'mission_id': 'M_TEST'})
        self.create('replay-events', {
            'event_id': 'E_TEST', 'replay_id': replay['id'], 'mission_id': 'M_TEST', 'action_id': 'A_TEST',
            'sequence': 1, 'timestamp': STAMP, 'event_type': 'ACTION_STARTED', 'details': {'action_id': 'A_TEST'},
        })
        self.create('import-reports', {
            'source_name': 'validation_results.json', 'source_sha256': 'c' * 64,
            'validation_status': 'PASS', 'generated_at': STAMP, 'report': {'counts': {'missions': 1}},
        })

    def test_every_resource_supports_anonymous_full_crud(self):
        self.create_remaining()
        updates = {
            'locations': {'location_name': 'Updated bay'}, 'assets': {'asset_name': 'Updated pump'},
            'missions': {'mission_name': 'Updated inspection'}, 'actions': {'duration_sec': 20},
            'readings': {'quality': 'REVIEW'}, 'lidar-scans': {'name': 'Updated scan'},
            'ml-detections': {'review_status': 'confirmed'}, 'anomalies': {'description': 'Reviewed pump'},
            'replays': {'name': 'Updated replay'}, 'replay-events': {'event_type': 'ACTION_COMPLETED'},
            'import-reports': {'source_name': 'reviewed.json'},
        }
        for resource in self.records:
            with self.subTest(resource=resource):
                listed = self.client.get(f'/api/records/{resource}?limit=1')
                self.assertEqual(listed.status_code, 200, listed.data)
                self.assertEqual(listed.json()['count'], 1)
                response = self.client.get(self.detail(resource))
                self.assertEqual(response.status_code, 200)
                self.assertNotIn('Set-Cookie', response)
                self.assertNotIn('user_id', response.json())
                patched = self.client.patch(self.detail(resource), updates[resource], format='json')
                self.assertEqual(patched.status_code, 200, patched.data)
                for key, value in updates[resource].items():
                    self.assertEqual(patched.json()[key], value)
                replaced = self.client.put(self.detail(resource), self.payloads[resource], format='json')
                self.assertEqual(replaced.status_code, 200, replaced.data)
        for resource in ('replay-events', 'replays', 'import-reports', 'anomalies', 'ml-detections',
                         'lidar-scans', 'readings', 'actions', 'missions', 'assets', 'locations'):
            response = self.client.delete(self.detail(resource))
            self.assertEqual(response.status_code, 204, response.data)
            self.assertEqual(self.client.get(self.detail(resource)).status_code, 404)

    def test_protected_deletion_and_parent_context_updates(self):
        self.create_remaining()
        for resource in ('locations', 'assets', 'missions', 'actions'):
            self.assertEqual(self.client.delete(self.detail(resource)).status_code, 409)
        for payload in ({'scenario': 'IMPROVED'}, {'end_time': '2026-08-01T00:00:00Z'}, {'start_battery_pct': 101}):
            response = self.client.patch(self.detail('missions'), payload, format='json')
            self.assertEqual(response.status_code, 400, response.data)
        response = self.client.patch(self.detail('actions'), {'status': 'FAILED'}, format='json')
        self.assertEqual(response.status_code, 400)
        response = self.client.patch(self.detail('readings'), {'location_id': 'missing'}, format='json')
        self.assertEqual(response.status_code, 400)
        other = {**self.payloads['missions'], 'mission_id': 'M_OTHER'}
        self.assertEqual(self.client.post('/api/records/missions', other, format='json').status_code, 201)
        for resource in ('actions', 'readings', 'anomalies', 'lidar-scans', 'ml-detections'):
            response = self.client.patch(self.detail(resource), {'mission_id': 'M_OTHER'}, format='json')
            self.assertEqual(response.status_code, 400, response.data)

    def test_primary_keys_duplicates_and_unknown_or_nonobject_payloads(self):
        response = self.client.post('/api/records/locations', self.payloads['locations'], format='json')
        self.assertEqual(response.status_code, 400)
        for payload in ({'location_id': 'changed'}, {'owner_id': 'not-allowed'}, [{'floor': 1}]):
            response = self.client.patch(self.detail('locations'), payload, format='json')
            self.assertEqual(response.status_code, 400, response.data)

    def test_exact_filters_pagination_and_invalid_filters(self):
        self.create_remaining()
        for resource, query in (
            ('assets', 'location_id=L_TEST'), ('actions', 'mission_id=M_TEST'),
            ('readings', 'action_id=A_TEST'), ('anomalies', 'severity=HIGH'),
            ('lidar-scans', 'location_id=L_TEST'), ('ml-detections', 'asset_id=AS_TEST'),
            ('replays', 'mission_id=M_TEST'), ('import-reports', 'validation_status=PASS'),
        ):
            response = self.client.get(f'/api/records/{resource}?{query}&limit=1')
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(response.json()['count'], 1)
        for url in ('locations?floor=abc', 'ml-detections?review_status=invalid', 'replay-events?replay_id=not-a-uuid'):
            self.assertEqual(self.client.get(f'/api/records/{url}').status_code, 400)

    def test_ml_payload_is_preserved_and_indexed_fields_are_derived(self):
        self.create_remaining()
        detection = self.records['ml-detections']
        self.assertEqual(detection['result'], inference_result())
        self.assertEqual(detection['model_id'], inference_result()['model_id'])
        self.assertEqual(detection['frame_id'], '')
        self.assertIsNone(detection['captured_at'])
        self.assertEqual(self.client.patch(self.detail('ml-detections'), {'model_id': 'tampered'}, format='json').json()['model_id'], detection['model_id'])
        for change in ({'asset_id': 'other'}, {'schema_version': 99}, {'model_sha256': 'invalid'},
                       {'scores': {'normal': 1.1}}, {'scores': {'normal': .3}}, {'inference_ms': -1},
                       {'detections': [{'label': 'gauge', 'score': .9, 'box_xyxy': [10, 10, 5, 5]}]}):
            result = {**inference_result(), **change}
            response = self.client.patch(self.detail('ml-detections'), {'result': result}, format='json')
            self.assertEqual(response.status_code, 400, response.data)
        response = self.client.patch(self.detail('lidar-scans'), {'metadata': []}, format='json')
        self.assertEqual(response.status_code, 400)
        response = self.client.patch(self.detail('ml-detections'), {'lidar_scan_id': 'not-a-uuid'}, format='json')
        self.assertEqual(response.status_code, 400)
        serializer = LidarScanSerializer(data={**self.payloads['lidar-scans'], 'metadata': {'bad': float('nan')}})
        self.assertFalse(serializer.is_valid())

    def test_optional_ml_links_are_cleared_without_deleting_findings(self):
        self.create_remaining()
        self.assertEqual(self.client.delete(self.detail('lidar-scans')).status_code, 204)
        detection = MLAnomalyDetection.objects.get(pk=self.records['ml-detections']['id'])
        self.assertIsNone(detection.lidar_scan_id)
        self.assertEqual(self.client.delete(self.detail('ml-detections')).status_code, 204)
        self.assertIsNone(Anomaly.objects.get(pk='AN_TEST').ml_detection_id)

    def test_replays_order_equal_timestamps_validate_context_and_cascade(self):
        self.create_remaining()
        first = self.records['replay-events']
        second = {**self.payloads['replay-events'], 'sequence': 2, 'event_id': 'E_SECOND'}
        self.create('replay-events', second)
        query = f"/api/records/replay-events?replay_id={first['replay_id']}&limit=1"
        self.assertEqual(self.client.get(query).json()['results'][0]['sequence'], 1)
        self.assertEqual(self.client.get(query + '&offset=1').json()['results'][0]['sequence'], 2)
        self.assertEqual(self.client.get(self.detail('replays')).json()['event_count'], 2)
        for change in ({'sequence': 1}, {'sequence': 0}, {'event_id': 'E_TEST'}, {'details': {'action_id': 'WRONG'}}):
            response = self.client.patch(self.detail('replay-events'), change, format='json')
            self.assertEqual(response.status_code, 400, response.data)
        other = {**self.payloads['missions'], 'mission_id': 'M_OTHER'}
        self.client.post('/api/records/missions', other, format='json')
        response = self.client.patch(self.detail('replay-events'), {'mission_id': 'M_OTHER'}, format='json')
        self.assertEqual(response.status_code, 400)
        response = self.client.patch(self.detail('replays'), {'mission_id': 'M_OTHER'}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.client.delete(self.detail('replays')).status_code, 204)
        self.assertEqual(ReplayEvent.objects.count(), 0)
        self.assertTrue(Mission.objects.filter(pk='M_TEST').exists())

    def test_accounts_are_not_installed_or_created(self):
        self.assertNotIn('django.contrib.auth', settings.INSTALLED_APPS)
        self.assertNotIn('auth_user', connection.introspection.table_names())
        self.assertNotIn('django_session', connection.introspection.table_names())
        self.assertEqual(self.client.get('/admin/').status_code, 404)

    def test_postgres_json_fields_are_jsonb(self):
        if connection.vendor != 'postgresql':
            self.skipTest('Requires PostgreSQL')
        with connection.cursor() as cursor:
            cursor.execute("SELECT data_type FROM information_schema.columns WHERE table_name=%s AND column_name=%s", ['api_replayevent', 'details'])
            self.assertEqual(cursor.fetchone()[0], 'jsonb')

    def test_model_summary_includes_unused_models_without_loading_weights(self):
        with patch('api.services.inference.load_model') as load, self.assertNumQueries(1):
            response = self.client.get('/api/records/ml-detections/summary')
        self.assertEqual(response.status_code, 200)
        load.assert_not_called()
        data = response.json()
        self.assertEqual(data['registered_model_count'], 4)
        self.assertEqual(data['total_models'], 4)
        self.assertEqual(data['total_detections'], 0)
        self.assertEqual(data['review_status_counts'], {'pending': 0, 'confirmed': 0, 'dismissed': 0})
        self.assertEqual([row['model_id'] for row in data['models']], sorted(row['model_id'] for row in data['models']))
        for row in data['models']:
            self.assertEqual(row['total_detections'], 0)
            self.assertEqual(row['status_counts'], {})
            self.assertEqual(row['label_counts'], {})
            self.assertIsNone(row['latest_processed_at'])
            self.assertEqual(row['model_id'], row['model']['id'])
            self.assertNotIn('path', row['model'])
        self.assertNotIn('Set-Cookie', response)
        self.assertEqual(self.client.post('/api/records/ml-detections/summary', {}, format='json').status_code, 405)

    def test_model_summary_aggregates_versions_reviews_labels_and_historical_ids(self):
        for change, review in (
            ({}, 'pending'),
            ({'model_sha256': 'd' * 64, 'label': 'gauge', 'status': 'DETECTED', 'processed_at': '2026-09-02T18:00:00Z'}, 'confirmed'),
            ({'model_id': 'historical-model', 'label': 'anomalous', 'status': 'CLASSIFIED'}, 'dismissed'),
        ):
            self.create('ml-detections', {
                'asset_id': 'AS_TEST', 'modality': 'image', 'result': {**inference_result(), **change},
                'review_status': review,
            })
        with self.assertNumQueries(1):
            response = self.client.get('/api/records/ml-detections/summary?limit=1')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['total_models'], 5)
        self.assertEqual(data['registered_model_count'], 4)
        self.assertEqual(data['total_detections'], 3)
        self.assertEqual(data['review_status_counts'], {'pending': 1, 'confirmed': 1, 'dismissed': 1})
        models = {row['model_id']: row for row in data['models']}
        gauge = models['gauge-detector-yolo11n']
        self.assertEqual(gauge['total_detections'], 2)
        self.assertEqual(gauge['status_counts'], {'DETECTED': 1, 'NO_DETECTIONS': 1})
        self.assertEqual(gauge['label_counts'], {'gauge': 1})
        self.assertEqual(gauge['unlabeled_count'], 1)
        self.assertEqual(gauge['modalities'], ['image'])
        self.assertEqual(gauge['latest_processed_at'], '2026-09-02T18:00:00Z')
        historical = models['historical-model']
        self.assertIsNone(historical['model'])
        self.assertEqual(historical['total_detections'], 1)
        self.assertEqual(historical['label_counts'], {'anomalous': 1})
        self.assertEqual(historical['review_status_counts']['dismissed'], 1)
        self.assertEqual(sum(row['total_detections'] for row in data['models']), data['total_detections'])

    def test_model_summary_returns_503_when_registry_unavailable(self):
        with TemporaryDirectory() as directory, override_settings(INFERENCE_MODEL_DIR=directory):
            with self.assertLogs('api.services.inference', level='ERROR'), self.assertNumQueries(0):
                response = self.client.get('/api/records/ml-detections/summary')
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), {'detail': 'Model registry unavailable.'})


class FullDatasetImportTests(TestCase):
    def test_replay_and_validation_report_are_preserved_and_idempotent(self):
        import_data()
        replay = Replay.objects.get()
        report = ImportReport.objects.get()
        source = [json.loads(line) for line in (DATA_DIR / 'replay.ndjson').read_text().splitlines()]
        self.assertEqual(replay.events.count(), 500)
        for sequence, (expected, actual) in enumerate(zip(source, replay.events.all()), 1):
            self.assertEqual(actual.sequence, sequence)
            self.assertEqual(actual.event_id, expected['event_id'])
            self.assertEqual(actual.details, expected['details'])
            self.assertEqual(actual.action_id, expected['details'].get('action_id'))
            self.assertEqual(actual.mission_id, expected['mission_id'])
        self.assertEqual(report.report, json.loads((DATA_DIR / 'validation_results.json').read_text()))
        self.assertEqual(report.validation_status, 'PASS')
        output = import_data()
        self.assertIn('replay_events: 0 created, 500 unchanged', output)
        self.assertIn('import_reports: 0 created, 1 unchanged', output)
        self.assertEqual(Replay.objects.count(), 1)

    def test_invalid_replay_rolls_back_all_objects(self):
        with TemporaryDirectory() as directory:
            target = Path(directory) / 'data'
            shutil.copytree(DATA_DIR, target)
            path = target / 'replay.ndjson'
            events = path.read_text().splitlines()
            event = json.loads(events[1])
            event['mission_id'] = 'MISSING'
            events[1] = json.dumps(event)
            path.write_text('\n'.join(events) + '\n')
            with self.assertRaisesRegex(CommandError, 'replay.ndjson: line 2'):
                import_data(target)
        for model in (Mission, Replay, ReplayEvent, ImportReport):
            self.assertEqual(model.objects.count(), 0)

    def test_replay_count_mismatch_rolls_back_all_objects(self):
        with TemporaryDirectory() as directory:
            target = Path(directory) / 'data'
            shutil.copytree(DATA_DIR, target)
            path = target / 'validation_results.json'
            validation = json.loads(path.read_text())
            validation['counts']['replay_events'] = 499
            path.write_text(json.dumps(validation))
            with self.assertRaisesRegex(CommandError, 'replay_events: imported 500 rows, expected 499'):
                import_data(target)
        self.assertEqual(Mission.objects.count(), 0)
        self.assertEqual(Replay.objects.count(), 0)

    def test_edited_imported_events_are_not_overwritten(self):
        import_data()
        event = ReplayEvent.objects.order_by('sequence').first()
        event.event_type = 'EDITED'
        event.save()
        with self.assertRaisesRegex(CommandError, 'Existing event has conflicting fields'):
            import_data()
        event.refresh_from_db()
        self.assertEqual(event.event_type, 'EDITED')


class RecordSchemaTests(SimpleTestCase):
    def test_swagger_documents_crud_and_global_access(self):
        client = APIClient()
        schema = client.get('/api/schema', HTTP_ACCEPT='application/json').json()
        for resource in ('locations', 'assets', 'missions', 'actions', 'readings', 'anomalies',
                         'lidar-scans', 'ml-detections', 'replays', 'replay-events', 'import-reports'):
            path = f'/api/records/{resource}'
            self.assertEqual(set(schema['paths'][path]), {'get', 'post'})
            detail = next(key for key in schema['paths'] if key.startswith(path + '/{'))
            self.assertEqual(set(schema['paths'][detail]), {'get', 'put', 'patch', 'delete'})
            self.assertIn('409', schema['paths'][detail]['delete']['responses'])
            self.assertIn({}, schema['paths'][path]['post'].get('security', [{}]))
        operation = schema['paths']['/api/records/ml-detections/summary']['get']
        self.assertEqual(operation['responses']['200']['content']['application/json']['schema'],
                         {'$ref': '#/components/schemas/MLDetectionSummary'})
        self.assertIn('503', operation['responses'])
        self.assertFalse(operation.get('parameters'))

    def test_database_configuration_defaults_to_postgres_and_decodes_url(self):
        base = Path('/tmp')
        default = database_configuration({}, base)
        self.assertEqual(default['ENGINE'], 'django.db.backends.postgresql')
        configured = database_configuration({'DATABASE_URL': 'postgres://test%40user:p%3Ass@localhost:5433/app%20db?sslmode=require&connect_timeout=9'}, base)
        self.assertEqual((configured['USER'], configured['PASSWORD'], configured['NAME'], configured['PORT']), ('test@user', 'p:ss', 'app db', '5433'))
        self.assertEqual(configured['OPTIONS'], {'sslmode': 'require', 'connect_timeout': 9})
        self.assertEqual(database_configuration({'DJANGO_DB_BACKEND': 'sqlite'}, base)['NAME'], base / 'db.sqlite3')
        for url in ('sqlite:///tmp/db', 'postgres://host', 'postgres://host/db?connect_timeout=0',
                    'postgres://host/db?sslmode=invalid', 'postgres://host/db?unknown=1'):
            with self.assertRaises(ImproperlyConfigured) as error:
                database_configuration({'DATABASE_URL': url}, base)
            self.assertNotIn(url, str(error.exception))
