from django.test import SimpleTestCase
from rest_framework.test import APIClient


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
