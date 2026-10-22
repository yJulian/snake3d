import type { Dir, GameConfig, Vec2 } from './types';

/**
 * Board topologies.
 *  - flat:   rectangle with walls.
 *  - torus:  rectangle whose opposite edges are glued (leave right -> enter left, top <-> bottom).
 *  - sphere: cube surface (rendered as an inflated cube = sphere). Cells live in a cross-shaped net
 *            of size 4N x 3N; leaving a face enters the neighbouring face, possibly with a new heading.
 *  - volume: N x N x N box with walls; the snake also moves along z (ascend / descend).
 */
export const WORLD_IDS = ['flat', 'torus', 'sphere', 'volume'] as const;
export type WorldId = (typeof WORLD_IDS)[number];

/** Board dimensions per world (cells). sphere: face size N = height / 3. */
export const WORLD_SIZES: Record<WorldId, Pick<GameConfig, 'width' | 'height' | 'depth'>> = {
  flat: { width: 24, height: 24, depth: 1 },
  torus: { width: 36, height: 16, depth: 1 },
  sphere: { width: 40, height: 30, depth: 1 },
  volume: { width: 12, height: 12, depth: 12 },
};

export const PLANAR_DIRS: readonly Dir[] = ['up', 'down', 'left', 'right'];
export const VOLUME_DIRS: readonly Dir[] = ['up', 'down', 'left', 'right', 'ascend', 'descend'];

export const DELTA: Record<Dir, { x: number; y: number; z: number }> = {
  up: { x: 0, y: -1, z: 0 },
  down: { x: 0, y: 1, z: 0 },
  left: { x: -1, y: 0, z: 0 },
  right: { x: 1, y: 0, z: 0 },
  ascend: { x: 0, y: 0, z: 1 },
  descend: { x: 0, y: 0, z: -1 },
};

export function dirsFor(cfg: GameConfig): readonly Dir[] {
  return cfg.world === 'volume' ? VOLUME_DIRS : PLANAR_DIRS;
}

export function sameCell(a: Vec2, b: Vec2): boolean {
  return a.x === b.x && a.y === b.y && (a.z ?? 0) === (b.z ?? 0);
}

// ---------------------------------------------------------------------------
// Cube net. Faces in the net (N = face size):
//        [T]
//    [L] [F] [R] [B]
//        [D]
// Each face maps its local cell (i, j) to a point on the cube [0, 2N]^3 in doubled coordinates
// (cell centers are odd numbers), with net +x = face axis u and net +y = face axis v.

type V3 = readonly [number, number, number];
interface Face {
  /** Net origin (cells). */
  ox: number;
  oy: number;
  /** Doubled-coordinate position of local (i, j): base + (2i+1) * u + (2j+1) * v. */
  base: V3;
  u: V3;
  v: V3;
  n: V3;
}

interface CubeNet {
  faces: Face[];
  /** "x,y,z" (doubled 3D) -> net cell index y * width + x. */
  byPos: Map<string, number>;
}

const cubeCache = new Map<number, CubeNet>();

function cubeNet(N: number): CubeNet {
  let net = cubeCache.get(N);
  if (net) return net;
  const M = 2 * N;
  const faces: Face[] = [
    { ox: N, oy: 0, base: [0, M, 0], u: [1, 0, 0], v: [0, 0, 1], n: [0, 1, 0] }, // T
    { ox: 0, oy: N, base: [0, M, 0], u: [0, 0, 1], v: [0, -1, 0], n: [-1, 0, 0] }, // L
    { ox: N, oy: N, base: [0, M, M], u: [1, 0, 0], v: [0, -1, 0], n: [0, 0, 1] }, // F
    { ox: 2 * N, oy: N, base: [M, M, M], u: [0, 0, -1], v: [0, -1, 0], n: [1, 0, 0] }, // R
    { ox: 3 * N, oy: N, base: [M, M, 0], u: [-1, 0, 0], v: [0, -1, 0], n: [0, 0, -1] }, // B
    { ox: N, oy: 2 * N, base: [0, 0, M], u: [1, 0, 0], v: [0, 0, -1], n: [0, -1, 0] }, // D
  ];
  const byPos = new Map<string, number>();
  for (const f of faces) {
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const p = cubePos(f, i, j);
        byPos.set(p.join(','), (f.oy + j) * 4 * N + f.ox + i);
      }
    }
  }
  net = { faces, byPos };
  cubeCache.set(N, net);
  return net;
}

function cubePos(f: Face, i: number, j: number): [number, number, number] {
  const a = 2 * i + 1;
  const b = 2 * j + 1;
  return [0, 1, 2].map((k) => f.base[k] + a * f.u[k] + b * f.v[k]) as [number, number, number];
}

/** Face index (0..5) of a net cell, or -1 outside the net. */
export function cubeFace(N: number, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= 4 * N || y >= 3 * N) return -1;
  const fx = Math.floor(x / N);
  const fy = Math.floor(y / N);
  if (fy === 1) return 1 + fx; // L F R B
  if (fx !== 1) return -1;
  return fy === 0 ? 0 : 5;
}

