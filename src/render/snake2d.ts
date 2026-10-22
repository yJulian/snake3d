import * as THREE from 'three';
import type { Player, Vec2 } from '../sim/types';
import { flatGeo, circleShape, flatMat, flatMesh } from './flat';
import { eyesHead2D, getSkin, type HeadDecoration, type Skin } from './skins';
import type { Layout, SnakeLike } from './snake';

const Y = 0.05;
const R = 0.45;
const HEAD_R = 0.56;
const DEATH_BLINK = 0.6;
const DEATH_DECAY = 0.7;
const ORDER_BODY = 20;
const ORDER_HEAD = 40;

const discGeo = flatGeo(circleShape(0, 0, 1));
const dummy = new THREE.Object3D();
const cA = new THREE.Color();
const cB = new THREE.Color();
const cWhite = new THREE.Color(2.5, 2.5, 2.5);

/**
 * Flat top-down snake: one disc per segment plus a disc between neighbours (forms a capsule chain), drawn
 * tail to head with depth test off, so layering follows the instance order.
 */
export class Snake2DView implements SnakeLike {
  readonly group = new THREE.Group();
  private mesh: THREE.InstancedMesh;
  private capacity = 64;
  private bodyMat = flatMat(0xffffff);
  private headMat = flatMat(0xffffff);
  private head = new THREE.Group();
  private headMesh = flatMesh(discGeo, this.headMat, ORDER_HEAD);
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
    const m = new THREE.InstancedMesh(discGeo, this.bodyMat, cap);
    m.setColorAt(0, cA.setRGB(1, 1, 1));
    m.frustumCulled = false;
    m.renderOrder = ORDER_BODY;
    return m;
  }

  private attachDeco(): HeadDecoration {
    const d = this.skin.createHead2D ? this.skin.createHead2D() : eyesHead2D();
    this.head.add(d.object);
    const s = this.skin.headScale ?? [1, 1, 1];
    this.headMesh.scale.set(HEAD_R * s[0], 1, HEAD_R * s[2]);
    return d;
  }

  update(p: Player, segs: Vec2[], t: number, lay: Layout, ghost: number): void {
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

    const n = segs.length;
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

    // Instance order is tail -> head so the head ends up on top.
    let prevScale = 0;
    for (let i = n - 1; i >= 0; i--) {
      const s = segs[i];
      const m = n - 1 - i;
      const taper = 1 - 0.3 * (i / Math.max(1, n));
      let sc = R * taper * (skin.segmentScale ? skin.segmentScale(i, n, t) : 1);
      if (decay > 0) sc *= Math.max(0, 1 - decay * (1 + 0.8 * hashI(i)));
      skin.colorAt(i, n, t, cA);
      if (flash) cA.copy(cWhite);

      if (i < n - 1) {
        // connector between segment i+1 (prev iteration) and i
        const q = segs[i + 1];
        dummy.position.set((s.x + q.x) / 2 + lay.ox, Y, (s.y + q.y) / 2 + lay.oz);
        const ms = Math.min(sc, prevScale) * 0.98;
        dummy.scale.set(ms, 1, ms);
        dummy.updateMatrix();
        mesh.setMatrixAt(2 * m - 1, dummy.matrix);
        mesh.setColorAt(2 * m - 1, cB.lerp(cA, 0.5));
      }
      dummy.position.set(s.x + lay.ox, Y, s.y + lay.oz);
      dummy.scale.set(sc, 1, sc);
      dummy.updateMatrix();
      mesh.setMatrixAt(2 * m, dummy.matrix);
      mesh.setColorAt(2 * m, cA);
      cB.copy(cA);
      prevScale = sc;
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    // Head
    const h = segs[0];
    this.head.position.set(h.x + lay.ox, Y, h.y + lay.oz);
    let dx = 0;
    let dz = 0;
    if (n > 1) {
      dx = h.x - segs[1].x;
      dz = h.y - segs[1].y;
    }
    if (dx * dx + dz * dz < 1e-4) {
      const d = p.snake.dir;
      dx = d === 'right' ? 1 : d === 'left' ? -1 : 0;
      dz = d === 'down' ? 1 : d === 'up' ? -1 : 0;
    }
    this.head.rotation.y = Math.atan2(-dz, dx);
    const hs = decay > 0 ? Math.max(0, 1 - decay) : 1;
    this.head.scale.set(hs, 1, hs);
    skin.headColor(t, cA);
    if (flash) cA.copy(cWhite);
    this.headMat.color.copy(cA);
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
