from django.test import SimpleTestCase
from rest_framework.test import APIClient
import csv
import json
from decimal import Decimal
from io import StringIO
from pathlib import Path
import shutil
from tempfile import TemporaryDirectory
from datetime import timezone as datetime_timezone

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from .models import Action, Anomaly, Asset, ImportReport, Location, Mission, Reading, Replay

DATA_DIR = settings.BASE_DIR.parent / 'SPOT_KnightHacks_Challenge_Kit Part One' / '02_DATA'


def import_data(data_dir=DATA_DIR, **kwargs):
    output = StringIO()
    call_command('import_challenge_data', data_dir=data_dir, stdout=output, **kwargs)
    return output.getvalue()


class HealthEndpointTests(SimpleTestCase):
    def setUp(self):
        self.client = APIClient()

    def test_health_returns_expected_json_without_redirect(self):
        response = self.client.get('/api/health')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'application/json')
        self.assertEqual(response.json(), {'status': 'ok', 'service': 'server'})

    def test_health_rejects_post(self):
        response = self.client.post('/api/health', {}, format='json')
        self.assertEqual(response.status_code, 405)

    def test_react_origin_is_allowed(self):
        response = self.client.get('/api/health', HTTP_ORIGIN='http://localhost:5173')
        self.assertEqual(response['Access-Control-Allow-Origin'], 'http://localhost:5173')

    def test_other_origins_are_not_allowed(self):
        response = self.client.get('/api/health', HTTP_ORIGIN='https://example.com')
        self.assertNotIn('Access-Control-Allow-Origin', response)


class ImportTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        import_data()

    def test_counts_and_repeat_import(self):
        expected = json.loads((DATA_DIR / 'validation_results.json').read_text())['counts']
        output = import_data()
        for name, model in [('missions', Mission), ('actions', Action), ('readings', Reading),
                            ('anomalies', Anomaly), ('locations', Location), ('assets', Asset)]:
            self.assertEqual(model.objects.count(), expected[name])
            self.assertIn(f'{name}: 0 created, {expected[name]} unchanged', output)

    def test_values_relationships_and_timestamps_preserved(self):
        action = Action.objects.get(pk='A0001')
        self.assertEqual(action.timestamp.isoformat(), '2026-09-01T18:03:06+00:00')
        self.assertEqual(action.mission_id, 'M001')
        self.assertEqual(action.asset_id, 'HX-201')
        self.assertTrue(action.synthetic)
        self.assertEqual(Location.objects.get(pk='WP01').x_coord, Decimal('15.7'))
        self.assertFalse(Anomaly.objects.get(pk='AN001').operator_review_required)
        for reading in Reading.objects.select_related('action'):
            self.assertEqual(reading.mission_id, reading.action.mission_id)
            self.assertEqual(reading.asset_id, reading.action.asset_id)
            self.assertEqual(reading.location_id, reading.action.location_id)
        # Source contains different asset/action locations; neither is rewritten.
        self.assertEqual(sum(action.location_id != action.asset.location_id
                             for action in Action.objects.select_related('asset')), 61)

    def changed_dataset(self, directory, filename, mutate):
        target = Path(directory) / 'data'
        shutil.copytree(DATA_DIR, target)
        path = target / filename
        with path.open(newline='') as source:
            reader = csv.DictReader(source)
            fields = reader.fieldnames
            rows = list(reader)
        mutate(rows)
        with path.open('w', newline='') as destination:
            writer = csv.DictWriter(destination, fieldnames=fields)
            writer.writeheader()
            writer.writerows(rows)
        return target

    def test_conflicting_id_rolls_back_new_records_without_overwriting(self):
        def change(rows):
            new = dict(rows[0], location_id='WP_NEW')
            rows.insert(0, new)
            rows[1]['location_name'] = 'Changed source name'
        with TemporaryDirectory() as directory:
            target = self.changed_dataset(directory, 'locations.csv', change)
            with self.assertRaisesRegex(CommandError, r'locations.csv: row 3.*conflicting fields'):
                import_data(target)
        self.assertFalse(Location.objects.filter(pk='WP_NEW').exists())
        self.assertEqual(Location.objects.get(pk='WP01').location_name, 'Main Entrance')

    def test_duplicate_source_id_rejected(self):
        with TemporaryDirectory() as directory:
            target = self.changed_dataset(directory, 'locations.csv', lambda rows: rows.append(rows[0].copy()))
            with self.assertRaisesRegex(CommandError, 'Duplicate source ID'):
                import_data(target)

    def test_invalid_boolean_rejected_with_row_context(self):
        with TemporaryDirectory() as directory:
            target = self.changed_dataset(directory, 'anomalies.csv', lambda rows: rows[0].update(operator_review_required='maybe'))
            with self.assertRaisesRegex(CommandError, r'anomalies.csv: row 2.*must be True or False'):
                import_data(target)

    def test_missing_foreign_key_rolls_back_entire_first_import(self):
        # Remove records in this isolated test database, respecting PROTECT.
        for model in [Replay, ImportReport, Reading, Anomaly, Action, Asset, Mission, Location]:
            model.objects.all().delete()
        with TemporaryDirectory() as directory:
            target = self.changed_dataset(directory, 'readings.csv', lambda rows: rows[0].update(action_id='MISSING'))
            with self.assertRaisesRegex(CommandError, r'readings.csv: row 2.*action.*MISSING.*not a valid choice'):
                import_data(target)
        for model in [Replay, ImportReport, Reading, Anomaly, Action, Asset, Mission, Location]:
            self.assertEqual(model.objects.count(), 0)

    def test_mismatched_relationship_rejected(self):
        for model in [Replay, ImportReport, Reading, Anomaly, Action, Asset, Mission, Location]:
            model.objects.all().delete()
        with TemporaryDirectory() as directory:
            target = self.changed_dataset(directory, 'readings.csv', lambda rows: rows[0].update(mission_id='M001'))
            with self.assertRaisesRegex(CommandError, 'mission_id does not match'):
                import_data(target)
        self.assertEqual(Mission.objects.count(), 0)

    def test_validation_counts_mismatch_rolls_back(self):
        with TemporaryDirectory() as directory:
            target = Path(directory) / 'data'
            shutil.copytree(DATA_DIR, target)
            validation = json.loads((target / 'validation_results.json').read_text())
            validation['counts']['readings'] = 999
            (target / 'validation_results.json').write_text(json.dumps(validation))
            with self.assertRaisesRegex(CommandError, 'readings: imported 220 rows, expected 999'):
                import_data(target)


class SourceTimezoneTests(TestCase):
    def test_explicit_timezone_is_applied_without_changing_wall_clock(self):
        import_data(source_timezone='America/New_York')
        timestamp = Action.objects.get(pk='A0001').timestamp
        self.assertEqual(timestamp.astimezone(datetime_timezone.utc).isoformat(), '2026-09-01T22:03:06+00:00')
        with self.assertRaisesRegex(CommandError, 'Unknown --source-timezone'):
            import_data(source_timezone='invalid/timezone')


