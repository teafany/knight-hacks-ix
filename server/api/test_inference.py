from datetime import datetime, timezone
from io import BytesIO
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
import wave

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, override_settings
from PIL import Image
from rest_framework.test import APIClient

from .services.inference import (
    InferenceBusy, InferenceUnavailable, _worker, classification_result,
    decode_audio, decode_image, infer, load_model,
)


def frame_file(size=(96, 96), format='PNG'):
    buffer = BytesIO()
    Image.effect_noise(size, 60).convert('RGB').save(buffer, format=format)
    return SimpleUploadedFile('frame.png', buffer.getvalue(), content_type='image/png')


def wav_bytes(seconds=10, rate=16000, channels=1):
    buffer = BytesIO()
    with wave.open(buffer, 'wb') as output:
        output.setnchannels(channels)
        output.setsampwidth(2)
        output.setframerate(rate)
        output.writeframes(b'\x00\x00' * int(seconds * rate) * channels)
    return buffer.getvalue()


def result(asset_id='A', frame_id='1'):
    return {
        'schema_version': 1, 'model_id': 'gauge-detector-yolo11n',
        'model_sha256': 'a' * 64, 'source_sha256': 'b' * 64,
        'asset_id': asset_id, 'frame_id': frame_id, 'captured_at': None,
        'processed_at': datetime.now(timezone.utc), 'inference_ms': 1,
        'status': 'NO_DETECTIONS', 'label': None, 'reason': 'Detection only.',
        'scores': {}, 'detections': [], 'image_size': [96, 96], 'roi': None,
        'requires_review': True, 'scores_are_calibrated': False,
        'quality_status': 'prototype_requires_review', 'value': None,
        'unit': None, 'temperature_c': None, 'hazard_severity': None,
    }


