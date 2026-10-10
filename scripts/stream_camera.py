"""Capture webcam or Spot images and submit independent REST inference requests."""
import argparse
from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import sys
from time import monotonic, sleep

import cv2
import numpy as np
import requests


def decode_spot_image(image):
    from bosdyn.api import image_pb2
    if image.pixel_format not in (
        image_pb2.Image.PIXEL_FORMAT_GREYSCALE_U8,
        image_pb2.Image.PIXEL_FORMAT_RGB_U8,
        image_pb2.Image.PIXEL_FORMAT_RGBA_U8,
    ):
        raise ValueError('Select an 8-bit visual/palette image source, not depth or raw radiometric data.')
    if image.format == image_pb2.Image.FORMAT_JPEG:
        frame = cv2.imdecode(np.frombuffer(image.data, dtype=np.uint8), cv2.IMREAD_COLOR)
        if frame is None:
            raise ValueError('Spot returned an invalid JPEG.')
        return frame
    if image.format != image_pb2.Image.FORMAT_RAW:
        raise ValueError('Unsupported Spot image encoding.')
    channels = {
        image_pb2.Image.PIXEL_FORMAT_GREYSCALE_U8: 1,
        image_pb2.Image.PIXEL_FORMAT_RGB_U8: 3,
        image_pb2.Image.PIXEL_FORMAT_RGBA_U8: 4,
    }[image.pixel_format]
    pixels = np.frombuffer(image.data, dtype=np.uint8).reshape(image.rows, image.cols, channels)
    conversion = {1: cv2.COLOR_GRAY2BGR, 3: cv2.COLOR_RGB2BGR, 4: cv2.COLOR_RGBA2BGR}[channels]
    return cv2.cvtColor(pixels, conversion)


class SpotCamera:
    def __init__(self, args):
        import bosdyn.client
        from bosdyn.client.image import ImageClient
        username = os.environ.get('BOSDYN_CLIENT_USERNAME')
        password = os.environ.get('BOSDYN_CLIENT_PASSWORD')
        if not username or not password:
            raise ValueError('Set BOSDYN_CLIENT_USERNAME and BOSDYN_CLIENT_PASSWORD in the client environment.')
        sdk = bosdyn.client.create_standard_sdk('facility-inspection-camera')
        self.robot = sdk.create_robot(args.spot_host)
        try:
            self.robot.authenticate(username, password, timeout=args.timeout)
            self.robot.sync_with_directory()
            self.client = self.robot.ensure_client(args.spot_service or ImageClient.default_service_name)
        except Exception:
            self.robot.shutdown()
            raise
        self.source = args.spot_image_source
        self.timeout = args.timeout

    def read(self):
        responses = self.client.get_image_from_sources([self.source], timeout=self.timeout)
        if len(responses) != 1:
            raise ValueError('Spot did not return one camera frame.')
        return decode_spot_image(responses[0].shot.image)

    def close(self):
        self.robot.shutdown()


class LocalCamera:
    def __init__(self, source):
        self.capture = cv2.VideoCapture(int(source) if source.isdecimal() else source)
        self.capture.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        if not self.capture.isOpened():
            self.capture.release()
            raise ValueError('Cannot open local camera/video source.')

    def read(self):
        success, frame = self.capture.read()
        if not success:
            raise ValueError('Camera stopped returning frames.')
        return frame

    def close(self):
        self.capture.release()


