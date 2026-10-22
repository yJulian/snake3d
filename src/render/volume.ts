import * as THREE from 'three';
import { ITEMS } from '../contracts';
import type { ItemId, Vec2 } from '../sim/types';
import { circleShape, flatGeo } from './flat';
import type { SnakePath } from './path';
import type { BoardShape } from './shape';

const MAX_DROPS = 48;
const MAX_SHADOWS = 512;
const FLOOR_Y = 0.02;

const discGeo = flatGeo(circleShape(0, 0, 1));
const dummy = new THREE.Object3D();
const va = new THREE.Vector3();
const vb = new THREE.Vector3();
const col = new THREE.Color();

/**
 * Depth cues for the 'volume' world: box outline, a grid on the head's current layer, floor shadows of
 * the snakes and drop lines from items and the head down to the floor.
 */
export class VolumeGuides {
  readonly object = new THREE.Group();
  private box: THREE.LineSegments;
  private layer: THREE.Group;
  private drops: THREE.LineSegments;
  private shadows: THREE.InstancedMesh;
  private markers: THREE.InstancedMesh;
  private shadowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false });
  private markerMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false });

  constructor(w: number, h: number, private readonly d: number) {
    const x0 = -w / 2;
    const z0 = -h / 2;
    const corners = [[x0, z0], [x0 + w, z0], [x0 + w, z0 + h], [x0, z0 + h]];
    const pts: number[] = [];
    for (let i = 0; i < 4; i++) {
      const [ax, az] = corners[i];
      const [bx, bz] = corners[(i + 1) % 4];
      pts.push(ax, 1, az, bx, 1, bz); // top ring (scaled by height)
      pts.push(ax, 0, az, ax, 1, az); // pillars
    }
    this.box = lines(pts, 0x555555);

    const lp: number[] = [];
    for (let x = 1; x < w; x++) lp.push(x0 + x, 0, z0, x0 + x, 0, z0 + h);
    for (let z = 1; z < h; z++) lp.push(x0, 0, z0 + z, x0 + w, 0, z0 + z);
    const layerInner = lines(lp, 0x1c1c1c);
    const bp: number[] = [];
    for (let i = 0; i < 4; i++) bp.push(corners[i][0], 0, corners[i][1], corners[(i + 1) % 4][0], 0, corners[(i + 1) % 4][1]);
    const layerBorder = lines(bp, 0x7a7a7a);
    this.layer = new THREE.Group();
    this.layer.add(layerInner, layerBorder);

    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_DROPS * 6), 3));
    dg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_DROPS * 6), 3));
    this.drops = new THREE.LineSegments(dg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7 }));
    this.drops.frustumCulled = false;

    this.shadows = new THREE.InstancedMesh(discGeo, this.shadowMat, MAX_SHADOWS);
    this.shadows.frustumCulled = false;
    this.markers = new THREE.InstancedMesh(discGeo, this.markerMat, MAX_DROPS);
    this.markers.frustumCulled = false;
    this.shadows.setColorAt(0, col.setRGB(1, 1, 1));
    this.markers.setColorAt(0, col.setRGB(1, 1, 1));
    this.object.add(this.box, this.layer, this.drops, this.shadows, this.markers);
  }

  /**
   * `morph` scales the box height (it grows out of the floor). `head` is the local player's path,
   * `items` the current item cells.
   */
  update(shape: BoardShape, morph: number, paths: readonly SnakePath[], head: SnakePath | null, items: readonly (Vec2 & { kind: ItemId })[], t: number): void {
    this.box.scale.y = Math.max(1e-3, this.d * morph);
    this.box.visible = morph > 0.01;

    // Layer grid at the floor of the head's (interpolated) layer.
    if (head && head.n > 0) {
      head.at(0, 0, va);
      this.layer.position.y = va.y;
      this.layer.visible = morph > 0.01;
    } else {
      this.layer.visible = false;
    }

    // Floor shadows of all snakes.
    let k = 0;
    col.setRGB(0.35, 0.35, 0.35);
    for (const p of paths) {
      for (let i = 0; i < p.n && k < MAX_SHADOWS; i++) {
        p.at(i, 0, dummy.position);
        dummy.position.y = FLOOR_Y;
        dummy.scale.set(i === 0 ? 0.42 : 0.32, 1, i === 0 ? 0.42 : 0.32);
        dummy.updateMatrix();
        this.shadows.setMatrixAt(k, dummy.matrix);
        this.shadows.setColorAt(k++, col);
      }
    }
    this.shadows.count = k;
    this.shadows.instanceMatrix.needsUpdate = true;
    if (this.shadows.instanceColor) this.shadows.instanceColor.needsUpdate = true;

    // Drop lines + floor markers for items and the head.
    const pos = this.drops.geometry.getAttribute('position') as THREE.BufferAttribute;
    const cl = this.drops.geometry.getAttribute('color') as THREE.BufferAttribute;
    let m = 0;
    const addDrop = (top: THREE.Vector3, c: THREE.Color, ring: number) => {
      if (m >= MAX_DROPS) return;
      pos.setXYZ(m * 2, top.x, top.y, top.z);
      pos.setXYZ(m * 2 + 1, top.x, FLOOR_Y, top.z);
      cl.setXYZ(m * 2, c.r, c.g, c.b);
      cl.setXYZ(m * 2 + 1, c.r * 0.3, c.g * 0.3, c.b * 0.3);
      dummy.position.set(top.x, FLOOR_Y + 0.005, top.z);
      dummy.scale.set(ring, 1, ring);
      dummy.updateMatrix();
      this.markers.setMatrixAt(m, dummy.matrix);
      this.markers.setColorAt(m, c);
      m++;
    };
    const headLayer = head && head.n > 0 ? Math.round(head.at(0, 0, vb).y / Math.max(1e-3, morph)) : -1;
    for (const it of items) {
      shape.eval(it.x, it.y, it.z ?? 0, 0, 0.55, va);
      const same = (it.z ?? 0) === headLayer;
      col.set(ITEMS[it.kind].color).multiplyScalar(same ? 0.9 + 0.3 * Math.sin(t * 6) : 0.45);
      addDrop(va, col, same ? 0.3 : 0.18);
    }
    if (head && head.n > 0) {
      head.at(0, 0.5, va);
      addDrop(va, col.setRGB(0.8, 0.8, 0.8), 0.2);
    }
    pos.needsUpdate = true;
    cl.needsUpdate = true;
    this.drops.geometry.setDrawRange(0, m * 2);
    this.markers.count = m;
    this.markers.instanceMatrix.needsUpdate = true;
    if (this.markers.instanceColor) this.markers.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.object.removeFromParent();
    for (const o of [this.box, ...this.layer.children, this.drops] as THREE.LineSegments[]) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
    this.shadows.dispose();
    this.markers.dispose();
    this.shadowMat.dispose();
    this.markerMat.dispose();
  }
}

function lines(pts: number[], color: number): THREE.LineSegments {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color }));
  l.frustumCulled = false;
  return l;
}
