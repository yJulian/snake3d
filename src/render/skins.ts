import * as THREE from 'three';

/**
 * Skin API. Add a new skin by calling registerSkin({...}) (and adding its id to SKINS in contracts.ts).
 *  - colorAt(i, len, t, out): linear color of segment i (0 = head) of a snake with `len` segments at time t.
 *    Components may exceed 1 (bloom).
 *  - headColor(t, out): color of the head body.
 *  - createHead(): decoration attached to the head (local +X is forward, +Y up). Eyes, faces, stems ...
 *  - segmentScale (optional): radius multiplier per segment; headScale (optional): head ellipsoid scale.
 */
export interface HeadDecoration {
  object: THREE.Object3D;
  update(timeSec: number, alive: boolean): void;
  dispose(): void;
}

export interface Skin {
  id: string;
  colorAt(i: number, len: number, t: number, out: THREE.Color): void;
  headColor(t: number, out: THREE.Color): void;
  createHead(): HeadDecoration;
  segmentScale?(i: number, len: number, t: number): number;
  headScale?: readonly [number, number, number];
}

const SRGB = THREE.SRGBColorSpace;
const fract = (v: number) => v - Math.floor(v);
const hash = (n: number) => fract(Math.sin(n * 12.9898 + 4.1414) * 43758.5453);

function eyesHead(): HeadDecoration {
  const g = new THREE.Group();
  const eyeGeo = new THREE.SphereGeometry(0.15, 12, 10);
  const pupilGeo = new THREE.SphereGeometry(0.075, 10, 8);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const deadMat = new THREE.MeshBasicMaterial({ color: 0xff3030 });
  const pupils: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(eyeGeo, eyeMat);
    e.position.set(0.28, 0.24, 0.27 * s);
    const p = new THREE.Mesh(pupilGeo, pupilMat);
    p.position.set(0.12, 0, 0);
    e.add(p);
    pupils.push(p);
    g.add(e);
  }
  return {
    object: g,
    update(_t, alive) {
      for (const p of pupils) p.material = alive ? pupilMat : deadMat;
    },
    dispose() {
      eyeGeo.dispose();
      pupilGeo.dispose();
      eyeMat.dispose();
      pupilMat.dispose();
      deadMat.dispose();
    },
  };
}

function pumpkinHead(): HeadDecoration {
  const g = new THREE.Group();
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.2, 0.1), side: THREE.DoubleSide });
  const stemMat = new THREE.MeshLambertMaterial({ color: 0x2f9e2f, emissive: 0x145214 });
  const eye = new THREE.Shape();
  eye.moveTo(0, 0.1).lineTo(-0.09, -0.06).lineTo(0.09, -0.06).closePath();
  const eyeGeo = new THREE.ShapeGeometry(eye);
  eyeGeo.rotateY(Math.PI / 2);
  const mouth = new THREE.Shape();
  const top: [number, number][] = [[-0.26, 0.04], [-0.17, -0.04], [-0.09, 0.04], [0, -0.04], [0.09, 0.04], [0.17, -0.04], [0.26, 0.04]];
  mouth.moveTo(top[0][0], top[0][1]);
  for (let i = 1; i < top.length; i++) mouth.lineTo(top[i][0], top[i][1]);
  mouth.lineTo(0.2, -0.13).lineTo(-0.2, -0.13).closePath();
  const mouthGeo = new THREE.ShapeGeometry(mouth);
  mouthGeo.rotateY(Math.PI / 2);
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(eyeGeo, glow);
    m.position.set(0.545, 0.12, 0.2 * s);
    g.add(m);
  }
  const mo = new THREE.Mesh(mouthGeo, glow);
  mo.position.set(0.54, -0.14, 0);
  g.add(mo);
  const stemGeo = new THREE.CylinderGeometry(0.05, 0.09, 0.26, 8);
  const stem = new THREE.Mesh(stemGeo, stemMat);
  stem.position.set(-0.03, 0.55, 0);
  stem.rotation.z = 0.25;
  g.add(stem);
  return {
    object: g,
    update(t, alive) {
      const k = alive ? 1.2 + 0.4 * Math.sin(t * 9) * Math.sin(t * 2.3) : 0.2;
      glow.color.setRGB(1.4 * k, 0.95 * k, 0.05);
    },
    dispose() {
      glow.dispose();
      stemMat.dispose();
      eyeGeo.dispose();
      mouthGeo.dispose();
      stemGeo.dispose();
    },
  };
}

