import assert from 'node:assert/strict'
import { test } from 'node:test'
import { streamCameraInference } from '../frontend/src/cameraInference.ts'

function browserFixture() {
  const original = new Map(['navigator', 'document', 'fetch'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  let captures = 0
  let stopped = 0
  const track = { readyState: 'live', stop() { stopped++; this.readyState = 'ended' } }
  const media = { getTracks: () => [track], getVideoTracks: () => [track] }
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { mediaDevices: { async getUserMedia() { captures++; return media } } },
  })
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: () => ({
      getContext: () => ({ drawImage() {} }),
      toBlob: callback => callback(new Blob(['jpeg'], { type: 'image/jpeg' })),
    }) },
  })
  const video = { videoWidth: 640, videoHeight: 480, readyState: 4, srcObject: null,
    async play() {}, pause() {} }
  return {
    video,
    captures: () => captures,
    stopped: () => stopped,
    restore() {
      for (const [key, descriptor] of original) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor)
        else delete globalThis[key]
      }
    },
  }
}

test('browser sends complete context and releases camera when stopped', async () => {
  const fixture = browserFixture()
  const controller = new AbortController()
  try {
    let requests = 0
    globalThis.fetch = async (url, request) => {
      requests++
      assert.equal(url, '/api/inference/corrosion')
      assert.equal(request.method, 'POST')
      assert.equal(request.credentials, 'omit')
      assert.equal(request.body.get('asset_id'), 'YOKE-01')
      assert.equal(request.body.get('roi'), '[10,20,30,40]')
      assert.equal(request.body.get('asset_category'), 'yoke-suspension')
      assert.equal(request.body.get('frame_id'), '0')
      assert.ok(request.body.get('captured_at'))
      assert.equal(request.body.get('image').type, 'image/jpeg')
      return { ok: true, status: 200, json: async () => ({ status: 'REVIEW_REQUIRED' }) }
    }
    await assert.rejects(streamCameraInference({
      video: fixture.video, model: 'corrosion', assetId: 'YOKE-01',
      roi: [10, 20, 30, 40], signal: controller.signal,
      onResult(result) {
        assert.equal(result.status, 'REVIEW_REQUIRED')
        controller.abort()
      },
    }), { name: 'AbortError' })
    assert.equal(requests, 1)
    assert.ok(fixture.stopped() >= 1)
    assert.equal(fixture.video.srcObject, null)
  } finally {
    fixture.restore()
  }
})

test('browser stops the camera on API errors and validates domain before capture', async () => {
  const fixture = browserFixture()
  try {
    const options = { video: fixture.video, assetId: 'A', signal: new AbortController().signal, onResult() {} }
    await assert.rejects(streamCameraInference({ ...options, model: 'thermal' }), /thermal camera/)
    assert.equal(fixture.captures(), 0)
    globalThis.fetch = async () => ({ ok: false, status: 503, text: async () => 'model unavailable' })
    await assert.rejects(streamCameraInference({ ...options, model: 'gauge' }), /503/)
    assert.equal(fixture.captures(), 1)
    assert.equal(fixture.stopped(), 1)
    assert.equal(fixture.video.srcObject, null)
  } finally {
    fixture.restore()
  }
})
