import * as THREE from 'three';
import { ITEMS, TICK_HZ } from '../contracts';
import type { Item, ItemId } from '../sim/types';
import type { BoardShape } from './shape';

/** Shared geometries/materials + builders for the item models. */
export interface ItemKit {
  make(kind: ItemId): THREE.Group;
  dispose(): void;
}

export function createItemKit(): ItemKit {
  const geos: THREE.BufferGeometry[] = [];
  const mats = new Map<string, THREE.Material>();
  const G = <T extends THREE.BufferGeometry>(g: T): T => (geos.push(g), g);
  const M = (color: THREE.ColorRepresentation, glow = 0.55, phong = false): THREE.Material => {
    const key = `${new THREE.Color(color).getHexString()}|${glow}|${phong}`;
    let m = mats.get(key);
    if (!m) {
      m = phong
        ? new THREE.MeshPhongMaterial({ color, emissive: color, emissiveIntensity: glow, shininess: 120, specular: 0xffffff })
        : new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: glow });
      mats.set(key, m);
    }
    return m;
  };
  const dark = () => new THREE.MeshBasicMaterial({ color: 0x000000 });
  const blackMat = dark();
  mats.set('black', blackMat);
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(g, m);
    o.position.set(x, y, z);
    return o;
  };

  const sphere = (r: number) => G(new THREE.SphereGeometry(r, 16, 12));
  const builders: Record<ItemId, (c: string) => THREE.Group> = {
    apple(c) {
      const g = new THREE.Group();
      g.add(mesh(sphere(0.36), M(c)));
      g.add(mesh(G(new THREE.CylinderGeometry(0.03, 0.04, 0.2, 6)), M('#7a4a1a', 0.2), 0, 0.4, 0));
      const leaf = mesh(sphere(0.1), M('#33dd44'), 0.1, 0.46, 0);
      leaf.scale.set(1.6, 0.35, 0.8);
      leaf.rotation.z = 0.4;
      g.add(leaf);
      return g;
    },
    goldapple(c) {
      const g = new THREE.Group();
      g.add(mesh(sphere(0.42), M(c, 0.7, true)));
      g.add(mesh(G(new THREE.CylinderGeometry(0.03, 0.05, 0.22, 6)), M('#8a5a1a', 0.3), 0, 0.46, 0));
      const leaf = mesh(sphere(0.1), M('#ffe066', 0.8), 0.12, 0.52, 0);
      leaf.scale.set(1.6, 0.35, 0.8);
      leaf.rotation.z = 0.4;
      g.add(leaf);
      return g;
    },
    speed(c) {
      const s = new THREE.Shape();
      const pts = [[0.12, 0.6], [-0.3, -0.05], [-0.03, -0.05], [-0.14, -0.6], [0.3, 0.08], [0.05, 0.08], [0.3, 0.6]];
      s.moveTo(pts[0][0], pts[0][1]);
      for (const p of pts.slice(1)) s.lineTo(p[0], p[1]);
      s.closePath();
      const geo = G(new THREE.ExtrudeGeometry(s, { depth: 0.2, bevelEnabled: false }));
      geo.translate(0, 0, -0.1);
      const g = new THREE.Group();
      g.add(mesh(geo, M(c, 0.8)));
      g.scale.setScalar(0.85);
      return g;
    },
    slowmo(c) {
      const g = new THREE.Group();
      const cone = G(new THREE.ConeGeometry(0.36, 0.45, 16));
      const top = mesh(cone, M(c, 0.6), 0, 0.225, 0);
      top.rotation.x = Math.PI;
      g.add(top, mesh(cone, M(c, 0.6), 0, -0.225, 0));
      const cap = G(new THREE.CylinderGeometry(0.4, 0.4, 0.07, 16));
      g.add(mesh(cap, M('#ffffff', 0.5), 0, 0.48, 0), mesh(cap, M('#ffffff', 0.5), 0, -0.48, 0));
      return g;
    },
    rain(c) {
      const g = new THREE.Group();
      g.add(mesh(sphere(0.3), M(c, 0.7), 0, -0.15, 0));
      g.add(mesh(G(new THREE.ConeGeometry(0.27, 0.5, 16)), M(c, 0.7), 0, 0.2, 0));
      return g;
    },
    mushroom(c) {
      const g = new THREE.Group();
      g.add(mesh(G(new THREE.SphereGeometry(0.5, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2)), M(c, 0.6), 0, -0.05, 0));
      g.add(mesh(G(new THREE.CylinderGeometry(0.15, 0.2, 0.4, 10)), M('#f4ead2', 0.4), 0, -0.25, 0));
      const spotGeo = sphere(0.08);
      const spots: [number, number, number][] = [[0.25, 0.4, 0.1], [-0.2, 0.42, 0.2], [0.05, 0.5, -0.22], [-0.3, 0.3, -0.2]];
      for (const [x, y, z] of spots) {
        const v = new THREE.Vector3(x, y, z).normalize().multiplyScalar(0.5);
        g.add(mesh(spotGeo, M('#ffffff', 0.8), v.x, v.y - 0.05, v.z));
      }
      return g;
    },
    tumble(c) {
      const g = new THREE.Group();
      g.add(mesh(G(new THREE.BoxGeometry(0.6, 0.6, 0.6)), M(c, 0.7)));
      return g;
    },
    mirror(c) {
      const g = new THREE.Group();
      const m = mesh(G(new THREE.OctahedronGeometry(0.5)), M(c, 0.8));
      m.scale.set(0.7, 1.1, 0.35);
      g.add(m);
      return g;
    },
    ghost(c) {
      const g = new THREE.Group();
      const m = M(c, 0.7);
      g.add(mesh(sphere(0.38), m, 0, 0.1, 0));
      g.add(mesh(G(new THREE.CylinderGeometry(0.38, 0.38, 0.4, 16)), m, 0, -0.1, 0));
      const foot = sphere(0.14);
      for (const x of [-0.24, 0, 0.24]) g.add(mesh(foot, m, x, -0.3, 0));
      const eye = sphere(0.075);
      g.add(mesh(eye, blackMat, -0.14, 0.14, 0.34), mesh(eye, blackMat, 0.14, 0.14, 0.34));
      g.add(mesh(G(new THREE.SphereGeometry(0.07, 8, 6)), blackMat, 0, -0.02, 0.37));
      return g;
    },
    glitch(c) {
      const g = new THREE.Group();
      const m = M(c, 0.7);
      g.add(mesh(sphere(0.4), m, 0, 0.1, 0));
      g.add(mesh(G(new THREE.BoxGeometry(0.4, 0.22, 0.3)), m, 0, -0.27, 0));
      const eye = sphere(0.1);
      g.add(mesh(eye, blackMat, -0.16, 0.12, 0.33), mesh(eye, blackMat, 0.16, 0.12, 0.33));
      g.add(mesh(G(new THREE.ConeGeometry(0.05, 0.12, 4)), blackMat, 0, -0.03, 0.4));
      return g;
    },
    shrink(c) {
      const g = new THREE.Group();
      const blade = G(new THREE.BoxGeometry(0.1, 0.9, 0.05));
      const m = M(c, 0.7);
      const a = mesh(blade, m, 0.08, 0.15, 0);
      a.rotation.z = -0.32;
      const b = mesh(blade, m, -0.08, 0.15, 0);
      b.rotation.z = 0.32;
      g.add(a, b);
      const ring = G(new THREE.TorusGeometry(0.13, 0.04, 8, 14));
      g.add(mesh(ring, M('#ffffff', 0.5), 0.2, -0.4, 0), mesh(ring, M('#ffffff', 0.5), -0.2, -0.4, 0));
      return g;
    },
  };

  return {
    make(kind) {
      return builders[kind](ITEMS[kind].color);
    },
    dispose() {
      for (const g of geos) g.dispose();
      for (const m of mats.values()) m.dispose();
    },
  };
}

