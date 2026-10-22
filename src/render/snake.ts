import * as THREE from 'three';
import type { Player } from '../sim/types';
import type { SnakePath } from './path';
import { getSkin, type HeadDecoration, type Skin } from './skins';

const BODY_Y = 0.5;
const R = 0.42;
const DEATH_BLINK = 0.6;
const DEATH_DECAY = 0.7;

const sphereGeo = new THREE.SphereGeometry(1, 14, 10);
const dummy = new THREE.Object3D();
const cA = new THREE.Color();
const cB = new THREE.Color();
const cWhite = new THREE.Color(2.5, 2.5, 2.5);
const ZERO = new THREE.Vector3();

/** Common surface of the 3D and 2D snake views. */
export interface SnakeLike {
  deadSince: number;
  update(p: Player, path: SnakePath, t: number, ghost: number): void;
  dispose(): void;
}

export class SnakeView implements SnakeLike {
  readonly group = new THREE.Group();
  private mesh: THREE.InstancedMesh;
  private capacity = 64;
  private bodyMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  private headMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  private head = new THREE.Group();
  private headMesh = new THREE.Mesh(sphereGeo, this.headMat);
  private skin: Skin;
  private deco: HeadDecoration;
  private transparent = false;
  deadSince = -1;

  constructor(parent: THREE.Object3D, skinId: string) {
    this.mesh = this.makeMesh(this.capacity);
    this.group.add(this.mesh, this.head);
    this.head.add(this.headMesh);
    this.skin = getSkin(skinId);
    this.deco = this.attachDeco();
    parent.add(this.group);
  }

  private makeMesh(cap: number): THREE.InstancedMesh {
    const m = new THREE.InstancedMesh(sphereGeo, this.bodyMat, cap);
    m.setColorAt(0, cA.setRGB(1, 1, 1));
    m.frustumCulled = false;
    return m;
  }

  private attachDeco(): HeadDecoration {
    const d = this.skin.createHead();
    this.head.add(d.object);
    const s = this.skin.headScale ?? [1, 1, 1];
    this.headMesh.scale.set(0.58 * s[0], 0.58 * s[1], 0.58 * s[2]);
    return d;
  }

  update(p: Player, path: SnakePath, t: number, ghost: number): void {
    if (p.skinId !== this.skin.id) {
      this.head.remove(this.deco.object);
      this.deco.dispose();
      this.skin = getSkin(p.skinId);
      this.deco = this.attachDeco();
    }
    if (!p.alive && this.deadSince < 0) this.deadSince = t;
    if (p.alive) this.deadSince = -1;
    const age = this.deadSince >= 0 ? t - this.deadSince : -1;
    if (age > DEATH_BLINK + DEATH_DECAY) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;

    const n = path.n;
    const count = Math.max(0, 2 * n - 1);
    if (count > this.capacity) {
      while (this.capacity < count) this.capacity *= 2;
      this.group.remove(this.mesh);
      this.mesh.dispose();
      this.mesh = this.makeMesh(this.capacity);
      this.group.add(this.mesh);
    }
    const mesh = this.mesh;
    const skin = this.skin;
    const flash = age >= 0 && age < DEATH_BLINK && Math.floor(age * 12) % 2 === 0;
    const decay = age >= DEATH_BLINK ? (age - DEATH_BLINK) / DEATH_DECAY : 0;

    let prevScale = 0;
    for (let i = 0; i < n; i++) {
      const taper = 1 - 0.38 * (i / Math.max(1, n));
      let sc = R * taper * (skin.segmentScale ? skin.segmentScale(i, n, t) : 1);
      if (decay > 0) sc *= Math.max(0, 1 - decay * (1 + 0.8 * hashI(i)));
      skin.colorAt(i, n, t, cA);
      if (flash) cA.copy(cWhite);

      if (i > 0) {
        const ms = path.mid(i, BODY_Y, dummy.position) ? Math.min(sc, prevScale) * 0.96 : 0;
        dummy.scale.set(ms, ms, ms);
        dummy.updateMatrix();
        mesh.setMatrixAt(2 * i - 1, dummy.matrix);
        mesh.setColorAt(2 * i - 1, cB.lerpColors(cB, cA, 0.5));
      }
      path.at(i, BODY_Y, dummy.position);
      dummy.scale.set(sc, sc, sc);
      dummy.updateMatrix();
      mesh.setMatrixAt(2 * i, dummy.matrix);
      mesh.setColorAt(2 * i, cA);
      cB.copy(cA);
      prevScale = sc;
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    // Head
    if (n > 0) path.at(0, BODY_Y, this.head.position);
    else this.head.position.copy(ZERO);
    path.headQuat(this.head.quaternion);
    const hs = decay > 0 ? Math.max(0, 1 - decay) : 1;
    this.head.scale.setScalar(hs);
    skin.headColor(t, cA);
    if (flash) cA.copy(cWhite);
    this.headMat.color.copy(cA);
    this.headMat.emissive.copy(cA).multiplyScalar(0.25);
    this.deco.update(t, p.alive);

    // Ghost transparency
    const tr = ghost > 0.001;
    const op = 1 - 0.65 * ghost;
    this.bodyMat.opacity = op;
    this.headMat.opacity = op;
    if (tr !== this.transparent) {
      this.transparent = tr;
      this.bodyMat.transparent = tr;
      this.headMat.transparent = tr;
      this.bodyMat.depthWrite = !tr;
      this.headMat.depthWrite = !tr;
      this.bodyMat.needsUpdate = true;
      this.headMat.needsUpdate = true;
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    this.mesh.dispose();
    this.bodyMat.dispose();
    this.headMat.dispose();
    this.deco.dispose();
  }
}

function hashI(i: number): number {
  const v = Math.sin(i * 78.233) * 43758.5453;
  return v - Math.floor(v);
}
