// mulberry32 – the generator state is a uint32 stored in GameState.rng.

export function nextU32(s: { rng: number }): number {
  let t = (s.rng = (s.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

/** Integer in [0, n). */
export function randInt(s: { rng: number }, n: number): number {
  return nextU32(s) % n;
}

/** Integer in [min, max]. */
export function randRange(s: { rng: number }, min: number, max: number): number {
  return min + randInt(s, max - min + 1);
}

/** Picks an index proportionally to integer weights. */
export function weightedIndex(s: { rng: number }, weights: readonly number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = randInt(s, total);
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return i;
  }
  return weights.length - 1;
}

export function seedToRng(seed: number): number {
  return seed >>> 0;
}
