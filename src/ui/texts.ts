import type { EffectId, ItemId } from '../sim/types';

export const ITEM_DESCRIPTIONS: Record<ItemId, string> = {
  apple: 'Wächst um 1, +10 Punkte',
  goldapple: 'Wächst um 3, +50 Punkte, goldener Blitz',
  speed: 'Schneller, doppelte Punkte',
  slowmo: 'Langsamer, mehr Zeit zum Reagieren',
  rain: 'Regen trübt die Sicht',
  mushroom: 'Wellen und Farbverschiebung',
  tumble: 'Das Spielfeld kippt und dreht sich',
  mirror: 'Steuerung seitenverkehrt',
  ghost: 'Schlange halb durchsichtig',
  glitch: 'Bildstörung, Totenkopf-Chaos',
  shrink: 'Verkürzt um 3 Segmente',
};

/** Centered toast text on effectStart (missing = no toast). */
export const EFFECT_TOASTS: Partial<Record<EffectId, string>> = {
  speed: 'BLITZ!',
  slow: 'SLOW-MO!',
  rain: 'REGEN!',
  trip: 'TRIP!',
  tumble: 'TUMBLE!',
  mirror: 'SPIEGEL!',
  ghost: 'GEIST!',
  glitch: 'GLITCH!',
  fisheye: 'SCHNITT!',
};
