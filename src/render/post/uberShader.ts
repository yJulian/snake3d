import { ShaderMaterial, Vector2 } from 'three';

/**
 * One combined screen-space pass for all post effects. Every effect is scaled by its
 * intensity uniform (0..1) and skipped via uniform branches when 0, so effects stack
 * and an idle effect costs (almost) nothing.
 *
 * Rules kept throughout: out-of-frame UVs sample black, color changes are multiplicative
 * or luminance-proportional so black stays #000 – no effect adds light of its own.
 * Works in linear space (before OutputPass). The final grade always runs: hue-preserving
 * highlight roll-off (saturated colors glow instead of clipping to white) + black floor.
 */

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const fragmentShader = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uResolution;   // drawing-buffer pixels
uniform float uPixelRatio;
uniform float uTime;
uniform float uSpeed;
uniform float uSlow;
uniform float uRain;
uniform float uTrip;
uniform float uMirror;
uniform float uGhost;
uniform float uGlitch;
uniform float uFisheye;
uniform float uGold;
varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318531
#define KNEE 0.7          // linear peak value where highlight compression starts
#define BLACK_FLOOR 0.012 // linear peak value below which light fades to #000 (grid ~0.023)

// ---- hashes (Dave Hoskins, "hash without sine") ----------------------------
float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 hash32(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yzz) * p3.zyx); }

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

// Outside the frame is black – no edge smearing from clamp-to-edge.
vec3 tap(vec2 uv) {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec3(0.0);
  return texture2D(tDiffuse, uv).rgb;
}

// Chromatic split: red pushed along +off, blue along -off.
vec3 tapSplit(vec2 uv, vec2 off) {
  return vec3(tap(uv + off).r, tap(uv).g, tap(uv - off).b);
}

// Rotation around the grey axis (Rodrigues) – shifts hue, keeps black black.
vec3 hueRotate(vec3 c, float a) {
  const vec3 k = vec3(0.57735027);
  float ca = cos(a);
  return max(c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca), 0.0);
}

// ---- rain on the lens --------------------------------------------------------
// q = aspect-corrected screen coords (x in 0..aspect, y up 0..1).
// Each layer returns vec3(lens offset in q units, coverage mask). The offset points
// from the drop center to the pixel; subtracting it samples the opposite side,
// which gives the inverted, magnified look of a real droplet.

// Small static drops: one per grid cell, pop in fast, evaporate slowly.
vec3 rainStatic(vec2 q, float t, float cells) {
  vec2 g = q * cells;
  vec2 id = floor(g);
  vec2 st = fract(g) - 0.5;
  vec3 n = hash32(id + 17.0);
  if (fract(n.x * 13.7) < 0.4) return vec3(0.0);       // empty cell
  vec2 c = (n.xy - 0.5) * 0.55;
  float life = fract(t * 0.07 + n.z);
  float grow = smoothstep(0.0, 0.03, life) * (1.0 - smoothstep(0.3, 1.0, life));
  float r = mix(0.1, 0.3, fract(n.z * 7.31)) * grow;
  if (r < 0.01) return vec3(0.0);
  vec2 v = (st - c) / r;
  float d2 = dot(v, v);
  float m = 1.0 - smoothstep(0.6, 1.0, d2);
  return vec3(v * (r / cells) * m, m);
}

// Horizontal path a sliding drop follows inside its column (y = cell-local height).
float dropPath(float y, vec3 n) {
  return 0.5 + (n.x - 0.5) * 0.3 + sin(y * 9.0 + n.z * TAU) * 0.06 + sin(y * 23.0 + n.y * TAU) * 0.025;
}