class InferenceAPITests(SimpleTestCase):
    def setUp(self):
        self.client = APIClient()

    def post_frame(self, kind='gauge', **fields):
        return self.client.post(f'/api/inference/{kind}', {
            'image': frame_file(), 'asset_id': 'A', 'frame_id': '1', **fields,
        }, format='multipart')

    def test_separate_frame_requests_do_not_access_database_or_reuse_context(self):
        with patch('api.inference_views.infer', side_effect=lambda kind, data: result(data['asset_id'], data['frame_id'])) as run:
            first = self.post_frame().json()
            second = self.post_frame(asset_id='B', frame_id='2').json()
        self.assertEqual(run.call_count, 2)
        self.assertEqual((first['asset_id'], first['frame_id']), ('A', '1'))
        self.assertEqual((second['asset_id'], second['frame_id']), ('B', '2'))
        self.assertNotIn('Set-Cookie', self.client.get('/api/inference/models'))

    def test_missing_context_and_invalid_thresholds_reject_before_runtime(self):
        with patch('api.inference_views.infer') as run:
            self.assertEqual(self.client.post('/api/inference/gauge', {'image': frame_file()}, format='multipart').status_code, 400)
            for threshold in ('nan', 'inf', '-inf', '.2', '1.1'):
                with self.subTest(threshold=threshold):
                    self.assertEqual(self.post_frame(threshold=threshold).status_code, 400)
        run.assert_not_called()

    def test_corrosion_requires_one_crop_declaration_and_supported_category(self):
        with patch('api.inference_views.infer', return_value=result()) as run:
            for fields in ({}, {'asset_crop': 'true', 'roi': '[0,0,32,32]'},
                           {'roi': '[0,0,-1,32]'}, {'roi': '[0,0,32.5,32]'},
                           {'roi': '[false,0,32,32]'}, {'roi': 'not-json'}):
                with self.subTest(fields=fields):
                    self.assertEqual(self.post_frame('corrosion', asset_category='yoke-suspension', **fields).status_code, 400)
            self.assertEqual(self.post_frame('corrosion', asset_category='pump', asset_crop='true').status_code, 400)
            run.assert_not_called()
            self.assertEqual(self.post_frame('corrosion', asset_category='yoke-suspension', roi='[0,0,32,32]').status_code, 200)
            self.assertEqual(run.call_args.args[1]['roi'], [0, 0, 32, 32])
            self.assertEqual(self.post_frame('corrosion', asset_category='yoke-suspension', asset_crop='true').status_code, 200)

    def test_thermal_requires_compatibility_confirmation(self):
        with patch('api.inference_views.infer', return_value=result()) as run:
            for fields in ({}, {'compatible_thermogram': 'false'}):
                self.assertEqual(self.post_frame('thermal', **fields).status_code, 400)
            run.assert_not_called()
            self.assertEqual(self.post_frame('thermal', compatible_thermogram='true').status_code, 200)

    def test_acoustic_requires_both_domain_and_experimental_opt_in(self):
        with patch('api.inference_views.infer', return_value=result()) as run:
            for fields in ({}, {'compatible_pump_audio': 'true'}, {'allow_experimental': 'true'},
                           {'compatible_pump_audio': 'true', 'allow_experimental': 'false'}):
                upload = SimpleUploadedFile('clip.wav', wav_bytes())
                response = self.client.post('/api/inference/acoustic', {'asset_id': 'P', 'audio': upload, **fields}, format='multipart')
                self.assertEqual(response.status_code, 400)
            run.assert_not_called()
            response = self.client.post('/api/inference/acoustic', {
                'asset_id': 'P', 'audio': SimpleUploadedFile('clip.wav', wav_bytes()),
                'compatible_pump_audio': 'true', 'allow_experimental': 'true',
            }, format='multipart')
            self.assertEqual(response.status_code, 200)

    def test_structured_runtime_errors_and_busy_retry_header(self):
        for error, code in ((InferenceBusy('busy'), 429), (InferenceUnavailable('unavailable'), 503), (ValueError('invalid'), 400)):
            with self.subTest(code=code), patch('api.inference_views.infer', side_effect=error):
                response = self.post_frame()
                self.assertEqual(response.status_code, code)
                self.assertEqual(response.json(), {'detail': str(error)})
                if code == 429:
                    self.assertEqual(response['Retry-After'], '1')

    def test_oversized_upload_rejected_during_parsing(self):
        with override_settings(INFERENCE_MAX_UPLOAD_BYTES=128), patch('api.inference_views.infer') as run:
            response = self.post_frame()
        self.assertEqual(response.status_code, 400)
        self.assertIn('limit', response.json()['detail'])
        run.assert_not_called()

    def test_invalid_image_and_roi_outside_frame_rejected_without_loading(self):
        with patch('api.services.inference.load_model') as load:
            response = self.client.post('/api/inference/gauge', {
                'asset_id': 'A', 'image': SimpleUploadedFile('frame.jpg', b'not an image'),
            }, format='multipart')
            self.assertEqual(response.status_code, 400)
            self.assertEqual(self.post_frame('corrosion', asset_category='yoke-suspension', roi='[90,90,32,32]').status_code, 400)
        load.assert_not_called()

    def test_get_and_json_inputs_are_rejected(self):
        for kind in ('gauge', 'corrosion', 'thermal', 'acoustic'):
            self.assertEqual(self.client.get(f'/api/inference/{kind}').status_code, 405)
            self.assertEqual(self.client.post(f'/api/inference/{kind}', {'asset_id': 'A'}, format='json').status_code, 415)

    def test_registry_is_available_without_loading_models(self):
        with patch('api.services.inference.load_model') as load:
            response = self.client.get('/api/inference/models')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 4)
        self.assertTrue(all(row['checkpoint_present'] for row in response.json()))
        self.assertFalse(any('path' in row for row in response.json()))
        load.assert_not_called()

    def test_unavailable_registry_returns_503(self):
        with TemporaryDirectory() as directory, override_settings(INFERENCE_MODEL_DIR=directory), self.assertLogs('api.services.inference', level='ERROR'):
            self.assertEqual(self.client.get('/api/inference/models').status_code, 503)

    def test_swagger_and_schema_document_all_routes_and_binary_uploads(self):
        self.assertEqual(self.client.get('/api/docs').status_code, 200)
        self.assertEqual(self.client.get('/api/redoc').status_code, 200)
        schema = self.client.get('/api/schema', HTTP_ACCEPT='application/json').json()
        for kind in ('gauge', 'corrosion', 'thermal', 'acoustic'):
            operation = schema['paths'][f'/api/inference/{kind}']['post']
            self.assertIn('multipart/form-data', operation['requestBody']['content'])
            self.assertIn('429', operation['responses'])
            self.assertTrue(all(not requirement for requirement in operation.get('security', [])))
        self.assertEqual(schema['components']['schemas']['FrameRequest']['properties']['image']['format'], 'binary')
        for path in ('/api/health', '/api/metrics', '/api/missions', '/api/findings'):
            self.assertIn(path, schema['paths'])


