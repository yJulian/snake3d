import * as THREE from 'three';
import type { GameConfig, Vec2 } from '../sim/types';
import { cubeFace, type WorldId } from '../sim/world';

/**
 * Maps continuous grid coordinates (cell centers at integers, like Vec2) onto the board surface in
 * worldGroup space, for the current morph state:
 *  - flat:   plane y = 0 (morph has no effect).
 *  - torus:  the rectangle rolls into a tube (y) and bends into a ring (x). Follow scrolls the grid
 *            around the tube so the followed point stays at the front.
 *  - sphere: the cube net folds into a cube below the F face, then inflates into a sphere
 *            (equal-angle cube-sphere). Follow is a rotation of the worldGroup (done by the renderer).
 *  - volume: the box grows upwards from the floor; z is the layer.
 * morph = 0 is always the flat layout used by the 2D view.
 */
export class BoardShape {
  world: WorldId = 'flat';
  width = 0;
  height = 0;
  depth = 1;
  /** Face size of the cube net (sphere). */
  N = 0;
  /** Torus tube radius / ring radius; sphere radius. */
  r = 1;
  R = 1;
  /** Incremented whenever the mapping changes (morph or follow). */
  version = 0;

  private morph = 0;
  private roll = 0;
  private bend = 0;
  private fold = 0;
  private inflate = 0;
  private offX = 0;
  private offY = 0;
  private readonly foldMats = Array.from({ length: 6 }, () => new THREE.Matrix4());
  private readonly restMats = Array.from({ length: 6 }, () => new THREE.Matrix4());
  private readonly tmpM = new THREE.Matrix4();
  private readonly tmpV = new THREE.Vector3();
  private readonly tmpN = new THREE.Vector3();
  private readonly tmpPlaceN = new THREE.Vector3();

  setConfig(cfg: GameConfig): void {
    this.world = cfg.world;
    this.width = cfg.width;
    this.height = cfg.height;
    this.depth = cfg.depth;
    this.N = cfg.world === 'sphere' ? cfg.height / 3 : 0;
    if (cfg.world === 'torus') {
      this.r = cfg.height / (2 * Math.PI);
      this.R = cfg.width / (2 * Math.PI);
    } else if (cfg.world === 'sphere') {
      this.R = this.N * 0.66;
      this.buildFold(this.restMats, Math.PI / 2);
    }
    this.offX = this.offY = 0;
    this.setMorph(this.morph, true);
  }

  get morphValue(): number {
    return this.morph;
  }

  /** Whether the surface is closed (no visible border) at the current morph. */
  get curved(): boolean {
    return (this.world === 'torus' || this.world === 'sphere') && this.morph > 0;
  }

  setMorph(m: number, force = false): void {
    if (m === this.morph && !force) return;
    this.morph = m;
    this.roll = smooth(0, 0.55, m);
    this.bend = smooth(0.45, 1, m);
    this.fold = smooth(0, 0.55, m);
    this.inflate = smooth(0.45, 1, m);
    if (this.world === 'sphere') this.buildFold(this.foldMats, this.fold * (Math.PI / 2));
    this.version++;
  }

  /** Torus follow: grid offset (cells) applied before mapping, weighted by the morph. */
  setFollow(offX: number, offY: number): void {
    if (offX === this.offX && offY === this.offY) return;
    this.offX = offX;
    this.offY = offY;
    this.version++;
  }

  /** Torus follow target that brings cell (x, y) to the front, with its normal tilted towards the camera. */
  followTarget(x: number, y: number, tilt: number): [number, number] {
    return [x + 0.5 - this.width / 2, y + 0.5 - this.height / 2 - tilt * this.r];
  }

  /** Face of an integer cell (sphere only; 0 elsewhere). */
  faceOf(cx: number, cy: number): number {
    return this.world === 'sphere' ? Math.max(0, cubeFace(this.N, cx, cy)) : 0;
  }