def arguments(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--api', default='http://127.0.0.1:8000/api')
    parser.add_argument('--model', choices=['gauge', 'corrosion', 'thermal'], default='gauge')
    parser.add_argument('--source', default='0', help='Webcam index, local video path, or spot.')
    parser.add_argument('--asset-id', required=True)
    parser.add_argument('--fps', type=float, default=2, help='Maximum inference requests per second.')
    parser.add_argument('--threshold', type=float, default=.7)
    parser.add_argument('--timeout', type=float, default=30)
    parser.add_argument('--frames', type=int, default=0, help='Stop after this many captures; zero runs until Ctrl+C.')
    parser.add_argument('--preview', action='store_true')
    parser.add_argument('--rotate', type=int, choices=[0, 90, 180, 270], default=0)
    parser.add_argument('--asset-crop', action='store_true')
    parser.add_argument('--roi', type=int, nargs=4, metavar=('X', 'Y', 'WIDTH', 'HEIGHT'))
    parser.add_argument('--compatible-thermogram', action='store_true')
    parser.add_argument('--spot-host')
    parser.add_argument('--spot-service', default='image')
    parser.add_argument('--spot-image-source', default='frontleft_fisheye_image')
    parser.add_argument('--list-spot-sources', action='store_true')
    args = parser.parse_args(argv)
    if (not math.isfinite(args.fps) or not 0 < args.fps <= 30 or
            not math.isfinite(args.timeout) or args.timeout <= 0 or args.frames < 0 or
            not math.isfinite(args.threshold) or not .5 <= args.threshold <= 1):
        parser.error('fps must be 0..30, timeout positive, frames nonnegative and threshold .5..1.')
    if args.source == 'spot' and not args.spot_host:
        parser.error('--spot-host is required for Spot.')
    if args.list_spot_sources and args.source != 'spot':
        parser.error('--list-spot-sources requires --source spot.')
    if args.model == 'corrosion' and not args.list_spot_sources:
        if args.asset_crop == (args.roi is not None):
            parser.error('Corrosion requires exactly one of --asset-crop or --roi.')
    if args.roi is not None and (min(args.roi[:2]) < 0 or min(args.roi[2:]) < 1):
        parser.error('ROI needs a nonnegative origin and positive dimensions.')
    if args.model == 'thermal' and not args.compatible_thermogram and not args.list_spot_sources:
        parser.error('Thermal requires --compatible-thermogram and a compatible thermal camera source.')
    return args


def run(args):
    camera = SpotCamera(args) if args.source == 'spot' else LocalCamera(args.source)
    try:
        if args.list_spot_sources:
            for source in camera.client.list_image_sources(timeout=args.timeout):
                print(source.name)
            return
        with requests.Session() as session:
            index, next_request = 0, monotonic()
            while not args.frames or index < args.frames:
                # Drain local frames between requests instead of building an upload queue.
                if args.source == 'spot' or Path(args.source).is_file():
                    sleep(max(0, next_request - monotonic()))
                frame = camera.read()
                if monotonic() < next_request:
                    sleep(.005)
                    continue
                captured_at = datetime.now(timezone.utc).isoformat()
                if args.rotate:
                    frame = cv2.rotate(frame, {90: cv2.ROTATE_90_CLOCKWISE,
                                              180: cv2.ROTATE_180,
                                              270: cv2.ROTATE_90_COUNTERCLOCKWISE}[args.rotate])
                success, encoded = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
                if not success:
                    raise ValueError('Cannot encode camera frame.')
                fields = {'asset_id': args.asset_id, 'frame_id': str(index),
                          'captured_at': captured_at, 'threshold': str(args.threshold)}
                if args.model == 'corrosion':
                    fields['asset_category'] = 'yoke-suspension'
                    if args.asset_crop:
                        fields['asset_crop'] = 'true'
                    else:
                        fields['roi'] = json.dumps(args.roi)
                if args.model == 'thermal':
                    fields['compatible_thermogram'] = 'true'
                response = session.post(f'{args.api.rstrip("/")}/inference/{args.model}', data=fields,
                                        files={'image': ('frame.jpg', encoded.tobytes(), 'image/jpeg')},
                                        timeout=args.timeout)
                if response.status_code == 429:
                    next_request = monotonic() + max(1, 1 / args.fps)
                    print('Worker busy; dropping frame.', file=sys.stderr)
                else:
                    if not response.ok:
                        raise ValueError(f'Inference HTTP {response.status_code}: {response.text[:1000]}')
                    result = response.json()
                    print(json.dumps(result, allow_nan=False), flush=True)
                    next_request = monotonic() + 1 / args.fps
                    if args.preview:
                        for detection in result['detections']:
                            x1, y1, x2, y2 = map(round, detection['box_xyxy'])
                            cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 220, 80), 2)
                        cv2.putText(frame, result['status'], (12, 28), cv2.FONT_HERSHEY_SIMPLEX,
                                    .7, (0, 220, 80), 2)
                        cv2.imshow('Camera inference', frame)
                        if cv2.waitKey(1) & 0xff == ord('q'):
                            break
                index += 1
    finally:
        camera.close()
        if args.preview:
            cv2.destroyAllWindows()


def main():
    try:
        run(arguments())
    except KeyboardInterrupt:
        return 0
    except Exception as exc:
        print(f'{type(exc).__name__}: {exc}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
