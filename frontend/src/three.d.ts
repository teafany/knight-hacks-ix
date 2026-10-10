declare module "three" {
  export class Object3D {
    userData: Record<string, unknown>;
    position: { set(x: number, y: number, z: number): void };
    rotation: { x: number };
    scale: { setScalar(value: number): void };
    traverse(callback: (object: Object3D) => void): void;
  }

  export class Group extends Object3D {
    children: Object3D[];
    visible: boolean;
    add(...objects: Object3D[]): this;
  }

  export class Scene extends Group {
    background: Color | null;
  }

  export class Color {
    constructor(color: string);
  }

  export class PerspectiveCamera extends Object3D {
    aspect: number;
    up: { set(x: number, y: number, z: number): void };
    constructor(fov: number, aspect: number, near: number, far: number);
    updateProjectionMatrix(): void;
  }

  export class WebGLRenderer {
    domElement: HTMLCanvasElement;
    constructor(options?: { antialias?: boolean });
    setPixelRatio(value: number): void;
    setSize(width: number, height: number): void;
    setAnimationLoop(callback: (() => void) | null): void;
    render(scene: Scene, camera: PerspectiveCamera): void;
    dispose(): void;
  }

  export class AmbientLight extends Object3D {
    constructor(color: number, intensity?: number);
  }

  export class GridHelper extends Object3D {
    constructor(size?: number, divisions?: number, color1?: string, color2?: string);
  }

  export class BufferGeometry {
    dispose(): void;
  }

  export class SphereGeometry extends BufferGeometry {
    constructor(radius?: number, widthSegments?: number, heightSegments?: number);
  }

  export class BoxGeometry extends BufferGeometry {
    constructor(width?: number, height?: number, depth?: number);
  }

  export class EdgesGeometry extends BufferGeometry {
    constructor(geometry?: BufferGeometry);
  }

  export class Material {
    dispose(): void;
  }

  export class MeshBasicMaterial extends Material {
    constructor(options?: Record<string, unknown>);
  }

  export class LineBasicMaterial extends Material {
    constructor(options?: Record<string, unknown>);
  }

  export class Mesh extends Object3D {
    geometry: BufferGeometry;
    material: Material | Material[];
    renderOrder: number;
    constructor(geometry?: BufferGeometry, material?: Material | Material[]);
  }

  export class LineSegments extends Object3D {
    geometry: BufferGeometry;
    material: Material | Material[];
    constructor(geometry?: BufferGeometry, material?: Material | Material[]);
  }

  export class Vector2 {
    constructor(x?: number, y?: number);
  }

  export class Raycaster {
    setFromCamera(coords: Vector2, camera: PerspectiveCamera): void;
    intersectObjects(objects: Object3D[]): Array<{ object: Object3D }>;
  }
}

declare module "three/addons/loaders/GLTFLoader.js" {
  import type { Group } from "three";

  export class GLTFLoader {
    load(
      url: string,
      onLoad: (gltf: { scene: Group }) => void,
      onProgress?: unknown,
      onError?: (error: unknown) => void,
    ): void;
  }
}

declare module "three/addons/controls/OrbitControls.js" {
  import type { PerspectiveCamera } from "three";

  export class OrbitControls {
    target: { set(x: number, y: number, z: number): void };
    enableDamping: boolean;
    maxDistance: number;
    minDistance: number;
    constructor(camera: PerspectiveCamera, domElement: HTMLElement);
    update(): void;
    dispose(): void;
  }
}
