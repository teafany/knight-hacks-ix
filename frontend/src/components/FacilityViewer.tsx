import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { LidarData, Severity } from '../types'

const severityColors: Record<Severity, string> = {
  CRITICAL: '#ff6a72', HIGH: '#ffab66', MEDIUM: '#e6ca79', LOW: '#66cdb5', NONE: '#7c94aa',
}

type Props = { data: LidarData; selected: string; onSelect: (id: string) => void; showHistory: boolean; showObstruction: boolean }

export default function FacilityViewer({ data, selected, onSelect, showHistory, showObstruction }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const sceneState = useRef<{ markers: THREE.Group; obstruction: THREE.Group; controls: OrbitControls; camera: THREE.PerspectiveCamera } | null>(null)
  const select = useRef(onSelect)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => { select.current = onSelect }, [onSelect])

  useEffect(() => {
    const host = container.current!
    let disposed = false
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#0b1822')
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100)
    // These exports are Z-up. Preserve their coordinates rather than remapping waypoints.
    camera.up.set(0, 0, 1)
    camera.position.set(8.5, 10, 8)
    let renderer: THREE.WebGLRenderer
    try { renderer = new THREE.WebGLRenderer({ antialias: true }) }
    catch {
      queueMicrotask(() => {
        if (!disposed) setError('3D rendering is unavailable. Use the waypoint buttons to inspect the data.')
      })
      return () => { disposed = true }
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.domElement.setAttribute('aria-label', 'Synthetic facility model. Drag to orbit, scroll to zoom; select waypoints using the buttons below.')
    host.appendChild(renderer.domElement)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(2.5, 2, 0.6)
    controls.enableDamping = true
    controls.maxDistance = 22
    controls.minDistance = 3
    controls.update()
    const grid = new THREE.GridHelper(12, 24, '#264858', '#183440')
    grid.rotation.x = Math.PI / 2
    grid.position.set(2.5, 2, -0.025)
    scene.add(grid)
    scene.add(new THREE.AmbientLight(0xffffff, 2))

    const markers = new THREE.Group()
    for (const waypoint of data.waypoints) {
      const history = data.history.find(row => row.location_id === waypoint.location_id)
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.085, 16, 12),
        new THREE.MeshBasicMaterial({ color: severityColors[history?.highest_severity ?? 'NONE'], depthTest: false }),
      )
      marker.position.set(waypoint.position.x, waypoint.position.y, waypoint.position.z)
      marker.renderOrder = 2
      marker.userData.locationId = waypoint.location_id
      markers.add(marker)
    }
    scene.add(markers)

    const obstruction = new THREE.Group()
    const change = data.obstruction
    const geometry = new THREE.BoxGeometry(change.dimensions.x, change.dimensions.y, change.dimensions.z)
    const box = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: '#ff6a72', transparent: true, opacity: 0.22, depthWrite: false }))
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: '#ff8a8c' }))
    obstruction.add(box, edges)
    obstruction.position.set(change.position.x, change.position.y, change.position.z)
    scene.add(obstruction)
    sceneState.current = { markers, obstruction, controls, camera }

    const material = new THREE.MeshBasicMaterial({ color: '#448caa' })
    new GLTFLoader().load('/lidar/facility.glb', gltf => {
      if (disposed) {
        gltf.scene.traverse(object => {
          if (object instanceof THREE.Mesh) {
            object.geometry.dispose()
            for (const mat of Array.isArray(object.material) ? object.material : [object.material]) mat.dispose()
          }
        })
        return
      }
      gltf.scene.traverse(object => {
        if (object instanceof THREE.Mesh) {
          for (const mat of Array.isArray(object.material) ? object.material : [object.material]) mat.dispose()
          object.material = material
        }
      })
      scene.add(gltf.scene)
      setReady(true)
    }, undefined, () => { if (!disposed) setError('Could not load facility.glb. The waypoint and obstruction overlays are still available.') })

    const resize = new ResizeObserver(() => {
      const width = host.clientWidth, height = host.clientHeight
      camera.aspect = width / Math.max(height, 1)
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
    })
    resize.observe(host)
    const raycaster = new THREE.Raycaster()
    let down = { x: 0, y: 0 }
    const pointerDown = (event: PointerEvent) => { down = { x: event.clientX, y: event.clientY } }
    const pointerUp = (event: PointerEvent) => {
      if (!markers.visible || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) return
      const rect = renderer.domElement.getBoundingClientRect()
      raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera)
      const hit = raycaster.intersectObjects(markers.children)[0]
      if (hit) select.current(hit.object.userData.locationId as string)
    }
    renderer.domElement.addEventListener('pointerdown', pointerDown)
    renderer.domElement.addEventListener('pointerup', pointerUp)
    renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera) })
    return () => {
      disposed = true
      sceneState.current = null
      resize.disconnect()
      controls.dispose()
      renderer.setAnimationLoop(null)
      renderer.domElement.removeEventListener('pointerdown', pointerDown)
      renderer.domElement.removeEventListener('pointerup', pointerUp)
      scene.traverse(object => {
        if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
          object.geometry.dispose()
          for (const mat of Array.isArray(object.material) ? object.material : [object.material]) mat.dispose()
        }
      })
      material.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [data])

  useEffect(() => {
    const state = sceneState.current
    if (!state) return
    state.markers.visible = showHistory
    state.obstruction.visible = showObstruction
    for (const marker of state.markers.children) marker.scale.setScalar(marker.userData.locationId === selected ? 1.7 : 1)
  }, [selected, showHistory, showObstruction, data])

  function resetView() {
    const state = sceneState.current
    if (!state) return
    state.camera.position.set(8.5, 10, 8)
    state.controls.target.set(2.5, 2, 0.6)
    state.controls.update()
  }

  return <div className="viewer-wrap">
    <div className="viewer" ref={container} />
    <div className="viewer-label"><span className="dot cyan" />{ready ? 'FACILITY MODEL LOADED' : error ? 'MODEL UNAVAILABLE' : 'LOADING FACILITY MODEL'}</div>
    <button className="reset-view" onClick={resetView}>↺ Reset view</button>
    {error && <div className="viewer-error" role="alert">{error}</div>}
    <div className="viewer-help">Drag to orbit · Scroll to zoom · Click a waypoint</div>
    <div className="axis-label">X / Y floor plane · Z up · meters</div>
  </div>
}
