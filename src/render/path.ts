import * as THREE from 'three';
import { moveProgress } from '../contracts';
import type { Dir, GameConfig, Player, Vec2 } from '../sim/types';
import { advance, DELTA, dirsFor, sameCell } from '../sim/world';
import type { BoardShape } from './shape';

/** Neighbouring segments further apart than this (world units) are split by a seam: no connector. */
const SEAM_DIST = 2.5;

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpM = new THREE.Matrix4();

/**
 * Smooth snake positions on the board surface for one frame. A segment moving from cell A to B is drawn
 * leaving A along the exit heading for the first half of the move and entering B along the arrival heading
 * for the second half, so wraps (torus seam, cube edges) never interpolate across the board.
 */
export class SnakePath {
  n = 0;
  /** Continuous grid coordinates per segment (cell + offset) and the owning cell. */
  private gx: number[] = [];
  private gy: number[] = [];
  private gz: number[] = [];
  private cx: number[] = [];
  private cy: number[] = [];
  private pos: THREE.Vector3[] = [];
  private nrm: THREE.Vector3[] = [];
  private fwd = new THREE.Vector3();
  private player: Player | null = null;

  /** Interpolated grid position of the head and the cell it belongs to (valid after prepare()). */
  get headX(): number {
    return this.gx[0] ?? 0;
  }
  get headY(): number {
    return this.gy[0] ?? 0;
  }
  get headCell(): [number, number] {
    return [this.cx[0] ?? 0, this.cy[0] ?? 0];
  }

  /** Step 1: interpolated grid coordinates (independent of the board shape). */
  prepare(p: Player, alpha: number, cfg: GameConfig): void {
    this.player = p;
    const { segments, prevSegments } = p.snake;
    const t = moveProgress(p, alpha);
    const n = segments.length;
    while (this.pos.length < n) {
      this.pos.push(new THREE.Vector3());
      this.nrm.push(new THREE.Vector3());
    }
    this.n = n;
    for (let i = 0; i < n; i++) {
      const to = segments[i];
      const from = prevSegments[Math.min(i, prevSegments.length - 1)] ?? to;
      let cell: Vec2 = to;
      let dx = 0;
      let dy = 0;
      let dz = 0;
      if (t < 1 && !sameCell(from, to)) {
        const hop = findHop(cfg, from, to);
        if (hop) {
          const d = t < 0.5 ? DELTA[hop[0]] : DELTA[hop[1]];
          const k = t < 0.5 ? t : t - 1;
          cell = t < 0.5 ? from : to;
          dx = d.x * k;
          dy = d.y * k;
          dz = d.z * k;
        }
      }
      this.gx[i] = cell.x + dx;
      this.gy[i] = cell.y + dy;
      this.gz[i] = (cell.z ?? 0) + dz;
      this.cx[i] = cell.x;
      this.cy[i] = cell.y;
    }
  }

  /** Step 2: world positions/normals on the current board shape. */
  map(shape: BoardShape): void {
    const p = this.player;
    if (!p) return;
    const n = this.n;
    const segments = p.snake.segments;
    for (let i = 0; i < n; i++) {
      shape.eval(this.gx[i], this.gy[i], this.gz[i], shape.faceOf(this.cx[i], this.cy[i]), 0, this.pos[i], this.nrm[i], this.cx[i], this.cy[i]);
    }
    // Heading of the head for its orientation (fallback for single-segment / not yet moved snakes).
    const h = segments[0];
    if (!h) return;
    const d = DELTA[p.snake.dir];
    if (n > 1 && this.pos[0].distanceToSquared(this.pos[1]) > 1e-4 && this.pos[0].distanceTo(this.pos[1]) < SEAM_DIST) {
      this.fwd.subVectors(this.pos[0], this.pos[1]);
    } else {
      shape.eval(h.x + d.x * 0.2, h.y + d.y * 0.2, (h.z ?? 0) + d.z * 0.2, shape.faceOf(h.x, h.y), 0, tmpA, undefined, h.x, h.y);
      shape.eval(h.x, h.y, h.z ?? 0, shape.faceOf(h.x, h.y), 0, tmpB, undefined, h.x, h.y);
      this.fwd.subVectors(tmpA, tmpB);
    }
  }

  /** Segment i lifted by h along the surface normal. */
  at(i: number, h: number, out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.pos[i]).addScaledVector(this.nrm[i], h);
  }

  /** Midpoint between segments i-1 and i lifted by h; false when the pair is split by a seam. */
  mid(i: number, h: number, out: THREE.Vector3): boolean {
    if (this.pos[i].distanceTo(this.pos[i - 1]) > SEAM_DIST) return false;
    this.at(i, h, out);
    out.add(this.at(i - 1, h, tmpA)).multiplyScalar(0.5);
    return true;
  }

  /** Head orientation: local +X forward, +Y surface normal. */
  headQuat(out: THREE.Quaternion): THREE.Quaternion {
    const up = this.nrm[0];
    const f = tmpA.copy(this.fwd).addScaledVector(up, -this.fwd.dot(up));
    if (f.lengthSq() < 1e-8) f.set(1, 0, 0).addScaledVector(up, -up.x);
    f.normalize();
    const side = tmpB.crossVectors(f, up).normalize();
    tmpM.makeBasis(f, up, side);
    return out.setFromRotationMatrix(tmpM);
  }
}

/** Exit and arrival heading of the single step from `a` to `b`, or null if they are not neighbours. */
function findHop(cfg: GameConfig, a: Vec2, b: Vec2): [Dir, Dir] | null {
  for (const d of dirsFor(cfg)) {
    const r = advance(cfg, a, d);
    if (r && sameCell(r.cell, b)) return [d, r.dir];
  }
  return null;
}