// Big drops sliding down with stick-slip motion, leaving a wet trail of tiny droplets.
// 'wiped' reports the trail area (glass cleared by the drop → sharper there).
vec3 rainSliding(vec2 q, float t, vec2 cell, out float wiped) {
  wiped = 0.0;
  vec2 g = q / cell;
  g.y += hash11(floor(g.x) * 7.31 + 1.7) * 5.0;          // stagger columns vertically
  vec2 id = floor(g);
  vec2 st = fract(g);
  vec3 n = hash32(id * vec2(1.0, 3.17) + 3.1);
  if (n.x < 0.2) return vec3(0.0);                      // empty cell

  float period = mix(5.0, 11.0, n.y);
  float ti = fract(t / period + n.z);
  float k = 2.0 + floor(n.y * 3.0);
  float s = ti - sin(ti * TAU * k) / (TAU * k);         // monotonic with stalls (stick-slip)
  float y = mix(0.95, 0.05, s);
  float life = smoothstep(0.0, 0.04, ti) * (1.0 - smoothstep(0.88, 1.0, ti));
  float r = mix(0.013, 0.022, n.y) * life;              // drop radius in q units

  // main drop: bottom-heavy, slightly tall ellipse
  vec2 dp = (st - vec2(dropPath(y, n), y)) * cell;
  dp.y *= dp.y > 0.0 ? 0.75 : 0.95;
  vec2 v = dp / max(r, 1e-4);
  float m = (1.0 - smoothstep(0.6, 1.0, dot(v, v))) * step(1e-4, r);
  vec2 off = v * r * m;

  // trail above the drop, fading with age (distance already travelled)
  float above = st.y - y;
  float side = abs(st.x - dropPath(st.y, n)) * cell.x;
  float trail = step(0.0, above) * step(st.y, 0.95) * (1.0 - smoothstep(0.0, 0.6, above))
              * (1.0 - smoothstep(r * 0.5, r * 1.1, side)) * life;
  wiped = trail;

  // tiny droplets left behind in the trail
  float sp = 0.028;
  float ly = st.y * cell.y / sp;
  float h = hash12(vec2(floor(ly), id.x * 13.0 + id.y));
  float lr = r * mix(0.25, 0.5, h) * step(0.35, h) * step(0.0, above - sp) * (1.0 - smoothstep(0.0, 0.6, above)) ;
  vec2 lv = vec2((st.x - dropPath(st.y, n)) * cell.x - (h - 0.5) * r * 0.6, (fract(ly) - 0.5) * sp) / max(lr, 1e-4);
  float lm = (1.0 - smoothstep(0.5, 1.0, dot(lv, lv))) * step(1e-4, lr);
  off += lv * lr * lm;
  return vec3(off, max(m, lm));
}