  /**
   * Position (and optionally the unit normal) of grid point (x, y, z) lifted by h along the normal.
   * `face` is the face of the cell the point belongs to (sphere). refX/refY: points of one primitive
   * pass the same reference so the torus wraps them as a unit (no stretching across the seam).
   */
  eval(
    x: number, y: number, z: number, face: number, h: number,
    out: THREE.Vector3, nOut?: THREE.Vector3, refX = x, refY = y,
  ): THREE.Vector3 {
    const W = this.width;
    const H = this.height;
    switch (this.world) {
      case 'flat':
      case 'volume': {
        const lift = this.world === 'volume' ? z * this.morph : 0;
        out.set(x + 0.5 - W / 2, h + lift, y + 0.5 - H / 2);
        nOut?.set(0, 1, 0);
        return out;
      }
      case 'torus': {
        const e = this.bend;
        const sx = x + 0.5 - this.offX * e - W / 2;
        const sz = y + 0.5 - this.offY * e - H / 2;
        const X = sx - W * Math.round((refX + 0.5 - this.offX * e - W / 2) / W);
        const Zf = sz - H * Math.round((refY + 0.5 - this.offY * e - H / 2) / H);
        // Roll around an axis parallel to x (tube forms below), curvature k1.
        const k1 = this.roll / this.r;
        let Yr: number;
        let Zr: number;
        let nY = 1;
        let nZ = 0;
        if (k1 < 1e-6) {
          Yr = h;
          Zr = Zf;
        } else {
          const phi = k1 * Zf;
          nY = Math.cos(phi);
          nZ = Math.sin(phi);
          Zr = nZ / k1 + h * nZ;
          Yr = -(1 - nY) / k1 + h * nY + this.roll * this.r;
        }
        // Bend around a vertical axis behind the board, curvature k2.
        const k2 = this.bend / this.R;
        if (k2 < 1e-6) {
          out.set(X, Yr, Zr);
          nOut?.set(0, nY, nZ);
          return out;
        }
        const th = k2 * X;
        const c = Math.cos(th);
        const s = Math.sin(th);
        const rho = 1 / k2 + Zr;
        out.set(rho * s, Yr, Zr * c - (1 - c) / k2 + this.bend * this.R);
        nOut?.set(nZ * s, nY, nZ * c);
        return out;
      }
      case 'sphere': {
        const N = this.N;
        const fx = face === 0 || face === 5 ? 1 : face - 1; // net column of the face
        const fy = face === 0 ? 0 : face === 5 ? 2 : 1;
        const half = N / 2;
        const lx = warp(x + 0.5 - fx * N - half, half, this.inflate);
        const ly = warp(y + 0.5 - fy * N - half, half, this.inflate);
        const p = this.tmpV.set(fx * N + half + lx - W / 2, 0, fy * N + half + ly - H / 2);
        const m = this.foldMats[face];
        p.applyMatrix4(m);
        const n = this.tmpN.set(m.elements[4], m.elements[5], m.elements[6]); // rotated +Y
        p.x += (this.fold * N) / 2;
        p.y += (this.fold * N) / 2;
        if (this.inflate > 0) {
          const len = p.length() || 1;
          const k = this.inflate;
          const rx = p.x / len;
          const ry = p.y / len;
          const rz = p.z / len;
          p.set(p.x + (rx * this.R - p.x) * k, p.y + (ry * this.R - p.y) * k, p.z + (rz * this.R - p.z) * k);
          n.set(n.x + (rx - n.x) * k, n.y + (ry - n.y) * k, n.z + (rz - n.z) * k).normalize();
        }
        out.copy(p).addScaledVector(n, h);
        nOut?.copy(n);
        return out;
      }
    }
  }

  /** Puts `obj` on cell `c`, lifted by h, with its local +Y along the surface normal. */
  place(obj: THREE.Object3D, c: Vec2, h: number): void {
    this.eval(c.x, c.y, c.z ?? 0, this.faceOf(c.x, c.y), h, obj.position, this.tmpPlaceN);
    obj.quaternion.setFromUnitVectors(UP, this.tmpPlaceN);
  }

