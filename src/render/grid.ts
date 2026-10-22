import * as THREE from 'three';
import type { GameConfig } from '../sim/types';
import { isCell } from '../sim/world';
import type { BoardShape } from './shape';

export interface GridView {
  object: THREE.Group;
  /** Re-maps all vertices if the shape changed since the last call. */
  update(): void;
  dispose(): void;
}

interface Edge {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Owning cell (for the sphere face and torus wrapping). */
  cx: number;
  cy: number;
}

const INNER = 0x2a2a2a;
const BORDER = 0x555555;
/** Occluder sits slightly below the lines so the far side of closed surfaces is hidden. */
const OCCLUDER_H = -0.05;

/**
 * Grey cell outlines of the board (floor layer for 'volume'), mapped through the BoardShape.
 * Outline edges (walls, torus seams, cube-net edges) are brighter; on closed surfaces they fade to the
 * inner color. Curved worlds also get a black occluder mesh so lines and snakes behind the surface vanish.
 */
export function createGrid(cfg: GameConfig, shape: BoardShape): GridView {
  const plane = { ...cfg, world: cfg.world === 'volume' ? 'flat' : cfg.world } as GameConfig;
  const inner: Edge[] = [];
  const border: Edge[] = [];
  const seen = new Set<string>();
  for (let cy = 0; cy < cfg.height; cy++) {
    for (let cx = 0; cx < cfg.width; cx++) {
      if (!isCell(plane, { x: cx, y: cy })) continue;
      const sides: [number, number, number, number, number, number][] = [
        [cx - 0.5, cy - 0.5, cx + 0.5, cy - 0.5, cx, cy - 1],
        [cx - 0.5, cy + 0.5, cx + 0.5, cy + 0.5, cx, cy + 1],
        [cx - 0.5, cy - 0.5, cx - 0.5, cy + 0.5, cx - 1, cy],
        [cx + 0.5, cy - 0.5, cx + 0.5, cy + 0.5, cx + 1, cy],
      ];
      for (const [x0, y0, x1, y1, nx, ny] of sides) {
        const key = `${x0},${y0},${x1},${y1}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const outer = !isCell(plane, { x: nx, y: ny });
        (outer ? border : inner).push({ x0, y0, x1, y1, cx, cy });
      }
    }
  }

  const curvedWorld = cfg.world === 'torus' || cfg.world === 'sphere';
  const sub = curvedWorld ? 4 : 1;
  const mk = (edges: Edge[], color: number) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(edges.length * sub * 6), 3));
    const m = new THREE.LineBasicMaterial({ color });
    const l = new THREE.LineSegments(g, m);
    l.frustumCulled = false;
    return l;
  };
  const a = mk(inner, INNER);
  const b = mk(border, BORDER);
  const object = new THREE.Group();
  object.add(a, b);

  let occ: THREE.Mesh | null = null;
  const cells: [number, number][] = [];
  if (curvedWorld) {
    for (let cy = 0; cy < cfg.height; cy++) for (let cx = 0; cx < cfg.width; cx++) if (isCell(plane, { x: cx, y: cy })) cells.push([cx, cy]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cells.length * 9 * 3), 3));
    const idx: number[] = [];
    for (let c = 0; c < cells.length; c++) {
      const o = c * 9;
      for (let j = 0; j < 2; j++) {
        for (let i = 0; i < 2; i++) {
          const v = o + j * 3 + i;
          idx.push(v, v + 3, v + 1, v + 1, v + 3, v + 4);
        }
      }
    }
    g.setIndex(idx);
    const m = new THREE.MeshBasicMaterial({
      color: 0x000000, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
    });
    occ = new THREE.Mesh(g, m);
    occ.frustumCulled = false;
    object.add(occ);
  }

  const v = new THREE.Vector3();
  let version = -1;

  function writeEdges(line: THREE.LineSegments, edges: Edge[]): void {
    const attr = line.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    let k = 0;
    for (const e of edges) {
      const face = shape.faceOf(e.cx, e.cy);
      for (let s = 0; s < sub; s++) {
        for (const t of [s / sub, (s + 1) / sub]) {
          shape.eval(e.x0 + (e.x1 - e.x0) * t, e.y0 + (e.y1 - e.y0) * t, 0, face, 0, v, undefined, e.cx, e.cy);
          arr[k++] = v.x;
          arr[k++] = v.y;
          arr[k++] = v.z;
        }
      }
    }
    attr.needsUpdate = true;
  }

  function writeOccluder(mesh: THREE.Mesh): void {
    const attr = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    let k = 0;
    for (const [cx, cy] of cells) {
      const face = shape.faceOf(cx, cy);
      for (let j = 0; j < 3; j++) {
        for (let i = 0; i < 3; i++) {
          shape.eval(cx - 0.5 + i * 0.5, cy - 0.5 + j * 0.5, 0, face, OCCLUDER_H, v, undefined, cx, cy);
          arr[k++] = v.x;
          arr[k++] = v.y;
          arr[k++] = v.z;
        }
      }
    }
    attr.needsUpdate = true;
  }

  const borderMat = b.material as THREE.LineBasicMaterial;
  const cInner = new THREE.Color(INNER);
  const cBorder = new THREE.Color(BORDER);

  return {
    object,
    update() {
      if (shape.version === version) return;
      version = shape.version;
      writeEdges(a, inner);
      writeEdges(b, border);
      if (occ) writeOccluder(occ);
      borderMat.color.lerpColors(cBorder, cInner, curvedWorld ? Math.min(1, shape.morphValue * 1.5) : 0);
    },
    dispose() {
      for (const l of [a, b]) {
        l.geometry.dispose();
        (l.material as THREE.Material).dispose();
      }
      if (occ) {
        occ.geometry.dispose();
        (occ.material as THREE.Material).dispose();
      }
    },
  };
}