void main() {
  float aspect = uResolution.x / uResolution.y;
  vec2 asp = vec2(aspect, 1.0);
  float t = uTime;
  vec2 uv = vUv;
  vec2 caOff = vec2(0.0);
  float mask = 0.0;      // rain drop coverage
  float rainBlur = 0.0;  // blur radius factor outside drops

  // Combined glitch strength: glitch effect, mirror transition (peak at 0.5), mirror bursts.
  float mirrorTrans = smoothstep(0.0, 1.0, 1.0 - abs(uMirror * 2.0 - 1.0)) * step(0.001, uMirror);
  float mirrorBurst = uMirror * step(0.92, hash11(floor(t * 6.0) + 3.0));
  float gAll = clamp(max(uGlitch, max(mirrorTrans, mirrorBurst * 0.45)), 0.0, 1.0);

  // ---- glitch: whole-frame jitter + CRT curvature (outermost, the "monitor") ----
  if (uGlitch > 0.001) {
    float tq = floor(t * 10.0);
    float shake = step(0.82, hash11(tq * 1.37));
    uv += (hash32(vec2(tq, 7.0)).xy - 0.5) * vec2(0.03, 0.015) * uGlitch * shake;
    vec2 c = uv * 2.0 - 1.0;
    c += c * (c.yx * c.yx) * 0.16 * uGlitch;          // barrel → rounded black corners
    uv = c * 0.5 + 0.5;
  }

  // ---- rain: drops on the lens, refracting what lies behind ----
  if (uRain > 0.001) {
    vec2 q = uv * asp;
    float w1, w2;
    vec3 a = rainStatic(q, t, 26.0);
    vec3 b = rainSliding(q, t, vec2(0.12, 0.9), w1);
    vec3 c = rainSliding(q * 1.5 + vec2(3.7, 1.3), t * 1.1 + 11.0, vec2(0.12, 0.9), w2);
    float wiped = max(w1, w2);
    a *= 1.0 - wiped;                                  // sliding drops collect static ones
    vec2 off = a.xy + b.xy + c.xy / 1.5;
    mask = max(a.z, max(b.z, c.z)) * uRain;
    uv -= off / asp * 1.8 * uRain;
    rainBlur = uRain * (1.0 - mask) * (1.0 - 0.85 * wiped);
  }

  // ---- fisheye: pulsing barrel (center magnified, corners fixed) ----
  if (uFisheye > 0.001) {
    vec2 p = (uv - 0.5) * asp;
    float r = length(p) / length(asp * 0.5);           // 0 center .. 1 corner
    float k = uFisheye * (0.32 + 0.14 * sin(t * 3.6));
    p *= 1.0 - k * (1.0 - r * r);
    uv = p / asp + 0.5;
  }

  // ---- mirror: horizontal flip once past half intensity ----
  if (uMirror > 0.5) uv.x = 1.0 - uv.x;

  // ---- glitch: block displacement + tear lines + RGB split (time-quantised) ----
  if (gAll > 0.001) {
    float tq = floor(t * 14.0);
    vec2 bs = mix(vec2(5.0, 9.0), vec2(14.0, 36.0), hash11(tq * 3.1));
    vec2 bid = floor(uv * bs);
    if (hash12(bid + tq * 1.7) < gAll * 0.16) uv.x += (hash12(bid * 2.3 + tq) - 0.5) * 0.25 * gAll;
    float lh = hash12(vec2(floor(uv.y * 90.0), tq));
    float lp = gAll * 0.07;
    if (lh < lp) uv.x += (lh / lp - 0.5) * 0.14 * gAll;
    caOff += vec2((hash11(tq + 0.5) - 0.5) * 0.024 + 0.004, (hash11(tq + 9.1) - 0.5) * 0.005) * gAll;
  }

  // ---- trip: sine warp ----
  if (uTrip > 0.001) {
    uv.x += sin(uv.y * 11.0 + t * 1.3) * 0.012 * uTrip + sin(uv.y * 23.0 - t * 2.1) * 0.004 * uTrip;
    uv.y += sin(uv.x * 9.0 + t * 1.1) * 0.012 * uTrip;
  }

  // ---- slow: concentric ripple waves from the center ----
  if (uSlow > 0.001) {
    vec2 p = (uv - 0.5) * asp;
    float r = length(p);
    uv += (p / max(r, 1e-4)) / asp * sin(r * 42.0 - t * 2.2) * 0.0035 * uSlow * smoothstep(0.0, 0.15, r);
  }

  // ---- speed: chromatic aberration growing towards the edges ----
  vec2 fromC = uv - 0.5;
  float edge = 0.0;      // 0 in the middle .. 1 at the frame edge (speed only)
  if (uSpeed > 0.001) {
    edge = smoothstep(0.25, 0.95, length(fromC * asp) / length(asp * 0.5));
    caOff += fromC * 0.035 * uSpeed * edge;
  }

  // ---- sampling: radial zoom blur (speed) or a single (split) tap ----
  vec3 col;
  bool split = dot(caOff, caOff) > 1e-9;
  if (uSpeed > 0.001) {
    // Streaks = content smeared along flickering radial lanes (no added light, so they take
    // the color of what passes by and black stays black). Center stays sharp for steering.
    float lanes = 96.0;
    float a = (atan(fromC.y * aspect, fromC.x) / TAU + 0.5) * lanes;
    float lane = step(0.55, hash12(vec2(floor(a), floor(t * 7.0))))
               * (1.0 - smoothstep(0.15, 0.5, abs(fract(a) - 0.5)));
    float amt = uSpeed * edge * (0.02 + 0.09 * lane);
    float jit = hash12(gl_FragCoord.xy) * 0.5;         // de-band the streaks
    vec3 acc = vec3(0.0);
    float wsum = 0.0;
    for (int i = 0; i < 10; i++) {
      float f = (float(i) + jit) / 10.0;
      float w = 1.0 - f * 0.7;
      acc += tapSplit(0.5 + fromC * (1.0 - amt * f), caOff) * w;
      wsum += w;
    }
    col = acc / wsum;
  } else {
    col = split ? tapSplit(uv, caOff) : tap(uv);
  }

  // ---- rain: soft-focus glass outside the drops (golden-angle disc) ----
  // Only bright content (snake, items, glow) goes soft; dim grid lines stay crisp so the
  // board never turns into a grey film.
  if (rainBlur > 0.01) {
    vec2 px = rainBlur * 4.0 * uPixelRatio / uResolution;
    vec3 acc = col;
    for (int i = 0; i < 10; i++) {
      float fi = float(i) + 0.5;
      float ang = fi * 2.39996;
      acc += tap(uv + vec2(cos(ang), sin(ang)) * sqrt(fi / 10.0) * px);
    }
    acc /= 11.0;
    float bright = smoothstep(0.03, 0.15, max(acc.r, max(acc.g, acc.b)));
    col = mix(col, acc, bright);
    col *= 1.0 - 0.18 * rainBlur;                      // misted glass is a bit dimmer
  }
  col *= 1.0 + 0.3 * mask;                             // drops focus light

  // ---- trip: pulsing kaleidoscope blend + hue cycling ----
  if (uTrip > 0.001) {
    float pulse = 0.5 + 0.5 * sin(t * 0.9);
    float kAmt = uTrip * pulse * pulse * 0.45;
    if (kAmt > 0.01) {
      vec2 p = (uv - 0.5) * asp;
      float r = length(p);
      float seg = TAU / 6.0;
      float ang = mod(atan(p.y, p.x) + t * 0.25, seg);
      ang = abs(ang - seg * 0.5);
      col = mix(col, tap(vec2(cos(ang), sin(ang)) * r / asp + 0.5), kAmt);
    }
    col = mix(col, hueRotate(col, t * 1.4), uTrip);
  }

  // ---- speed: tunnel vignette ----
  if (uSpeed > 0.001) col *= 1.0 - 0.4 * uSpeed * edge * edge;

  // ---- slow: drained, cold colors + vignette ----
  if (uSlow > 0.001) {
    float l = luma(col);
    col = mix(col, l * vec3(0.7, 0.88, 1.2), uSlow * 0.75);
    float r = length((vUv - 0.5) * asp) / length(asp * 0.5);
    col *= 1.0 - uSlow * 0.65 * smoothstep(0.25, 1.0, r);
  }

  // scanline pattern, ~3 CSS px period
  float scan = 0.5 + 0.5 * cos(gl_FragCoord.y * TAU / (3.0 * uPixelRatio));

  // ---- ghost: scanlines + rolling dim band (trail itself comes from PhosphorPass) ----
  if (uGhost > 0.001) {
    float band = smoothstep(0.0, 0.12, abs(fract(vUv.y * 0.6 - t * 0.12) - 0.5));
    col *= 1.0 - uGhost * (0.32 * scan + 0.12 * (1.0 - band));
  }

  // ---- glitch: scanlines, flicker, CRT vignette ----
  if (uGlitch > 0.001) {
    float flick = hash11(floor(t * 24.0));
    col *= 1.0 - uGlitch * (0.3 * scan + 0.08 * flick);
    vec2 c = vUv * 2.0 - 1.0;
    col *= 1.0 - uGlitch * 0.5 * smoothstep(0.6, 1.4, length(c * c));
  }

  // ---- goldflash: warm, luminance-proportional gold boost (bloom does the glow) ----
  if (uGold > 0.001) {
    col *= mix(vec3(1.0), vec3(1.2, 1.0, 0.7), uGold * 0.6);
    col += vec3(1.0, 0.72, 0.25) * luma(col) * uGold * 1.4;
  }

  // ---- grade: hue-preserving highlight roll-off + black floor ----
  col = max(col, 0.0);
  float peak = max(col.r, max(col.g, col.b));
  if (peak > KNEE) {
    float soft = KNEE + (1.0 - KNEE) * (1.0 - exp(-(peak - KNEE) / (1.0 - KNEE)));
    col *= soft / peak;                                // same hue & saturation, peak < 1
    col = mix(col, vec3(soft), clamp((peak - 1.2) * 0.06, 0.0, 0.18)); // faint hot core
  }
  col *= smoothstep(0.0, BLACK_FLOOR, peak);           // faint bloom haze → true black

  gl_FragColor = vec4(col, 1.0);
}`;

export type UberUniformName =
  | 'uSpeed' | 'uSlow' | 'uRain' | 'uTrip' | 'uMirror' | 'uGhost' | 'uGlitch' | 'uFisheye' | 'uGold';

export function createUberMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    name: 'Snake3DUberPost',
    uniforms: {
      tDiffuse: { value: null },
      uResolution: { value: new Vector2(1, 1) },
      uPixelRatio: { value: 1 },
      uTime: { value: 0 },
      uSpeed: { value: 0 },
      uSlow: { value: 0 },
      uRain: { value: 0 },
      uTrip: { value: 0 },
      uMirror: { value: 0 },
      uGhost: { value: 0 },
      uGlitch: { value: 0 },
      uFisheye: { value: 0 },
      uGold: { value: 0 },
    },
    vertexShader,
    fragmentShader,
    depthTest: false,
    depthWrite: false,
  });
}
