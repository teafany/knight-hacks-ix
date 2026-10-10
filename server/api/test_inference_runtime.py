"""Optional transport smoke tests with real registered weights, not accuracy tests."""
from io import BytesIO
import importlib.util
from tempfile import TemporaryDirectory
from unittest import skipUnless
from unittest.mock import patch
import wave

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase
from rest_framework.test import APIClient

from .test_inference import frame_file


@skipUnless(all(importlib.util.find_spec(name) for name in ('torch', 'torchvision', 'ultralytics', 'numpy')),
            'Install server/requirements-inference.txt for checkpoint smoke tests.')
class CheckpointRuntimeTests(SimpleTestCase):
    def test_all_registered_checkpoints_execute_through_rest_without_database(self):
        import numpy as np
        client = APIClient()
        with TemporaryDirectory() as directory, patch.dict('os.environ', {
            'YOLO_CONFIG_DIR': directory, 'MPLCONFIGDIR': directory,
        }):
            for kind, fields in (
                ('gauge', {}),
                ('corrosion', {'asset_category': 'yoke-suspension', 'asset_crop': 'true'}),
                ('thermal', {'compatible_thermogram': 'true'}),
            ):
                with self.subTest(kind=kind):
                    response = client.post(f'/api/inference/{kind}', {
                        'asset_id': 'SMOKE-01', 'frame_id': kind, 'image': frame_file(size=(224, 224)), **fields,
                    }, format='multipart')
                    self.assertEqual(response.status_code, 200, response.content)
                    row = response.json()
                    self.assertEqual(row['frame_id'], kind)
                    self.assertTrue(row['requires_review'])
                    self.assertIsNone(row['value'])
                    self.assertIsNone(row['temperature_c'])
                    self.assertEqual(len(row['model_sha256']), 64)
                    if kind != 'gauge':
                        self.assertAlmostEqual(sum(row['scores'].values()), 1, places=5)
            # A synthetic audible waveform exercises the original log-mel frontend.
            buffer = BytesIO()
            pcm = (2000 * np.sin(2 * np.pi * 440 * np.arange(160000) / 16000)).astype('<i2')
            with wave.open(buffer, 'wb') as output:
                output.setnchannels(1)
                output.setsampwidth(2)
                output.setframerate(16000)
                output.writeframes(pcm.tobytes())
            response = client.post('/api/inference/acoustic', {
                'asset_id': 'SMOKE-PUMP', 'audio': SimpleUploadedFile('pump.wav', buffer.getvalue()),
                'compatible_pump_audio': 'true', 'allow_experimental': 'true',
            }, format='multipart')
            self.assertEqual(response.status_code, 200, response.content)
            self.assertEqual(response.json()['status'], 'REVIEW_REQUIRED')
            self.assertIsNone(response.json()['label'])
            self.assertEqual(set(response.json()['scores']), {'normal', 'anomalous'})