function dirVec(f: Face, d: Dir): V3 {
  const s = d === 'left' || d === 'up' ? -1 : 1;
  const a = d === 'left' || d === 'right' ? f.u : f.v;
  return [a[0] * s, a[1] * s, a[2] * s];
}

function vecDir(f: Face, v: V3): Dir {
  const du = v[0] * f.u[0] + v[1] * f.u[1] + v[2] * f.u[2];
  const dv = v[0] * f.v[0] + v[1] * f.v[1] + v[2] * f.v[2];
  if (du !== 0) return du > 0 ? 'right' : 'left';
  return dv > 0 ? 'down' : 'up';
}

/** Result of one step on the board: the next cell and the heading after the step. */
export interface Advance {
  cell: Vec2;
  dir: Dir;
  /**
   * Remaps a direction expressed in the old heading frame to the new one (identity except when a
   * sphere step crosses a cube edge). Used to keep queued turns meaningful.
   */
  remap(d: Dir): Dir;
}

const identity = (d: Dir) => d;

/** Moves one cell from `c` in direction `d`. Returns null when the step hits a wall. */
export function advance(cfg: GameConfig, c: Vec2, d: Dir): Advance | null {
  const D = DELTA[d];
  const { width: w, height: h } = cfg;
  switch (cfg.world) {
    case 'flat': {
      if (D.z !== 0) return null;
      const x = c.x + D.x;
      const y = c.y + D.y;
      return x < 0 || y < 0 || x >= w || y >= h ? null : { cell: { x, y }, dir: d, remap: identity };
    }
    case 'torus': {
      if (D.z !== 0) return null;
      return { cell: { x: (c.x + D.x + w) % w, y: (c.y + D.y + h) % h }, dir: d, remap: identity };
    }
    case 'volume': {
      const x = c.x + D.x;
      const y = c.y + D.y;
      const z = (c.z ?? 0) + D.z;
      if (x < 0 || y < 0 || z < 0 || x >= w || y >= h || z >= cfg.depth) return null;
      return { cell: { x, y, z }, dir: d, remap: identity };
    }
    case 'sphere': {
      if (D.z !== 0) return null;
      const N = h / 3;
      const net = cubeNet(N);
      const fi = cubeFace(N, c.x, c.y);
      if (fi < 0) return null;
      const f = net.faces[fi];
      const p = cubePos(f, c.x - f.ox, c.y - f.oy);
      const dv = dirVec(f, d);
      const M = 2 * N;
      const q = [p[0] + 2 * dv[0], p[1] + 2 * dv[1], p[2] + 2 * dv[2]];
      let n2: V3 = f.n;
      if (q.some((v) => v < 0 || v > M)) {
        // Over the edge: the new face's normal is the old heading, the new heading is -old normal.
        for (let k = 0; k < 3; k++) q[k] = p[k] + dv[k] - f.n[k];
        n2 = dv;
      }
      const idx = net.byPos.get(q.join(','));
      if (idx === undefined) return null;
      const cell = { x: idx % w, y: Math.floor(idx / w) };
      const f2 = net.faces[cubeFace(N, cell.x, cell.y)];
      if (n2 === f.n) {
        return { cell, dir: vecDir(f2, dv), remap: (e) => vecDir(f2, dirVec(f, e)) };
      }
      // Rotation that maps old normal -> old heading and old heading -> -old normal.
      const rot = (v: V3): V3 => {
        const a = v[0] * dv[0] + v[1] * dv[1] + v[2] * dv[2];
        const b = v[0] * f.n[0] + v[1] * f.n[1] + v[2] * f.n[2];
        return [0, 1, 2].map((k) => v[k] - a * dv[k] - b * f.n[k] - a * f.n[k] + b * dv[k]) as unknown as V3;
      };
      return { cell, dir: vecDir(f2, rot(dv)), remap: (e) => vecDir(f2, rot(dirVec(f, e))) };
    }
  }
}

/** Whether `c` is a playable cell. */
export function isCell(cfg: GameConfig, c: Vec2): boolean {
  if (c.x < 0 || c.y < 0 || c.x >= cfg.width || c.y >= cfg.height) return false;
  const z = c.z ?? 0;
  if (z < 0 || z >= (cfg.world === 'volume' ? cfg.depth : 1)) return false;
  return cfg.world !== 'sphere' || cubeFace(cfg.height / 3, c.x, c.y) >= 0;
}

/** Dense index of a cell (for occupancy arrays). */
export function cellIndex(cfg: GameConfig, c: Vec2): number {
  return ((c.z ?? 0) * cfg.height + c.y) * cfg.width + c.x;
}

/** All playable cells, ordered by layer, then row, then column. 2D worlds omit z. */
export function allCells(cfg: GameConfig): Vec2[] {
  const out: Vec2[] = [];
  const layers = cfg.world === 'volume' ? cfg.depth : 1;
  for (let z = 0; z < layers; z++) {
    for (let y = 0; y < cfg.height; y++) {
      for (let x = 0; x < cfg.width; x++) {
        const c: Vec2 = cfg.world === 'volume' ? { x, y, z } : { x, y };
        if (isCell(cfg, c)) out.push(c);
      }
    }
  }
  return out;
}
