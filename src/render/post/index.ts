import { Vector2, Vector3, type Camera, type Scene, type WebGLRenderer } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type { EffectIntensities, PostProcessor } from '../../contracts';
import { PhosphorPass } from './phosphorPass';
import { createUberMaterial, type UberUniformName } from './uberShader';

/**
 * Pass chain:
 *   RenderPass → PhosphorPass (ghost only) → UnrealBloomPass (always, gold-boosted)
 *   → Uber ShaderPass (screen effects + always-on grade) → OutputPass (sRGB).
 * Bloom runs before the uber pass so distortions also bend the glow. The uber pass always
 * runs: its final grade compresses highlights hue-preservingly (no burn-out to white) and
 * pulls faint bloom haze down to true black.
 */

/** Always-on glow so colored snakes/items shine on black. Tight: no screen-wide haze. */
const BLOOM = { strength: 0.35, radius: 0, threshold: 0.45 } as const;
/**
 * Per-mip weights (small → wide). three's defaults (1, .8, .6, .4, .2) plus radius spread the
 * glow over the whole screen and lift black; this keeps a tight halo with a soft short tail.
 */
const BLOOM_FACTORS = [1.0, 0.5, 0.2, 0.06, 0.02];
/** Gold tint for the bloom mips during goldflash (linear RGB). */
const GOLD = new Vector3(1.0, 0.62, 0.16);
const WHITE = new Vector3(1, 1, 1);
const MAX_PIXEL_RATIO = 2;
/** Keeps shader time small enough for float precision (wrap ~ every 40 min). */
const TIME_WRAP_SEC = 2400;

const UNIFORM_FOR: ReadonlyArray<[keyof EffectIntensities, UberUniformName]> = [
  ['speed', 'uSpeed'],
  ['slow', 'uSlow'],
  ['rain', 'uRain'],
  ['trip', 'uTrip'],
  ['mirror', 'uMirror'],
  ['ghost', 'uGhost'],
  ['glitch', 'uGlitch'],
  ['fisheye', 'uFisheye'],
  ['goldflash', 'uGold'],
];

export function createPostProcessor(webgl: WebGLRenderer, scene: Scene, camera: Camera): PostProcessor {
  const composer = new EffectComposer(webgl);
  const renderPass = new RenderPass(scene, camera);
  const phosphor = new PhosphorPass();
  const bloom = new UnrealBloomPass(new Vector2(256, 256), BLOOM.strength, BLOOM.radius, BLOOM.threshold);
  const uberMaterial = createUberMaterial();
  const uber = new ShaderPass(uberMaterial);
  const output = new OutputPass();
  const u = uberMaterial.uniforms;
  bloom.compositeMaterial.uniforms.bloomFactors.value = BLOOM_FACTORS;

  composer.addPass(renderPass);
  composer.addPass(phosphor);
  composer.addPass(bloom);
  composer.addPass(uber);
  composer.addPass(output);

  let lastDt = 0;

  return {
    update(fx: EffectIntensities, timeSec: number, dtSec: number): void {
      lastDt = dtSec;
      u.uTime.value = timeSec % TIME_WRAP_SEC;

      for (const [id, name] of UNIFORM_FOR) u[name].value = Math.min(1, Math.max(0, fx[id]));

      phosphor.setParams(fx.ghost, dtSec);

      // goldflash: strong, wide, golden bloom burst
      const g = Math.min(1, Math.max(0, fx.goldflash));
      bloom.strength = BLOOM.strength + 0.9 * g;
      bloom.radius = BLOOM.radius + 0.1 * g;
      bloom.threshold = BLOOM.threshold * (1 - 0.5 * g);
      for (const tint of bloom.bloomTintColors) tint.copy(WHITE).lerp(GOLD, g);
    },

    render(): void {
      composer.render(lastDt);
    },

    resize(width: number, height: number): void {
      const pr = Math.min(MAX_PIXEL_RATIO, webgl.getPixelRatio());
      composer.setPixelRatio(pr);
      composer.setSize(width, height); // also resizes bloom + phosphor (in device pixels)
      (u.uResolution.value as Vector2).set(Math.max(1, width * pr), Math.max(1, height * pr));
      u.uPixelRatio.value = pr;
    },

    dispose(): void {
      for (const pass of [renderPass, phosphor, bloom, uber, output]) pass.dispose();
      uberMaterial.dispose();
      composer.dispose();
    },
  };
}
