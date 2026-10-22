import * as THREE from 'three';

export interface SceneKit {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  boardGroup: THREE.Group;
  /** Re-fits the camera so the whole board (cols x rows) is visible. */
  fitCamera(cols: number, rows: number): void;
  dispose(): void;
}

const TILT = THREE.MathUtils.degToRad(30); // tilt away from straight-down view
const FOV = 42;
const MARGIN = 1.12;

export function createSceneKit(): SceneKit {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 500);
  const boardGroup = new THREE.Group();
  scene.add(boardGroup);

  // Lambert lights are scaled by PI in current three versions.
  const ambient = new THREE.AmbientLight(0xffffff, Math.PI * 0.6);
  const sun = new THREE.DirectionalLight(0xffffff, Math.PI * 0.8);
  sun.position.set(-0.4, 1, 0.5);
  scene.add(ambient, sun);

  const corner = new THREE.Vector3();
  const sx = [-1, 1, -1, 1];
  const sz = [-1, -1, 1, 1];

  function fits(d: number, cols: number, rows: number): boolean {
    camera.position.set(0, Math.cos(TILT) * d, Math.sin(TILT) * d);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    for (let i = 0; i < 4; i++) {
      for (let h = 0; h < 2; h++) {
        corner.set((sx[i] * cols) / 2, h * 1.2, (sz[i] * rows) / 2).project(camera);
        if (Math.abs(corner.x) * MARGIN > 1 || Math.abs(corner.y) * MARGIN > 1) return false;
      }
    }
    return true;
  }

  return {
    scene,
    camera,
    boardGroup,
    fitCamera(cols, rows) {
      camera.updateProjectionMatrix();
      let lo = 2;
      let hi = 600;
      for (let i = 0; i < 28; i++) {
        const mid = (lo + hi) / 2;
        if (fits(mid, cols, rows)) hi = mid;
        else lo = mid;
      }
      fits(hi, cols, rows);
    },
    dispose() {
      scene.clear();
    },
  };
}
