"""Request-local inputs/results with immutable, lazily loaded model weights."""
from functools import lru_cache
import hashlib
from io import BytesIO
import json
import logging
from pathlib import Path
from threading import BoundedSemaphore
from time import perf_counter
import warnings
import wave

from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)
_worker = BoundedSemaphore(1)
ACOUSTIC_PREPROCESS = 'pcm16_16k_channel0_10s_htkmel64_fft1024_hop512_top80_resize224_v1'
MODEL_TASKS = {
    'corrosion': 'insplad_corrosion_classifier',
    'thermal': 'induction_motor_thermal_condition_classifier',
    'acoustic': 'pump_acoustic_normal_anomaly_classifier',
}


class InferenceUnavailable(Exception):
    pass


class InferenceBusy(Exception):
    pass


def registry():
    root = Path(settings.INFERENCE_MODEL_DIR).resolve()
    try:
        entries = json.loads((root / 'registry.json').read_text())['models']
        result = {}
        for entry in entries:
            kind = entry['path'].split('/')[0]
            if kind in {'gauge', *MODEL_TASKS}:
                if kind in result:
                    raise ValueError('Duplicate model kind')
                for key in ('path', 'metadata'):
                    if not (root / entry[key]).resolve().is_relative_to(root):
                        raise ValueError('Model path outside registry directory')
                result[kind] = entry
        return root, result
    except (OSError, ValueError, KeyError, TypeError) as exc:
        logger.exception('Cannot read inference registry')
        raise InferenceUnavailable('Model registry unavailable.') from exc


def list_models():
    root, entries = registry()
    return [
        {
            'id': entry['id'], 'modality': 'audio' if kind == 'acoustic' else 'image',
            'endpoint': f'/api/inference/{kind}', 'architecture': entry['architecture'],
            'classes': entry['classes'], 'sha256': entry['sha256'], 'scope': entry['scope'],
            'quality_status': entry.get('quality_status', 'prototype_requires_review'),
            'checkpoint_present': (root / entry['path']).is_file(),
        }
        for kind, entry in entries.items()
    ]


@lru_cache(maxsize=4)
def load_model(root, kind):
    """Called only while the worker semaphore is held; YOLO predictors are mutable."""
    try:
        import torch
        root = Path(root)
        entries = json.loads((root / 'registry.json').read_text())['models']
        entry = next(row for row in entries if row['path'].split('/')[0] == kind)
        filename = (root / entry['path']).resolve()
        if not filename.is_relative_to(root.resolve()):
            raise ValueError('Checkpoint path outside registry directory')
        with filename.open('rb') as source:
            checksum = hashlib.file_digest(source, 'sha256').hexdigest()
        if checksum != entry['sha256']:
            raise ValueError('Checkpoint checksum mismatch')
        torch.set_num_threads(min(4, torch.get_num_threads()))
        if kind == 'gauge':
            from ultralytics import YOLO
            # Only the checksum-verified repository checkpoint reaches YOLO's loader.
            network = YOLO(str(filename), task='detect')
            if [network.names[i] for i in range(len(network.names))] != entry['classes']:
                raise ValueError('Gauge class order differs from registry')
            return network, entry
        from torchvision.models import resnet18
        checkpoint = torch.load(filename, map_location='cpu', weights_only=True)
        preprocess = ACOUSTIC_PREPROCESS if kind == 'acoustic' else 'letterbox224_imagenet_v1'
        if (checkpoint.get('task') != MODEL_TASKS[kind] or
                checkpoint.get('architecture') != 'resnet18' or
                checkpoint.get('classes') != entry['classes'] or
                checkpoint.get('preprocess') != preprocess or
                checkpoint.get('run_kind') != 'full'):
            raise ValueError('Checkpoint task/classes/preprocessing mismatch')
        network = resnet18(weights=None)
        network.fc = torch.nn.Linear(network.fc.in_features, len(entry['classes']))
        state = checkpoint['state_dict']
        if not all(torch.isfinite(value).all().item() for value in state.values()):
            raise ValueError('Nonfinite checkpoint weights')
        network.load_state_dict(state, strict=True)
        return network.eval(), entry
    except Exception as exc:
        logger.exception('Cannot load %s inference model', kind)
        raise InferenceUnavailable(
            f'{kind.capitalize()} model unavailable. Install server/requirements-inference.txt '
            'and verify the registered checkpoints. See server logs for details.'
        ) from exc


