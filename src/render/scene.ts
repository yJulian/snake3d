import * as THREE from 'three';
import type { ViewMode } from '../contracts';

export interface SceneKit {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  boardGroup: THREE.Group;
  /** Re-fits the camera so the whole board (cols x rows) is visible. */
  fitCamera(cols: number, rows: number): void;
  /** Selects the camera setup; `animate` eases tilt/FOV over VIEW_BLEND_SEC, otherwise it applies instantly. */
  setView(mode: ViewMode, animate: boolean): void;
  /** Advances the view transition (call every frame; cheap when idle). */
  update(dtSec: number): void;
  /** Current height (world units) of the tallest scene content, used for tumble fitting. */
  readonly contentHeight: number;
  dispose(): void;
}

const TILT_3D = THREE.MathUtils.degToRad(30); // tilt away from straight-down view
const FOV_3D = 42;
const HEIGHT_3D = 1.2;
/** 2D: straight down with a small FOV (almost orthographic look). */
const FOV_2D = 16;
const HEIGHT_2D = 0.1;
const MARGIN = 1.12;
const VIEW_BLEND_SEC = 0.4;

export function createSceneKit(): SceneKit {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const camera = new THREE.PerspectiveCamera(FOV_3D, 1, 0.1, 1500);
  camera.up.set(0, 0, -1); // screen-up = -z (also valid for the straight-down view)
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

  let cols = 0;
  let rows = 0;
  let blend = 0; // 0 = 3D, 1 = 2D
  let target = 0;
  let tilt = TILT_3D;
  let height = HEIGHT_3D;

  function fits(d: number, c: number, r: number): boolean {
    camera.position.set(0, Math.cos(tilt) * d, Math.sin(tilt) * d);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    for (let i = 0; i < 4; i++) {
      for (let h = 0; h < 2; h++) {
        corner.set((sx[i] * c) / 2, h * height, (sz[i] * r) / 2).project(camera);
        if (Math.abs(corner.x) * MARGIN > 1 || Math.abs(corner.y) * MARGIN > 1) return false;
      }
    }
    return true;
  }

  function refit(): void {
    if (cols <= 0) return;
    let lo = 2;
    let hi = 900;
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid, cols, rows)) hi = mid;
      else lo = mid;
    }
    fits(hi, cols, rows);
  }

  function apply(): void {
    const e = blend * blend * (3 - 2 * blend);
    tilt = TILT_3D * (1 - e);
    height = HEIGHT_3D + (HEIGHT_2D - HEIGHT_3D) * e;
    camera.fov = FOV_3D + (FOV_2D - FOV_3D) * e;
    camera.updateProjectionMatrix();
    refit();
  }

  return {
    get contentHeight() {
      return height;
    },
    scene,
    camera,
    boardGroup,
    fitCamera(c, r) {
      cols = c;
      rows = r;
      apply();
    },
    setView(mode, animate) {
      target = mode === '2d' ? 1 : 0;
      if (!animate) {
        blend = target;
        apply();
      }
    },
    update(dtSec) {
      if (blend === target) return;
      const step = dtSec / VIEW_BLEND_SEC;
      blend = blend < target ? Math.min(target, blend + step) : Math.max(target, blend - step);
      apply();
    },
    dispose() {
      scene.clear();
    },
  };
}
