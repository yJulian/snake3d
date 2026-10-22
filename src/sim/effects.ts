import type { ActiveEffect, Dir, EffectId, GameEvent, Player } from './types';

export const EFFECT_IDS: readonly EffectId[] = [
  'speed', 'slow', 'rain', 'trip', 'tumble', 'mirror', 'ghost', 'glitch', 'fisheye', 'goldflash',
];

/** Visual fade timing per effect (ticks). Used only by effectIntensities(). */
export const EFFECT_FADE: Record<EffectId, { fadeIn: number; fadeOut: number }> = {
  speed: { fadeIn: 20, fadeOut: 45 },
  slow: { fadeIn: 20, fadeOut: 45 },
  rain: { fadeIn: 45, fadeOut: 60 },
  trip: { fadeIn: 45, fadeOut: 60 },
  tumble: { fadeIn: 40, fadeOut: 60 },
  mirror: { fadeIn: 10, fadeOut: 20 },
  ghost: { fadeIn: 15, fadeOut: 45 },
  glitch: { fadeIn: 15, fadeOut: 30 },
  fisheye: { fadeIn: 12, fadeOut: 70 },
  goldflash: { fadeIn: 3, fadeOut: 40 },
};

/** Ticks per cell for a speed-modified snake. Speed + slow cancel out. */
export const SPEED_INTERVAL_FACTOR = { speed: [5, 8], slow: [13, 8] } as const;

export function hasEffect(p: Player, id: EffectId): boolean {
  return p.activeEffects.some((e) => e.id === id);
}

export function moveIntervalFor(p: Player, base: number): number {
  const fast = hasEffect(p, 'speed');
  const slow = hasEffect(p, 'slow');
  if (fast === slow) return base;
  const [num, den] = fast ? SPEED_INTERVAL_FACTOR.speed : SPEED_INTERVAL_FACTOR.slow;
  return Math.max(1, Math.round((base * num) / den));
}

export function scoreMultiplier(p: Player): number {
  return hasEffect(p, 'speed') ? 2 : 1;
}

const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };

export function opposite(d: Dir): Dir {
  return OPPOSITE[d];
}

/** Mirror effect: every input is turned into its opposite direction. */
export function applyInputEffects(p: Player, d: Dir): Dir {
  return hasEffect(p, 'mirror') ? OPPOSITE[d] : d;
}

/** Starts an effect or resets its timer if already active. Mutates the player. */
export function startEffect(p: Player, id: EffectId, ticks: number, events: GameEvent[]): void {
  if (ticks <= 0) return;
  const existing = p.activeEffects.find((e) => e.id === id);
  if (existing) {
    existing.remainingTicks = ticks;
    existing.totalTicks = ticks;
  } else {
    p.activeEffects.push({ id, remainingTicks: ticks, totalTicks: ticks, elapsedTicks: 0 });
  }
  events.push({ type: 'effectStart', playerId: p.id, effectId: id, refreshed: !!existing });
}

/** Advances all effect timers by one tick and removes expired ones. Mutates the player. */
export function tickEffects(p: Player, events: GameEvent[]): void {
  const kept: ActiveEffect[] = [];
  for (const e of p.activeEffects) {
    e.remainingTicks--;
    e.elapsedTicks++;
    if (e.remainingTicks > 0) kept.push(e);
    else events.push({ type: 'effectEnd', playerId: p.id, effectId: e.id });
  }
  p.activeEffects = kept;
}

export type EffectIntensities = Record<EffectId, number>;

export function zeroIntensities(): EffectIntensities {
  const out = {} as EffectIntensities;
  for (const id of EFFECT_IDS) out[id] = 0;
  return out;
}

/**
 * Visual intensity 0..1 per effect with fade-in (over elapsed ticks) and fade-out
 * (over the last remaining ticks). `alpha` (0..1) is the render interpolation factor
 * between ticks for smooth values. Shared by renderer and post-processing.
 */
export function effectIntensities(effects: readonly ActiveEffect[], alpha = 0): EffectIntensities {
  const out = zeroIntensities();
  for (const e of effects) {
    const f = EFFECT_FADE[e.id];
    const fin = Math.min(1, (e.elapsedTicks + alpha) / f.fadeIn);
    const fout = Math.min(1, Math.max(0, (e.remainingTicks - alpha) / f.fadeOut));
    out[e.id] = Math.max(0, Math.min(fin, fout));
  }
  return out;
}
