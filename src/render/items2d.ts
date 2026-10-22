import * as THREE from 'three';
import { ITEMS, TICK_HZ } from '../contracts';
import type { ItemId } from '../sim/types';
import { circleShape, flatGeo, flatMat, flatMesh, polyShape } from './flat';
import type { ItemSpot, ItemViewLike } from './items';
import type { BoardShape } from './shape';

const Y = 0.05;
const BASE_ORDER = 4;
const BLACK = '#000000';
const WHITE = '#ffffff';

type Pt = readonly [number, number];

/** Rectangle rotated by `rot` (rad) around its center, as polygon. */
function rect(cx: number, cy: number, w: number, h: number, rot = 0): THREE.Shape {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const pts: Pt[] = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(
    ([x, y]) => [cx + x * c - y * s, cy + x * s + y * c] as const,
  );
  return polyShape(pts);
}
function halfDisc(cx: number, cy: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  s.absarc(cx, cy, r, 0, Math.PI, false);
  s.closePath();
  return s;
}
function ring(cx: number, cy: number, ro: number, ri: number): THREE.Shape {
  const s = circleShape(cx, cy, ro);
  const hole = new THREE.Path();
  hole.absarc(cx, cy, ri, 0, Math.PI * 2, true);
  s.holes.push(hole);
  return s;
}

/** Shared geometries/materials + builders for the flat item icons (one group of layered meshes per item). */
export interface ItemKit2D {
  make(kind: ItemId): THREE.Group;
  dispose(): void;
}

export function createItemKit2D(): ItemKit2D {
  const geos: THREE.BufferGeometry[] = [];
  const mats = new Map<string, THREE.MeshBasicMaterial>();
  const M = (color: string, glow = 1.25): THREE.MeshBasicMaterial => {
    const key = `${color}|${glow}`;
    let m = mats.get(key);
    if (!m) {
      m = flatMat(color);
      m.color.multiplyScalar(glow);
      mats.set(key, m);
    }
    return m;
  };

  const builders: Record<ItemId, (c: string, add: (s: THREE.Shape, color: string, glow?: number) => void) => void> = {
    apple(c, add) {
      add(rect(0.03, 0.38, 0.07, 0.2, -0.2), '#7a4a1a', 1);
      add(circleShape(0, -0.04, 0.34), c);
      add(circleShape(0.16, 0.4, 0.11), '#33dd44');
      add(circleShape(-0.12, 0.06, 0.07), WHITE, 0.9);
    },
    goldapple(c, add) {
      add(rect(0.03, 0.42, 0.08, 0.22, -0.2), '#8a5a1a', 1);
      add(circleShape(0, -0.02, 0.4), c, 1.4);
      add(circleShape(0.17, 0.46, 0.12), '#ffe066', 1.5);
      add(circleShape(-0.15, 0.1, 0.08), WHITE, 1.2);
    },
    speed(c, add) {
      const pts: Pt[] = [[0.12, 0.6], [-0.3, -0.05], [-0.03, -0.05], [-0.14, -0.6], [0.3, 0.08], [0.05, 0.08], [0.3, 0.6]];
      add(polyShape(pts.map(([x, y]) => [x * 0.85, y * 0.85] as const)), c, 1.3);
    },
    slowmo(c, add) {
      add(polyShape([[-0.3, 0.44], [0.3, 0.44], [0, 0.02]]), c);
      add(polyShape([[0, -0.02], [0.3, -0.44], [-0.3, -0.44]]), c);
      add(rect(0, 0.5, 0.8, 0.08), WHITE, 1);
      add(rect(0, -0.5, 0.8, 0.08), WHITE, 1);
    },
    rain(c, add) {
      add(circleShape(0, -0.12, 0.3), c);
      add(polyShape([[-0.28, -0.03], [0.28, -0.03], [0, 0.52]]), c);
      add(circleShape(-0.1, -0.14, 0.07), WHITE, 0.9);
    },
    mushroom(c, add) {
      add(rect(0, -0.24, 0.28, 0.4), '#f4ead2', 1);
      add(halfDisc(0, -0.06, 0.5), c);
      add(circleShape(-0.2, 0.12, 0.08), WHITE, 1);
      add(circleShape(0.18, 0.16, 0.09), WHITE, 1);
      add(circleShape(0, 0.3, 0.06), WHITE, 1);
    },
    tumble(c, add) {
      add(rect(0, 0, 0.7, 0.7), c, 1.3);
      for (const [x, y] of [[-0.2, -0.2], [0.2, -0.2], [0, 0], [-0.2, 0.2], [0.2, 0.2]]) add(circleShape(x, y, 0.065), BLACK, 1);
    },
    mirror(c, add) {
      add(polyShape([[0, 0.54], [0.32, 0], [0, -0.54], [-0.32, 0]]), c, 1.3);
      add(polyShape([[-0.02, 0.38], [0.06, 0.38], [-0.08, -0.1], [-0.16, -0.1]]), '#8a8a8a', 1);
    },
    ghost(c, add) {
      add(halfDisc(0, 0.05, 0.38), c);
      add(rect(0, -0.1, 0.76, 0.3), c);
      for (const x of [-0.253, 0, 0.253]) add(circleShape(x, -0.25, 0.127), c);
      add(circleShape(-0.14, 0.1, 0.075), BLACK, 1);
      add(circleShape(0.14, 0.1, 0.075), BLACK, 1);
      add(circleShape(0, -0.08, 0.055), BLACK, 1);
    },
    glitch(c, add) {
      add(circleShape(0, 0.08, 0.4), c);
      add(rect(0, -0.24, 0.42, 0.3), c);
      add(circleShape(-0.16, 0.1, 0.1), BLACK, 1);
      add(circleShape(0.16, 0.1, 0.1), BLACK, 1);
      add(polyShape([[0, -0.02], [0.06, -0.11], [-0.06, -0.11]]), BLACK, 1);
      for (const x of [-0.07, 0.07]) add(rect(x, -0.3, 0.04, 0.16), BLACK, 1);
    },
    shrink(c, add) {
      add(rect(0.06, 0.18, 0.1, 0.85, -0.32), c, 1.3);
      add(rect(-0.06, 0.18, 0.1, 0.85, 0.32), c, 1.3);
      add(ring(0.2, -0.38, 0.17, 0.09), WHITE, 1);
      add(ring(-0.2, -0.38, 0.17, 0.09), WHITE, 1);
    },
  };

  return {
    make(kind) {
      const g = new THREE.Group();
      let layer = 0;
      builders[kind](ITEMS[kind].color, (shape, color, glow) => {
        const geo = flatGeo(shape);
        geos.push(geo);
        g.add(flatMesh(geo, M(color, glow), BASE_ORDER + layer++));
      });
      return g;
    },
    dispose() {
      for (const g of geos) g.dispose();
      for (const m of mats.values()) m.dispose();
    },
  };
}