class InferenceInputTests(SimpleTestCase):
    def test_decoding_limits_and_animated_images(self):
        with override_settings(INFERENCE_MAX_IMAGE_PIXELS=100):
            with self.assertRaisesRegex(ValueError, 'megapixel'):
                decode_image(frame_file().read())
        with self.assertRaisesRegex(ValueError, 'JPEG or PNG'):
            decode_image(frame_file(format='GIF').read())
        self.assertEqual(decode_image(frame_file().read()).size, (96, 96))

    def test_wav_requires_complete_window_and_supported_format(self):
        for raw in (b'invalid', wav_bytes(seconds=9), wav_bytes(seconds=11), wav_bytes(rate=8000), wav_bytes(channels=2)):
            with self.subTest(length=len(raw)), self.assertRaises(ValueError):
                decode_audio(raw)
        self.assertEqual(decode_audio(wav_bytes())[1], 1)
        self.assertEqual(decode_audio(wav_bytes(channels=8))[1], 8)
        with self.assertRaises(ValueError):
            decode_audio(wav_bytes()[:-2])

    def test_worker_rejects_concurrent_work_and_releases_after_failure(self):
        data = {'image': frame_file(), 'asset_id': 'A', 'frame_id': '', 'captured_at': None, 'threshold': .7}
        _worker.acquire()
        try:
            with self.assertRaises(InferenceBusy):
                infer('gauge', data)
        finally:
            _worker.release()
        data['image'] = frame_file()
        with patch('api.services.inference.load_model', side_effect=InferenceUnavailable('offline')):
            with self.assertRaises(InferenceUnavailable):
                infer('gauge', data)
        self.assertTrue(_worker.acquire(blocking=False))
        _worker.release()

    def test_corrupt_checkpoint_is_rejected_before_deserialization(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'gauge').mkdir()
            (root / 'gauge/model.pt').write_bytes(b'bad checkpoint')
            (root / 'registry.json').write_text(json.dumps({'models': [{'path': 'gauge/model.pt', 'sha256': '0' * 64}]}))
            # A lightweight fake module also verifies this guard on API-only installs.
            with patch.dict('sys.modules', {'torch': object()}), self.assertLogs('api.services.inference', level='ERROR'):
                with self.assertRaises(InferenceUnavailable):
                    load_model(str(root), 'gauge')

    def test_ambiguous_scores_abstain_and_experimental_audio_always_abstains(self):
        self.assertEqual(classification_result({'normal': .52, 'corrosion': .48}, 'corrosion', .5)['status'], 'REVIEW_REQUIRED')
        self.assertEqual(classification_result({'normal': .1, 'corrosion': .9}, 'corrosion', .7)['status'], 'CORROSION_SUSPECTED')
        self.assertEqual(classification_result({'normal': .01, 'anomalous': .99}, 'acoustic', .7)['label'], None)
        with self.assertRaises(InferenceUnavailable):
            classification_result({'normal': float('nan'), 'corrosion': .5}, 'corrosion', .7)