class DashboardAPITests(TestCase):
    @classmethod
    def setUpTestData(cls):
        import_data()

    def setUp(self):
        self.client = APIClient()

    def test_metrics_match_supplied_validation(self):
        response = self.client.get('/api/metrics')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        expected = json.loads((DATA_DIR / 'validation_results.json').read_text())['metrics']
        for scenario in ['BASELINE', 'IMPROVED']:
            for metric in ['mission_completion_pct', 'action_success_pct']:
                self.assertEqual(data['by_scenario'][scenario][metric], expected[f'{scenario.lower()}_{metric}'])
        self.assertEqual(data['wp05_navigation_failure_pct'], expected['wp05_navigation_failure_pct'])
        self.assertEqual(data['total_missions'], 27)
        self.assertEqual(data['total_actions'], 270)
        self.assertEqual(data['total_readings'], 220)
        self.assertEqual(data['total_anomalies'], 40)
        self.assertEqual(sum(data['anomalies_by_severity'].values()), 40)
        self.assertEqual(sum(row['failed_actions'] for row in data['failures_by_location']), data['failed_actions'])
        self.assertEqual(data['data_source'], 'synthetic_challenge')
        self.assertIsNotNone(data['latest_record_at'])

    def test_mission_outcome_and_action_success_are_separate(self):
        data = self.client.get('/api/missions').json()
        self.assertEqual(data['count'], 27)
        mission = next(row for row in data['results'] if row['mission_id'] == 'M001')
        self.assertEqual(mission['mission_status'], 'COMPLETED')
        self.assertGreater(mission['failed_actions'], 0)
        self.assertEqual(mission['total_actions'], mission['successful_actions'] + mission['failed_actions'])
        self.assertEqual(mission['battery_used_pct'], 67)
        self.assertTrue(mission['synthetic'])

    def test_mission_filters_and_stable_pagination(self):
        first = self.client.get('/api/missions?scenario=IMPROVED&limit=2').json()
        second = self.client.get('/api/missions?scenario=IMPROVED&limit=2&offset=2').json()
        self.assertEqual(first['count'], 9)
        self.assertEqual(len(first['results']), 2)
        self.assertTrue(all(row['scenario'] == 'IMPROVED' for row in first['results']))
        self.assertTrue({row['mission_id'] for row in first['results']}.isdisjoint(row['mission_id'] for row in second['results']))
        failed = self.client.get('/api/missions?mission_status=FAILED').json()
        self.assertEqual(failed['count'], Mission.objects.filter(mission_status='FAILED').count())

    def test_findings_join_names_filters_and_detail(self):
        query = '/api/findings?severity=CRITICAL&operator_review_required=true'
        data = self.client.get(query).json()
        self.assertEqual(data['count'], Anomaly.objects.filter(severity='CRITICAL', operator_review_required=True).count())
        for row in data['results']:
            self.assertEqual(row['severity'], 'CRITICAL')
            self.assertTrue(row['operator_review_required'])
            self.assertTrue(row['asset_name'])
            self.assertTrue(row['location_name'])
        detail = self.client.get('/api/findings/AN001')
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.json()['anomaly_id'], 'AN001')
        self.assertEqual(self.client.get('/api/findings/missing').status_code, 404)
        mission = self.client.get('/api/findings?mission_id=M015').json()
        self.assertEqual(mission['count'], Anomaly.objects.filter(mission_id='M015').count())

    def test_invalid_filters_return_400(self):
        for url in ['/api/missions?scenario=unknown', '/api/missions?mission_status=unknown',
                    '/api/findings?severity=unknown', '/api/findings?operator_review_required=maybe']:
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, 400)

    def test_omitted_review_filter_includes_both_boolean_values(self):
        data = self.client.get('/api/findings').json()
        self.assertEqual(data['count'], Anomaly.objects.count())
        self.assertEqual({row['operator_review_required'] for row in data['results']}, {True, False})

    def test_explicit_false_review_filter_is_respected(self):
        data = self.client.get('/api/findings?operator_review_required=false').json()
        self.assertEqual(data['count'], Anomaly.objects.filter(operator_review_required=False).count())
        self.assertTrue(data['results'])
        self.assertTrue(all(row['operator_review_required'] is False for row in data['results']))

    def test_dashboard_endpoints_are_read_only(self):
        for url in ['/api/missions', '/api/findings', '/api/findings/AN001', '/api/metrics']:
            with self.subTest(url=url):
                self.assertEqual(self.client.post(url, {}, format='json').status_code, 405)


class EmptyDashboardTests(TestCase):
    def test_empty_metrics_have_null_percentages(self):
        response = self.client.get('/api/metrics')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['total_missions'], 0)
        self.assertIsNone(data['mission_completion_pct'])
        self.assertIsNone(data['action_success_pct'])
        self.assertIsNone(data['latest_record_at'])
        self.assertIsNone(data['wp05_navigation_failure_pct'])
        self.assertEqual(self.client.get('/api/missions').json()['results'], [])