const POP_TIME = 0.35;
const DIE_TIME = 0.18;
const BLINK_TICKS = TICK_HZ * 2;

/** Flat item: no hovering, but pulse, spawn pop, expiry blink and despawn shrink like the 3D one. */
export class Item2DView implements ItemViewLike {
  readonly root = new THREE.Group();
  readonly body: THREE.Group;
  stamp = 0;
  dying = -1;
  spot: ItemSpot = { x: 0, y: 0, ttl: null };
  readonly born: number;

  constructor(
    public readonly kind: ItemId,
    kit: ItemKit2D,
    parent: THREE.Object3D,
    t: number,
    private readonly uid: number,
  ) {
    this.body = kit.make(kind);
    this.root.add(this.body);
    this.born = t;
    this.root.scale.setScalar(0);
    parent.add(this.root);
  }

  update(it: ItemSpot, t: number, shape: BoardShape): boolean {
    const ph = this.uid * 1.7;
    this.spot = it;
    shape.place(this.root, it, Y);
    const pop = Math.min(1, (t - this.born) / POP_TIME);
    const e = pop - 1;
    const popS = 1 + 2.7 * e * e * e + 1.7 * e * e; // easeOutBack
    let s = popS * (1 + 0.07 * Math.sin(t * 4 + ph));
    let vis = true;
    if (it.ttl !== null && it.ttl < BLINK_TICKS) {
      const rate = 4 + 8 * (1 - it.ttl / BLINK_TICKS);
      vis = Math.floor(t * rate * 2) % 2 === 0;
    }
    if (this.dying >= 0) {
      s *= Math.max(0, 1 - (t - this.dying) / DIE_TIME);
      vis = true;
    }
    this.root.visible = vis;
    const k = Math.max(0, s) * 1.3;
    this.root.scale.set(k, 1, k);
    return this.dying < 0 || t - this.dying < DIE_TIME;
  }

  dispose(): void {
    this.root.removeFromParent();
  }
}
