import type { EffectId, ItemId } from '../sim/types';

export const ITEM_DESCRIPTIONS: Record<ItemId, string> = {
  apple: 'Grow by 1, +10 points',
  goldapple: 'Grow by 3, +50 points, golden flash',
  speed: 'Faster, double points',
  slowmo: 'Slower, more time to react',
  rain: 'Rain blurs your vision',
  mushroom: 'Waves and color shift',
  tumble: 'The board tilts and spins',
  mirror: 'Controls mirrored',
  ghost: 'Snake turns semi-transparent',
  glitch: 'Screen glitch, skull chaos',
  shrink: 'Shrink by 3 segments',
};

/** Centered toast text on effectStart (missing = no toast). */
export const EFFECT_TOASTS: Partial<Record<EffectId, string>> = {
  speed: 'BLITZ!',
  slow: 'SLOW-MO!',
  rain: 'RAIN!',
  trip: 'TRIP!',
  tumble: 'TUMBLE!',
  mirror: 'MIRROR!',
  ghost: 'GHOST!',
  glitch: 'GLITCH!',
  fisheye: 'SNIP!',
};
