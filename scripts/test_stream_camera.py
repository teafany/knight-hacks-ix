from io import BytesIO
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from bosdyn.api import image_pb2
import numpy as np
from PIL import Image

from stream_camera import SpotCamera, arguments, decode_spot_image, run


class CameraClientTests(unittest.TestCase):
    def test_spot_decodes_raw_rgb_with_correct_color_order(self):
        image = image_pb2.Image(rows=1, cols=2, format=image_pb2.Image.FORMAT_RAW,
                               pixel_format=image_pb2.Image.PIXEL_FORMAT_RGB_U8,
                               data=bytes([255, 0, 0, 0, 0, 255]))
        self.assertEqual(decode_spot_image(image).tolist(), [[[0, 0, 255], [255, 0, 0]]])

    def test_spot_decodes_jpeg_and_rejects_depth(self):
        buffer = BytesIO()
        Image.new('RGB', (16, 16), 'red').save(buffer, format='JPEG')
        image = image_pb2.Image(format=image_pb2.Image.FORMAT_JPEG,
                               pixel_format=image_pb2.Image.PIXEL_FORMAT_RGB_U8, data=buffer.getvalue())
        self.assertEqual(decode_spot_image(image).shape, (16, 16, 3))
        image.pixel_format = image_pb2.Image.PIXEL_FORMAT_DEPTH_U16
        with self.assertRaisesRegex(ValueError, 'depth'):
            decode_spot_image(image)

    def test_spot_connects_via_sdk_and_uses_selected_image_service(self):
        args = arguments(['--source', 'spot', '--spot-host', 'robot', '--asset-id', 'A',
                          '--spot-service', 'payload-image', '--spot-image-source', 'palette'])
        with patch.dict('os.environ', {'BOSDYN_CLIENT_USERNAME': 'test', 'BOSDYN_CLIENT_PASSWORD': 'test'}), patch('bosdyn.client.create_standard_sdk') as create:
            robot = create.return_value.create_robot.return_value
            camera = SpotCamera(args)
            robot.authenticate.assert_called_once_with('test', 'test', timeout=30)
            robot.sync_with_directory.assert_called_once_with()
            robot.ensure_client.assert_called_once_with('payload-image')
            camera.client.get_image_from_sources.return_value = [SimpleNamespace(shot=SimpleNamespace(image='pixels'))]
            with patch('stream_camera.decode_spot_image', return_value='frame'):
                self.assertEqual(camera.read(), 'frame')
            camera.client.get_image_from_sources.assert_called_once_with(['palette'], timeout=30)
            camera.close()
            robot.shutdown.assert_called_once_with()

    def test_one_capture_submits_complete_independent_context_and_releases_camera(self):
        args = arguments(['--asset-id', 'YOKE-01', '--model', 'corrosion', '--roi', '0', '0', '32', '32', '--frames', '1'])
        with patch('stream_camera.LocalCamera') as source, patch('stream_camera.requests.Session') as connection:
            source.return_value.read.return_value = np.zeros((64, 64, 3), dtype=np.uint8)
            session = connection.return_value.__enter__.return_value
            response = session.post.return_value
            response.status_code = 200
            response.ok = True
            response.json.return_value = {'status': 'REVIEW_REQUIRED'}
            with patch('builtins.print'):
                run(args)
            fields = session.post.call_args.kwargs['data']
            self.assertEqual(fields['roi'], '[0, 0, 32, 32]')
            self.assertEqual(fields['asset_id'], 'YOKE-01')
            self.assertEqual(fields['asset_category'], 'yoke-suspension')
            self.assertEqual(fields['frame_id'], '0')
            self.assertIn('captured_at', fields)
            source.return_value.close.assert_called_once_with()

    def test_busy_worker_drops_frame_without_resubmitting_it(self):
        args = arguments(['--asset-id', 'A', '--frames', '1'])
        with patch('stream_camera.LocalCamera') as source, patch('stream_camera.requests.Session') as connection, patch('builtins.print'):
            source.return_value.read.return_value = np.zeros((64, 64, 3), dtype=np.uint8)
            response = connection.return_value.__enter__.return_value.post.return_value
            response.status_code = 429
            run(args)
            connection.return_value.__enter__.return_value.post.assert_called_once()
            source.return_value.close.assert_called_once_with()

    def test_bad_domain_options_reject_before_capture(self):
        for options in (['--model', 'thermal'], ['--model', 'corrosion'], ['--source', 'spot']):
            with self.subTest(options=options), patch('sys.stderr'), self.assertRaises(SystemExit):
                arguments(['--asset-id', 'A', *options])


if __name__ == '__main__':
    unittest.main()