def decode_image(raw):
    from PIL import Image, ImageOps, UnidentifiedImageError
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(BytesIO(raw)) as image:
                if image.format not in {'JPEG', 'PNG'}:
                    raise ValueError('Image must be JPEG or PNG.')
                if image.width * image.height > settings.INFERENCE_MAX_IMAGE_PIXELS:
                    raise ValueError('Image exceeds the 16 megapixel limit.')
                if getattr(image, 'n_frames', 1) != 1:
                    raise ValueError('Upload one still frame per request.')
                return ImageOps.exif_transpose(image).convert('RGB')
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise ValueError('Invalid or oversized image payload.') from exc


def image_tensor(image):
    from PIL import Image, ImageOps
    from torchvision.transforms import functional as transforms
    image = ImageOps.pad(image, (224, 224), method=Image.Resampling.BILINEAR, color=(127, 127, 127))
    return transforms.normalize(transforms.to_tensor(image), [.485, .456, .406], [.229, .224, .225])


@lru_cache(maxsize=1)
def acoustic_frontend():
    import numpy as np
    frequencies = np.fft.rfftfreq(1024, 1 / 16000)
    edges = 700 * (10 ** (np.linspace(0, 2595 * np.log10(1 + 8000 / 700), 66) / 2595) - 1)
    lower = (frequencies[None, :] - edges[:-2, None]) / (edges[1:-1] - edges[:-2])[:, None]
    upper = (edges[2:, None] - frequencies[None, :]) / (edges[2:] - edges[1:-1])[:, None]
    bank = np.maximum(0, np.minimum(lower, upper)).astype(np.float32)
    window = (.5 - .5 * np.cos(2 * np.pi * np.arange(1024) / 1024)).astype(np.float32)
    return bank, window


def decode_audio(raw):
    try:
        with wave.open(BytesIO(raw), 'rb') as source:
            channels = source.getnchannels()
            if (source.getframerate() != 16000 or source.getsampwidth() != 2 or
                    channels not in (1, 8) or source.getcomptype() != 'NONE' or
                    source.getnframes() != 160000):
                raise ValueError('Requires exactly 10 seconds of 16 kHz PCM16 WAV with 1 or 8 channels.')
            payload = source.readframes(160000)
            if len(payload) != 160000 * channels * 2:
                raise ValueError('Truncated WAV payload.')
            return payload, channels
    except (wave.Error, EOFError, OSError) as exc:
        raise ValueError('Invalid WAV payload.') from exc


def audio_tensor(payload, channels):
    import numpy as np
    import torch
    from torch.nn import functional as functional
    pcm = np.frombuffer(payload, dtype='<i2').reshape(-1, channels)[:, 0].copy()
    values = pcm.astype(np.float32) / 32768
    if float(np.sqrt(np.mean(values ** 2))) < 1e-5:
        return None, 'Silent or near-silent audio.'
    if float(np.mean(np.abs(values) >= 32760 / 32768)) > .01:
        return None, 'More than 1 percent of samples are clipped.'
    bank, window = acoustic_frontend()
    frames = np.lib.stride_tricks.sliding_window_view(values, 1024)[::512]
    power = np.abs(np.fft.rfft(frames * window, axis=1)) ** 2
    db = 10 * np.log10(np.maximum(bank @ power.T, 1e-10))
    db = np.maximum(db - db.max(), -80).astype(np.float32)
    grayscale = torch.from_numpy((db + 80) / 80)[None, None]
    rgb = functional.interpolate(grayscale, size=(224, 224), mode='bilinear', align_corners=False)[0].repeat(3, 1, 1)
    mean = torch.tensor([.485, .456, .406])[:, None, None]
    std = torch.tensor([.229, .224, .225])[:, None, None]
    return (rgb - mean) / std, None


