// STUB – replaced in phase 2
import * as THREE from 'three';
import type { GameRenderer } from '../contracts';
import { ITEMS, interpolateSegments } from '../contracts';

export function createRenderer(container: HTMLElement): GameRenderer {
  const webgl = new THREE.WebGLRenderer({ antialias: true });
  webgl.setClearColor(0x000000);
  container.appendChild(webgl.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  camera.position.set(0, 0, 40);
  const group = new THREE.Group();
  scene.add(group);
  const box = new THREE.BoxGeometry(0.9, 0.9, 0.9);

  return {
    webgl,
    scene,
    camera,
    update(_prev, curr, alpha) {
      group.clear();
      const { width, height } = curr.config;
      const place = (m: THREE.Object3D, x: number, y: number) =>
        m.position.set(x - width / 2 + 0.5, height / 2 - y - 0.5, 0);
      for (const p of curr.players)
        for (const c of interpolateSegments(p, alpha)) {
          const m = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: p.alive ? 0x33ff66 : 0x555555 }));
          place(m, c.x, c.y);
          group.add(m);
        }
      for (const it of curr.items) {
        const m = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: ITEMS[it.kind].color }));
        place(m, it.x, it.y);
        group.add(m);
      }
    },
    onEvents() {},
    resize(w, h) {
      webgl.setPixelRatio(Math.min(2, window.devicePixelRatio));
      webgl.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
    dispose() {
      webgl.dispose();
      webgl.domElement.remove();
    },
  };
}
