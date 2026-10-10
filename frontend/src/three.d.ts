declare module 'three' {
  export class AmbientLight {
    [key: string]: any
    constructor(...args: any[])
  }
  export class BoxGeometry {
    [key: string]: any
    constructor(...args: any[])
  }
  export class Color {
    [key: string]: any
    constructor(...args: any[])
  }
  export class EdgesGeometry {
    [key: string]: any
    constructor(...args: any[])
  }
  export class GridHelper {
    [key: string]: any
    constructor(...args: any[])
  }
  export class Group {
    [key: string]: any
    constructor(...args: any[])
    traverse(callback: (object: any) => void): void
  }
  export class LineBasicMaterial {
    [key: string]: any
    constructor(...args: any[])
  }
  export class LineSegments {
    [key: string]: any
    constructor(...args: any[])
  }
  export class Mesh {
    [key: string]: any
    constructor(...args: any[])
  }
  export class MeshBasicMaterial {
    [key: string]: any
    constructor(...args: any[])
  }
  export class PerspectiveCamera {
    [key: string]: any
    constructor(...args: any[])
  }
  export class Raycaster {
    [key: string]: any
    constructor(...args: any[])
  }
  export class Scene {
    [key: string]: any
    constructor(...args: any[])
    traverse(callback: (object: any) => void): void
  }
  export class SphereGeometry {
    [key: string]: any
    constructor(...args: any[])
  }
  export class Vector2 {
    [key: string]: any
    constructor(...args: any[])
  }
  export class WebGLRenderer {
    [key: string]: any
    constructor(...args: any[])
  }
}

declare module 'three/addons/loaders/GLTFLoader.js' {
  type GLTF = {
    scene: {
      [key: string]: any
      traverse(callback: (object: any) => void): void
    }
  }

  export class GLTFLoader {
    [key: string]: any
    constructor(...args: any[])
    load(
      url: string,
      onLoad: (gltf: GLTF) => void,
      onProgress?: ((event: ProgressEvent) => void) | undefined,
      onError?: ((error: unknown) => void) | undefined,
    ): void
  }
}

declare module 'three/addons/controls/OrbitControls.js' {
  export class OrbitControls {
    [key: string]: any
    constructor(...args: any[])
  }
}
