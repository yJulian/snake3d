import { HalfFloatType, NoBlending, ShaderMaterial, Vector3, WebGLRenderTarget, type WebGLRenderer } from 'three';
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js';

/**
 * Phosphor afterimage for the ghost effect (feedback buffer).
 * history' = max(current, history * decay - epsilon) – the trail only lives where color was,
 * decays per channel (green lasts longest, like P1 phosphor), is pulled down to exact
 * 0 so black stays #000, and only colored pixels leave a trail (grey grid never smears).
 */
const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const feedbackFragment = /* glsl */ `
uniform sampler2D tCurrent;
uniform sampler2D tHistory;
uniform vec3 uDecay;     // per-channel multiplier for this frame
uniform float uFloor;    // subtracted each frame so the trail reaches true black
uniform float uAmount;   // ghost intensity 0..1
varying vec2 vUv;
void main() {
  vec3 cur = texture2D(tCurrent, vUv).rgb;
  vec3 hist = texture2D(tHistory, vUv).rgb;
  vec3 trail = max(hist * uDecay - uFloor, 0.0) * uAmount;
  // only colored light leaves a trail – grey grid lines / dim specks never smear into a grey film
  float chroma = max(trail.r, max(trail.g, trail.b)) - min(trail.r, min(trail.g, trail.b));
  trail *= smoothstep(0.03, 0.1, chroma);
  gl_FragColor = vec4(max(cur, trail), 1.0);
}`;

const copyFragment = /* glsl */ `
uniform sampler2D tDiffuse;
varying vec2 vUv;
void main() { gl_FragColor = texture2D(tDiffuse, vUv); }`;

/** Base per-channel decay at 60 fps. */
const DECAY_60 = new Vector3(0.86, 0.93, 0.885);

export class PhosphorPass extends Pass {
  private readonly feedback: ShaderMaterial;
  private readonly copy: ShaderMaterial;
  private readonly quad: FullScreenQuad;
  private history: [WebGLRenderTarget, WebGLRenderTarget];
  private needsClear = true;

  constructor() {
    super();
    this.feedback = new ShaderMaterial({
      uniforms: {
        tCurrent: { value: null },
        tHistory: { value: null },
        uDecay: { value: new Vector3(1, 1, 1) },
        uFloor: { value: 0 },
        uAmount: { value: 0 },
      },
      vertexShader,
      fragmentShader: feedbackFragment,
      blending: NoBlending,
      depthTest: false,
      depthWrite: false,
    });
    this.copy = new ShaderMaterial({
      uniforms: { tDiffuse: { value: null } },
      vertexShader,
      fragmentShader: copyFragment,
      blending: NoBlending,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.feedback);
    this.history = [this.makeTarget(1, 1), this.makeTarget(1, 1)];
    this.enabled = false;
  }

  private makeTarget(w: number, h: number): WebGLRenderTarget {
    return new WebGLRenderTarget(w, h, { type: HalfFloatType, depthBuffer: false });
  }

  /** amount = fx.ghost; dtSec = frame time (0 while paused → trail freezes). */
  setParams(amount: number, dtSec: number): void {
    const on = amount > 0.001;
    if (on && !this.enabled) this.needsClear = true; // drop stale history from a previous ghost phase
    this.enabled = on;
    const frames = dtSec * 60;
    const u = this.feedback.uniforms;
    (u.uDecay.value as Vector3).set(DECAY_60.x ** frames, DECAY_60.y ** frames, DECAY_60.z ** frames);
    u.uFloor.value = 0.004 * frames;
    u.uAmount.value = Math.min(1, amount);
  }

  override setSize(width: number, height: number): void {
    for (const t of this.history) t.setSize(width, height);
    this.needsClear = true;
  }

  override render(renderer: WebGLRenderer, writeBuffer: WebGLRenderTarget, readBuffer: WebGLRenderTarget): void {
    const [prev, next] = this.history;
    if (this.needsClear) {
      renderer.setRenderTarget(prev);
      renderer.clear(true, false, false);
      this.needsClear = false;
    }
    this.feedback.uniforms.tCurrent.value = readBuffer.texture;
    this.feedback.uniforms.tHistory.value = prev.texture;
    this.quad.material = this.feedback;
    renderer.setRenderTarget(next);
    this.quad.render(renderer);

    this.copy.uniforms.tDiffuse.value = next.texture;
    this.quad.material = this.copy;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);

    this.history = [next, prev];
  }

  override dispose(): void {
    for (const t of this.history) t.dispose();
    this.feedback.dispose();
    this.copy.dispose();
    this.quad.dispose();
  }
}