const SPIN: Partial<Record<ItemId, number>> = { goldapple: 2, speed: 1.8, slowmo: 1.2, tumble: 1.4, mirror: 1.6, shrink: 1.1, rain: 1.0 };
const POP_TIME = 0.35;
const DIE_TIME = 0.18;
const BLINK_TICKS = TICK_HZ * 2;

/** Board cell plus remaining lifetime; dying views keep their last one. */
export type ItemSpot = Pick<Item, 'x' | 'y' | 'z' | 'ttl'>;

/** Common surface of the 3D and 2D item views. */
export interface ItemViewLike {
  readonly kind: ItemId;
  readonly root: THREE.Object3D;
  stamp: number;
  dying: number;
  /** Last spot passed to update(). */
  spot: ItemSpot;
  update(it: ItemSpot, t: number, shape: BoardShape): boolean;
  dispose(): void;
}

export class ItemView implements ItemViewLike {
  readonly root = new THREE.Group();
  readonly body: THREE.Group;
  stamp = 0;
  dying = -1;
  spot: ItemSpot = { x: 0, y: 0, ttl: null };
  readonly born: number;

  constructor(
    public readonly kind: ItemId,
    kit: ItemKit,
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
    shape.place(this.root, it, 0.55 + 0.1 * Math.sin(t * 2.5 + ph));
    const spin = SPIN[this.kind];
    this.body.rotation.y = spin ? t * spin : Math.sin(t * 1.5 + ph) * 0.45;
    if (this.kind === 'tumble') this.body.rotation.x = t * 1.1;
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
    this.root.scale.setScalar(Math.max(0, s));
    return this.dying < 0 || t - this.dying < DIE_TIME;
  }

  dispose(): void {
    this.root.removeFromParent();
  }
}
