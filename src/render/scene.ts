import * as THREE from 'three';
import type { ViewMode } from '../contracts';

export interface SceneKit {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Tumble rotation/scale. */
  boardGroup: THREE.Group;
  /** Child of boardGroup holding all board content; rotated by the sphere follow. */
  worldGroup: THREE.Group;
  /** Re-fits the camera (aimed at the points' bounding-box center) so all points (board space) are visible. */
  fitCamera(points: readonly THREE.Vector3[]): void;
  /** Tilt (rad) of the 3D camera away from straight down; worlds pick their own. */
  setTilt(rad: number): void;
  /** Current 3D tilt target (rad), before blending towards the 2D view. */
  readonly tilt3D: number;
  /** Selects the camera setup; `animate` eases tilt/FOV over VIEW_BLEND_SEC, otherwise it applies instantly. */
  setView(mode: ViewMode, animate: boolean): void;
  /** Advances the view transition (call every frame; cheap when idle). */
  update(dtSec: number): void;
  /** Points last passed to fitCamera (used for tumble fitting). */
  readonly fitPoints: readonly THREE.Vector3[];
  dispose(): void;
}

export const TILT_3D = THREE.MathUtils.degToRad(30); // tilt away from straight-down view
const FOV_3D = 42;
/** 2D: straight down with a small FOV (almost orthographic look). */
const FOV_2D = 16;
const MARGIN = 1.12;
const VIEW_BLEND_SEC = 0.4;
const TILT_BLEND_SEC = 0.8;

export function createSceneKit(): SceneKit {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const camera = new THREE.PerspectiveCamera(FOV_3D, 1, 0.1, 1500);
  camera.up.set(0, 0, -1); // screen-up = -z (also valid for the straight-down view)
  const boardGroup = new THREE.Group();
  const worldGroup = new THREE.Group();
  boardGroup.add(worldGroup);
  scene.add(boardGroup);

  // Lambert lights are scaled by PI in current three versions.
  const ambient = new THREE.AmbientLight(0xffffff, Math.PI * 0.6);
  const sun = new THREE.DirectionalLight(0xffffff, Math.PI * 0.8);
  sun.position.set(-0.4, 1, 0.5);
  scene.add(ambient, sun);

  const p = new THREE.Vector3();
  const center = new THREE.Vector3();
  const box = new THREE.Box3();

  let points: readonly THREE.Vector3[] = [];
  let blend = 0; // 0 = 3D, 1 = 2D
  let target = 0;
  let tilt3D = TILT_3D;
  let tiltNow = TILT_3D;
  let tilt = TILT_3D;

  function fits(d: number): boolean {
    camera.position.set(center.x, center.y + Math.cos(tilt) * d, center.z + Math.sin(tilt) * d);
    camera.lookAt(center);
    camera.updateMatrixWorld(true);
    for (const q of points) {
      p.copy(q).project(camera);
      if (p.z > 1 || Math.abs(p.x) * MARGIN > 1 || Math.abs(p.y) * MARGIN > 1) return false;
    }
    return true;
  }

  function refit(): void {
    if (!points.length) return;
    let lo = 2;
    let hi = 900;
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    fits(hi);
  }

  function apply(): void {
    const e = blend * blend * (3 - 2 * blend);
    tilt = tiltNow * (1 - e);
    camera.fov = FOV_3D + (FOV_2D - FOV_3D) * e;
    camera.updateProjectionMatrix();
    refit();
  }

  return {
    scene,
    camera,
    boardGroup,
    worldGroup,
    get fitPoints() {
      return points;
    },
    get tilt3D() {
      return tilt3D;
    },
    fitCamera(pts) {
      points = pts;
      box.setFromPoints(pts as THREE.Vector3[]).getCenter(center);
      apply();
    },
    setTilt(rad) {
      tilt3D = rad;
      if (!points.length) tiltNow = rad;
    },
    setView(mode, animate) {
      target = mode === '2d' ? 1 : 0;
      if (!animate) {
        blend = target;
        tiltNow = tilt3D;
        apply();
      }
    },
    update(dtSec) {
      if (blend === target && tiltNow === tilt3D) return;
      const step = dtSec / VIEW_BLEND_SEC;
      blend = blend < target ? Math.min(target, blend + step) : Math.max(target, blend - step);
      const ts = (dtSec / TILT_BLEND_SEC) * 1.2;
      tiltNow = tiltNow < tilt3D ? Math.min(tilt3D, tiltNow + ts) : Math.max(tilt3D, tiltNow - ts);
      apply();
    },
    dispose() {
      scene.clear();
    },
  };
}