const classic: Skin = {
  id: 'classic',
  colorAt(i, len, _t, out) {
    const k = 1 - 0.35 * (i / Math.max(1, len));
    out.setRGB(0.08 * k, 1.0 * k, 0.2 * k);
  },
  headColor(_t, out) {
    out.setRGB(0.15, 1.3, 0.3);
  },
  createHead: eyesHead,
};

const rainbow: Skin = {
  id: 'rainbow',
  colorAt(i, _len, t, out) {
    out.setHSL(fract(i * 0.06 - t * 0.35), 1, 0.5, SRGB).multiplyScalar(1.3);
  },
  headColor(t, out) {
    out.setHSL(fract(-t * 0.35), 1, 0.5, SRGB).multiplyScalar(1.5);
  },
  createHead: eyesHead,
};

const _tmp = new THREE.Color();
const pumpkin: Skin = {
  id: 'pumpkin',
  colorAt(i, _len, _t, out) {
    if (i % 2 === 0) out.setRGB(1.0, 0.25, 0.01);
    else out.setRGB(0.42, 0.09, 0.0);
  },
  headColor(_t, out) {
    out.setRGB(1.1, 0.3, 0.01);
  },
  segmentScale: (i) => (i % 2 === 0 ? 1.0 : 0.88),
  headScale: [1, 0.88, 1.05],
  createHead: pumpkinHead,
};

const neon: Skin = {
  id: 'neon',
  colorAt(i, _len, t, out) {
    const m = 0.5 + 0.5 * Math.sin(i * 0.9 - t * 4);
    out.setRGB(1.5, 0.05, 0.85);
    _tmp.setRGB(0.04, 1.2, 1.6);
    out.lerp(_tmp, m);
  },
  headColor(t, out) {
    const m = 0.5 + 0.5 * Math.sin(-t * 4);
    out.setRGB(1.8, 0.12, 1.0);
    _tmp.setRGB(0.1, 1.5, 1.9);
    out.lerp(_tmp, m);
  },
  createHead: eyesHead,
};

const lava: Skin = {
  id: 'lava',
  colorAt(i, _len, t, out) {
    const p = 0.5 + 0.5 * Math.sin(t * 3 - i * 0.55);
    const f = 0.85 + 0.15 * Math.sin(t * 23 + i * 7.3) * Math.sin(t * 11 + i);
    out.setRGB(0.6 + 1.0 * p, 0.04 + 0.45 * p * p, 0.0).multiplyScalar(f);
  },
  headColor(t, out) {
    const p = 0.5 + 0.5 * Math.sin(t * 3);
    out.setRGB(1.4 + 0.4 * p, 0.25 + 0.3 * p, 0.0);
  },
  createHead: eyesHead,
};

const galaxy: Skin = {
  id: 'galaxy',
  colorAt(i, _len, t, out) {
    const sh = 0.5 + 0.5 * Math.sin(t * 0.8 + i * 0.5);
    out.setRGB(0.07 + 0.1 * sh, 0.02 + 0.05 * (1 - sh), 0.28 + 0.25 * sh);
    const tw = Math.pow(Math.max(0, Math.sin(t * (2 + hash(i) * 3) + hash(i + 9) * 40)), 12);
    out.r += tw * 2.0;
    out.g += tw * 2.0;
    out.b += tw * 2.4;
  },
  headColor(t, out) {
    const tw = Math.pow(Math.max(0, Math.sin(t * 3)), 10);
    out.setRGB(0.25 + tw, 0.1 + tw, 0.7 + tw);
  },
  createHead: eyesHead,
};

const registry = new Map<string, Skin>();
export function registerSkin(skin: Skin): void {
  registry.set(skin.id, skin);
}
for (const s of [classic, rainbow, pumpkin, neon, lava, galaxy]) registerSkin(s);

export function getSkin(id: string): Skin {
  return registry.get(id) ?? classic;
}
