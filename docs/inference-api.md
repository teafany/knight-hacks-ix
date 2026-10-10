# Stateless Camera Inference

The API runs the four registered local checkpoints in `models/` without the
untracked training folders. Each request supplies its complete input and asset
context. Inference creates no database records, saved images, camera sessions,
or per-client model state. Only model weights are cached per worker process.

## Install and Run

Use Python 3.12 or 3.13 for the model runtime:

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install -r server/requirements-inference.txt
.venv/bin/python server/manage.py runserver 127.0.0.1:8000
```

GPU hosts should retain their matching provider torch/torchvision builds and
install the remaining requirements separately. This implementation uses CPU
inference. The basic `server/requirements.txt` supports the dashboard and API
docs without installing torch; inference then returns 503 until the runtime is
installed. No pretrained weights or models are downloaded during inference.

Swagger UI: <http://127.0.0.1:8000/api/docs>. ReDoc: `/api/redoc`.
OpenAPI 3 schema: `/api/schema` (use `Accept: application/json` for JSON).
Swagger assets are served locally through drf-spectacular-sidecar, as described
in the [official setup documentation](https://drf-spectacular.readthedocs.io/en/stable/readme.html).

## Endpoints

All uploads are `multipart/form-data`. Paths have no trailing slash.

| Method / path | Input | Result |
| --- | --- | --- |
| `GET /api/inference/models` | None | Registry IDs, classes, hashes, scope, quality status, checkpoint presence |
| `POST /api/inference/gauge` | `image` JPEG/PNG | Gauge, center, whole-pointer detection boxes; numeric value stays null |
| `POST /api/inference/corrosion` | `image`, `asset_category=yoke-suspension`, exactly one of `asset_crop=true` or `roi=[x,y,width,height]` | Crop-level normal/corrosion classification |
| `POST /api/inference/thermal` | `image`, `compatible_thermogram=true` | Laboratory motor condition pattern |
| `POST /api/inference/acoustic` | `audio`, `compatible_pump_audio=true`, `allow_experimental=true` | Experimental pump scores, always requiring review |

Every POST requires `asset_id` and accepts `frame_id`, ISO 8601 `captured_at`, and
`threshold` (0.5..1, default 0.7). Repeat all crop/domain declarations per frame.
Use distinct frame IDs to correlate results; they are echoed, not stored or
deduplicated. `captured_at` is supplied by the caller, not validated telemetry.

Frames are limited to 8 MiB and 16 megapixels. Only single JPEG/PNG frames are
accepted. EXIF orientation is applied before inference; ROI and returned boxes
use oriented uploaded-image pixel coordinates. Corrosion ROI is a caller-supplied
asset crop, not a predicted defect location. Classification uses the checkpoint's
RGB gray-letterbox 224x224/ImageNet normalization. Thermal input must use a
compatible motor thermogram palette/framing; a normal webcam is not thermal input.

Acoustic accepts exactly ten seconds of 16 kHz PCM16 WAV, mono or eight channels
(channel zero selected), using the original checkpoint-versioned log-mel frontend.
The published experiment has poor held-out-machine results. Its endpoint requires
explicit opt-in and never returns a deployable fault classification.

Responses include model/input hashes, capture/processing timestamps, duration,
scores or detection boxes, status, and review flags. Model scores are uncalibrated.
Low contrast/small inputs return `UNREADABLE`; ambiguous scores return
`REVIEW_REQUIRED`. Numeric gauge values, temperature, units, and hazard severity
remain null because these checkpoints do not establish them.

Invalid requests return 400; unsupported media types return 415; unavailable or
checksum-invalid models return 503. Each process permits one active inference;
concurrent callers receive 429 with `Retry-After: 1`. Camera clients keep one
request in flight and drop busy frames. Model loading makes the first request
slower. Additional server processes have separate weight caches.

```sh
curl http://127.0.0.1:8000/api/inference/gauge \
  -F image=@gauge.jpg -F asset_id=GAUGE-01 -F frame_id=0

curl http://127.0.0.1:8000/api/inference/corrosion \
  -F image=@equipment.jpg -F asset_id=YOKE-01 \
  -F asset_category=yoke-suspension -F 'roi=[100,80,240,200]'
```

## Live Webcam and Spot

Video is transported as successive independent frame POSTs. The client owns
capture, the video preview, and sampling. There is no server-side camera session
or WebSocket requirement. REST responses are printed as NDJSON for downstream
consumers; `--preview` displays the frames and gauge boxes.

```sh
.venv/bin/python scripts/stream_camera.py \
  --source 0 --model gauge --asset-id GAUGE-01 --fps 2 --preview

.venv/bin/python scripts/stream_camera.py \
  --source 0 --model corrosion --asset-id YOKE-01 --roi 100 80 240 200
```

`--frames N` makes capture bounded for testing. `--rotate 90` can orient a Spot
body camera; coordinates then refer to the rotated frame. Stop with Ctrl+C or
press `q` in the preview. Local input may also be a video file. Requests have a
timeout and fail explicitly on input/runtime errors.

For Spot, install the optional SDK and supply credentials in the client process:

```sh
.venv/bin/python -m pip install -r server/requirements-spot.txt
export BOSDYN_CLIENT_USERNAME='<robot username>'
export BOSDYN_CLIENT_PASSWORD='<robot password>'

.venv/bin/python scripts/stream_camera.py \
  --source spot --spot-host 192.168.80.3 --asset-id GAUGE-01 --list-spot-sources

.venv/bin/python scripts/stream_camera.py \
  --source spot --spot-host 192.168.80.3 \
  --spot-image-source frontleft_fisheye_image --rotate 90 \
  --model gauge --asset-id GAUGE-01 --fps 2 --preview
```

The adapter uses the SDK's image client and configurable `--spot-service`
(default `image`), matching the [Spot image service documentation](https://dev.bostondynamics.com/python/examples/get_image/readme).
It handles JPEG and raw 8-bit grayscale/RGB/RGBA, rejects depth/raw radiometric
inputs, and does not send robot movement commands. `captured_at` is client UTC
at image receipt, not a synchronized sensor timestamp. Thermal requires a
reviewed compatible palette source; the default Spot body camera is visual.
Physical Spot and webcam hardware testing requires the respective devices.

For browser capture, `frontend/src/cameraInference.ts` exports
`streamCameraInference({ video, model, assetId, signal, onResult, ... })`.
It captures `getUserMedia` frames, submits one request at a time through the
existing Vite `/api` proxy, and releases tracks when the caller aborts or an
error occurs. Camera access requires localhost or HTTPS and user permission.
For corrosion supply `roi` or `assetCrop`; for thermal set
`compatibleThermogram` only with a matching source.

```ts
const controller = new AbortController()
await streamCameraInference({
  video: videoElement,
  model: 'gauge',
  assetId: 'GAUGE-01',
  signal: controller.signal,
  onResult: result => console.log(result),
})
// Call controller.abort() from the owning component's stop/cleanup handler.
```

## Verification

```sh
.venv/bin/python server/manage.py test api
.venv/bin/python server/manage.py spectacular --validate --fail-on-warn --file /tmp/openapi.yaml
.venv/bin/python -m unittest discover -s scripts -p 'test_stream_camera.py'
node --test scripts/test_camera_inference.mjs
npm --prefix frontend run build
```

Runtime tests run when the inference dependencies are installed. They use
repository checkpoints and generated JPEG/WAV inputs; they
verify loading and transport, not model accuracy. API tests run without model
dependencies and cover validation, stateless responses, errors, and docs.
