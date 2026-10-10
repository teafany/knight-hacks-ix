export type CameraModel = 'gauge' | 'corrosion' | 'thermal'

export interface InferenceResult {
  model_id: string
  asset_id: string
  frame_id: string
  captured_at: string | null
  status: string
  label: string | null
  reason: string | null
  scores: Record<string, number>
  detections: { label: string; score: number; box_xyxy: number[] }[]
  image_size: number[] | null
  requires_review: boolean
  value: number | null
  temperature_c: number | null
  hazard_severity: string | null
}

interface CameraOptions {
  video: HTMLVideoElement
  model: CameraModel
  assetId: string
  onResult: (result: InferenceResult) => void
  signal: AbortSignal
  apiBase?: string
  fps?: number
  threshold?: number
  camera?: MediaTrackConstraints
  assetCrop?: boolean
  roi?: [number, number, number, number]
  compatibleThermogram?: boolean
}

function pause(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted()
    const abort = () => {
      clearTimeout(timer)
      reject(signal.reason)
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort)
      resolve()
    }, milliseconds)
    signal.addEventListener('abort', abort, { once: true })
  })
}

/** Owns the camera until aborted or an error occurs; keeps one upload in flight. */
export async function streamCameraInference(options: CameraOptions): Promise<void> {
  const { video, signal, model } = options
  const fps = options.fps ?? 2
  const threshold = options.threshold ?? 0.7
  if (!Number.isFinite(fps) || fps <= 0 || fps > 30) throw new Error('Invalid camera inference rate.')
  if (!Number.isFinite(threshold) || threshold < 0.5 || threshold > 1) throw new Error('Invalid threshold.')
  if (!options.assetId.trim()) throw new Error('An asset ID is required.')
  if (model === 'corrosion' && Boolean(options.assetCrop) === Boolean(options.roi)) {
    throw new Error('Corrosion requires one asset crop or ROI.')
  }
  if (model === 'thermal' && !options.compatibleThermogram) {
    throw new Error('A compatible thermal camera is required.')
  }
  signal.throwIfAborted()
  const media = await navigator.mediaDevices.getUserMedia({ video: options.camera ?? true, audio: false })
  const stop = () => media.getTracks().forEach(track => track.stop())
  signal.addEventListener('abort', stop, { once: true })
  try {
    signal.throwIfAborted()
    video.srcObject = media
    video.muted = true
    video.playsInline = true
    await video.play()
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Camera canvas unavailable.')
    let frameId = 0
    while (!signal.aborted) {
      if (media.getVideoTracks().some(track => track.readyState === 'ended')) {
        throw new Error('Camera stream ended.')
      }
      if (!video.videoWidth || !video.videoHeight || video.readyState < 2) {
        await pause(50, signal)
        continue
      }
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      context.drawImage(video, 0, 0)
      const capturedAt = new Date().toISOString()
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9))
      signal.throwIfAborted()
      if (!blob) throw new Error('Camera frame encoding failed.')
      const body = new FormData()
      body.append('image', blob, 'frame.jpg')
      body.append('asset_id', options.assetId)
      body.append('frame_id', String(frameId++))
      body.append('captured_at', capturedAt)
      body.append('threshold', String(threshold))
      if (model === 'corrosion') {
        body.append('asset_category', 'yoke-suspension')
        if (options.assetCrop) body.append('asset_crop', 'true')
        else body.append('roi', JSON.stringify(options.roi))
      }
      if (model === 'thermal') body.append('compatible_thermogram', 'true')
      const response = await fetch(`${options.apiBase ?? '/api'}/inference/${model}`, {
        method: 'POST', body, signal, credentials: 'omit',
      })
      if (response.status === 429) {
        await pause(1000, signal)
        continue
      }
      if (!response.ok) throw new Error(`Inference HTTP ${response.status}: ${await response.text()}`)
      options.onResult(await response.json() as InferenceResult)
      await pause(1000 / fps, signal)
    }
  } finally {
    signal.removeEventListener('abort', stop)
    stop()
    if (video.srcObject === media) {
      video.pause()
      video.srcObject = null
    }
  }
}