def classification_result(scores, kind, threshold):
    import math
    if (any(not math.isfinite(score) or not 0 <= score <= 1 for score in scores.values()) or
            not math.isclose(sum(scores.values()), 1, abs_tol=1e-4)):
        raise InferenceUnavailable('Model returned invalid classification scores.')
    ordered = sorted(scores, key=scores.get, reverse=True)
    label = ordered[0]
    if kind == 'acoustic':
        return {'status': 'REVIEW_REQUIRED', 'label': None,
                'reason': 'Experimental acoustic model has poor held-out-machine performance; scores require review.'}
    if scores[label] < threshold or scores[label] - scores[ordered[1]] < .1:
        return {'status': 'REVIEW_REQUIRED', 'label': None, 'reason': 'Low or ambiguous classification score.'}
    if kind == 'corrosion':
        status = 'NO_CORROSION_DETECTED' if label == 'normal' else 'CORROSION_SUSPECTED'
    else:
        status = 'HEALTHY_REFERENCE_PATTERN' if label == 'healthy_no_load' else 'FAULT_PATTERN_SUSPECTED'
    return {'status': status, 'label': label, 'reason': None}


def infer(kind, data):
    started = perf_counter()
    upload = data['audio' if kind == 'acoustic' else 'image']
    raw = upload.read(settings.INFERENCE_MAX_UPLOAD_BYTES + 1)
    if len(raw) > settings.INFERENCE_MAX_UPLOAD_BYTES:
        raise ValueError('Upload exceeds the 8 MiB limit.')
    image = None
    if kind == 'acoustic':
        audio, channels = decode_audio(raw)
    else:
        image = decode_image(raw)
        crop = image
        if data.get('roi') is not None:
            x, y, width, height = data['roi']
            if x + width > image.width or y + height > image.height:
                raise ValueError('Asset crop ROI is outside the frame.')
            crop = image.crop((x, y, x + width, y + height))
    if not _worker.acquire(blocking=False):
        raise InferenceBusy('Inference worker busy. Drop stale frames and retry with a fresh frame.')
    try:
        root, entries = registry()
        if kind not in entries:
            raise InferenceUnavailable('Requested model is not registered.')
        network, entry = load_model(str(root), kind)
        result = {
            'schema_version': 1, 'model_id': entry['id'], 'model_sha256': entry['sha256'],
            'source_sha256': hashlib.sha256(raw).hexdigest(),
            'asset_id': data['asset_id'], 'frame_id': data['frame_id'], 'captured_at': data['captured_at'],
            'status': 'UNREADABLE', 'label': None, 'reason': None, 'scores': {}, 'detections': [],
            'image_size': list(image.size) if image is not None else None, 'roi': data.get('roi'),
            'requires_review': True, 'scores_are_calibrated': False,
            'quality_status': entry.get('quality_status', 'prototype_requires_review'),
            'value': None, 'unit': None, 'temperature_c': None, 'hazard_severity': None,
        }
        import torch
        with torch.inference_mode():
            if kind == 'gauge':
                prediction = network.predict(source=image, conf=data['threshold'], device='cpu', verbose=False)[0]
                if prediction.boxes is not None:
                    result['detections'] = [
                        {'label': prediction.names[int(class_id)], 'score': score, 'box_xyxy': box}
                        for box, class_id, score in zip(prediction.boxes.xyxy.cpu().tolist(),
                                                        prediction.boxes.cls.cpu().tolist(),
                                                        prediction.boxes.conf.cpu().tolist())
                    ]
                result['status'] = 'DETECTED' if result['detections'] else 'NO_DETECTIONS'
                result['reason'] = 'Detection only. Whole-pointer boxes do not provide a calibrated numeric reading.'
            else:
                if kind == 'acoustic':
                    tensor, reason = audio_tensor(audio, channels)
                else:
                    from PIL import ImageStat
                    minimum, contrast = (32, 5) if kind == 'corrosion' else (64, .5)
                    reason = 'Input crop too small or low contrast.' if (
                        min(crop.size) < minimum or ImageStat.Stat(crop.convert('L')).stddev[0] < contrast
                    ) else None
                    tensor = None if reason else image_tensor(crop)
                if reason:
                    result['reason'] = reason
                else:
                    scores = network(tensor.unsqueeze(0)).softmax(1)[0].cpu().tolist()
                    result['scores'] = dict(zip(entry['classes'], scores))
                    result.update(classification_result(result['scores'], kind, data['threshold']))
        result['processed_at'] = timezone.now()
        result['inference_ms'] = round((perf_counter() - started) * 1000, 3)
        return result
    except (ImportError, OSError, RuntimeError) as exc:
        logger.exception('Inference runtime failure for %s', kind)
        raise InferenceUnavailable('Inference runtime unavailable. See server logs for details.') from exc
    finally:
        _worker.release()