  /** Sphere: unit direction of a grid point on the finished sphere (morph = 1, no follow). */
  restDir(x: number, y: number, face: number, out: THREE.Vector3): THREE.Vector3 {
    const N = this.N;
    const fx = face === 0 || face === 5 ? 1 : face - 1;
    const fy = face === 0 ? 0 : face === 5 ? 2 : 1;
    const half = N / 2;
    const lx = warp(x + 0.5 - fx * N - half, half, 1);
    const ly = warp(y + 0.5 - fy * N - half, half, 1);
    out.set(fx * N + half + lx - this.width / 2, 0, fy * N + half + ly - this.height / 2).applyMatrix4(this.restMats[face]);
    out.x += N / 2;
    out.y += N / 2;
    return out.normalize();
  }

  /** Points that bound the board incl. content up to `lift` above the surface (for camera fitting). */
  boundPoints(lift: number): THREE.Vector3[] {
    const pts: THREE.Vector3[] = [];
    const W = this.width;
    const H = this.height;
    if (this.world === 'flat' || this.world === 'volume') {
      const top = (this.world === 'volume' ? this.depth * this.morph : 0) + lift;
      for (const x of [-W / 2, W / 2]) for (const z of [-H / 2, H / 2]) for (const y of [0, top]) pts.push(new THREE.Vector3(x, y, z));
      return pts;
    }
    // Sample the surface without follow, so the fit does not change while the board scrolls/rotates.
    const ox = this.offX;
    const oy = this.offY;
    this.offX = this.offY = 0;
    const step = this.world === 'sphere' ? Math.max(1, Math.floor(this.N / 4)) : 2;
    for (let y = -0.5; y <= H - 0.5 + 1e-6; y += step) {
      for (let x = -0.5; x <= W - 0.5 + 1e-6; x += step) {
        const cx = Math.min(W - 1, Math.max(0, Math.round(x)));
        const cy = Math.min(H - 1, Math.max(0, Math.round(y)));
        if (this.world === 'sphere' && cubeFace(this.N, cx, cy) < 0) continue;
        const face = this.faceOf(cx, cy);
        for (const h of [0, lift]) pts.push(this.eval(x, y, 0, face, h, new THREE.Vector3(), undefined, cx, cy));
      }
    }
    this.offX = ox;
    this.offY = oy;
    return pts;
  }

  private buildFold(mats: THREE.Matrix4[], a: number): void {
    const N = this.N;
    const T = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z);
    const rz = (t: number) => new THREE.Matrix4().makeRotationZ(t);
    const rx = (t: number) => new THREE.Matrix4().makeRotationX(t);
    const hinge = (pivot: THREE.Matrix4, rot: THREE.Matrix4, back: THREE.Matrix4) => pivot.multiply(rot).multiply(back);
    const mR = rz(-a);
    mats[0].copy(hinge(T(0, 0, -N / 2), rx(-a), T(0, 0, N / 2))); // T
    mats[1].copy(hinge(T(-N, 0, 0), rz(a), T(N, 0, 0))); // L
    mats[2].identity(); // F
    mats[3].copy(mR); // R
    mats[4].copy(this.tmpM.copy(mR).multiply(hinge(T(N, 0, 0), rz(-a), T(-N, 0, 0)))); // B
    mats[5].copy(hinge(T(0, 0, N / 2), rx(a), T(0, 0, -N / 2))); // D
  }
}

const UP = new THREE.Vector3(0, 1, 0);

/** Equal-angle cube-sphere warp of a face-local coordinate l in [-half, half], blended by k. */
function warp(l: number, half: number, k: number): number {
  if (k <= 0) return l;
  return l + (half * Math.tan((l / half) * (Math.PI / 4)) - l) * k;
}

export function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
