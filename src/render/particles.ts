import * as THREE from 'three';

const MAX = 600;

export class Particles {
  readonly points: THREE.Points;
  private pos = new Float32Array(MAX * 3);
  private col = new Float32Array(MAX * 3);
  private vel = new Float32Array(MAX * 3);
  private life = new Float32Array(MAX);
  private maxLife = new Float32Array(MAX);
  private base = new Float32Array(MAX * 3);
  private next = 0;
  private geo = new THREE.BufferGeometry();
  private mat: THREE.PointsMaterial;
  private tex: THREE.CanvasTexture;
  private c = new THREE.Color();

  constructor(parent: THREE.Object3D) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 32;
    const ctx = cv.getContext('2d');
    if (ctx) {
      const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.6)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 32, 32);
    }
    this.tex = new THREE.CanvasTexture(cv);
    this.mat = new THREE.PointsMaterial({
      size: 0.32,
      map: this.tex,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    parent.add(this.points);
  }

  burst(x: number, y: number, z: number, color: THREE.ColorRepresentation, count: number, speed: number, life: number): void {
    this.c.set(color).multiplyScalar(1.6);
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX;
      const a = Math.random() * Math.PI * 2;
      const u = Math.random() * 2 - 1;
      const r = Math.sqrt(1 - u * u);
      const s = speed * (0.4 + Math.random() * 0.8);
      this.pos[i * 3] = x;
      this.pos[i * 3 + 1] = y;
      this.pos[i * 3 + 2] = z;
      this.vel[i * 3] = Math.cos(a) * r * s;
      this.vel[i * 3 + 1] = Math.abs(u) * s + speed * 0.3;
      this.vel[i * 3 + 2] = Math.sin(a) * r * s;
      this.base[i * 3] = this.c.r;
      this.base[i * 3 + 1] = this.c.g;
      this.base[i * 3 + 2] = this.c.b;
      this.life[i] = this.maxLife[i] = life * (0.6 + Math.random() * 0.6);
    }
  }

  update(dt: number): void {
    const damp = Math.exp(-2.2 * dt);
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      const i3 = i * 3;
      this.vel[i3] *= damp;
      this.vel[i3 + 1] = this.vel[i3 + 1] * damp - 4 * dt;
      this.vel[i3 + 2] *= damp;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      this.col[i3] = this.base[i3] * k;
      this.col[i3 + 1] = this.base[i3 + 1] * k;
      this.col[i3 + 2] = this.base[i3 + 2] * k;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }

  clear(): void {
    this.life.fill(0);
    this.col.fill(0);
  }

  dispose(): void {
    this.points.removeFromParent();
    this.geo.dispose();
    this.mat.dispose();
    this.tex.dispose();
  }
}
