import type { EffectId, ItemId } from './types';

/** Simulation ticks per second (see TICK_HZ in step.ts). Durations below are in ticks. */
const S = 60;

export interface ItemDef {
  id: ItemId;
  name: string;
  /** Hex color for renderer/HUD. */
  color: string;
  /** Relative spawn weight among specials (0 = never spawned randomly). */
  weight: number;
  effect: EffectId | null;
  /** Effect duration in ticks (0 if no effect). */
  durationTicks: number;
  polarity: 'positive' | 'negative';
  /** Segments gained (negative = shrink). */
  growth: number;
  points: number;
  /** Ticks the item stays on the board; null = until eaten. */
  lifetimeTicks: number | null;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  apple:     { id: 'apple',     name: 'Apfel',     color: '#ff2a2a', weight: 0,  effect: null,        durationTicks: 0,      polarity: 'positive', growth: 1,  points: 10, lifetimeTicks: null },
  goldapple: { id: 'goldapple', name: 'Goldapfel', color: '#ffc61a', weight: 6,  effect: 'goldflash', durationTicks: S * 3 / 4, polarity: 'positive', growth: 3, points: 50, lifetimeTicks: 6 * S },
  speed:     { id: 'speed',     name: 'Blitz',     color: '#fff200', weight: 10, effect: 'speed',     durationTicks: 8 * S,  polarity: 'positive', growth: 0,  points: 5,  lifetimeTicks: 8 * S },
  slowmo:    { id: 'slowmo',    name: 'Sanduhr',   color: '#22e6ff', weight: 10, effect: 'slow',      durationTicks: 8 * S,  polarity: 'positive', growth: 0,  points: 5,  lifetimeTicks: 8 * S },
  rain:      { id: 'rain',      name: 'Regen',     color: '#2a6bff', weight: 8,  effect: 'rain',      durationTicks: 10 * S, polarity: 'negative', growth: 0,  points: 20, lifetimeTicks: 8 * S },
  mushroom:  { id: 'mushroom',  name: 'Pilz',      color: '#ff4fd8', weight: 8,  effect: 'trip',      durationTicks: 10 * S, polarity: 'negative', growth: 0,  points: 20, lifetimeTicks: 8 * S },
  tumble:    { id: 'tumble',    name: 'Würfel',    color: '#9b4dff', weight: 6,  effect: 'tumble',    durationTicks: 8 * S,  polarity: 'negative', growth: 0,  points: 20, lifetimeTicks: 8 * S },
  mirror:    { id: 'mirror',    name: 'Spiegel',   color: '#ffffff', weight: 6,  effect: 'mirror',    durationTicks: 8 * S,  polarity: 'negative', growth: 0,  points: 20, lifetimeTicks: 8 * S },
  ghost:     { id: 'ghost',     name: 'Geist',     color: '#5dff8a', weight: 6,  effect: 'ghost',     durationTicks: 8 * S,  polarity: 'positive', growth: 0,  points: 5,  lifetimeTicks: 8 * S },
  glitch:    { id: 'glitch',    name: 'Totenkopf', color: '#ff7a1a', weight: 6,  effect: 'glitch',    durationTicks: 8 * S,  polarity: 'negative', growth: 0,  points: 20, lifetimeTicks: 8 * S },
  shrink:    { id: 'shrink',    name: 'Schere',    color: '#b44dff', weight: 6,  effect: 'fisheye',   durationTicks: S * 3 / 2, polarity: 'positive', growth: -3, points: 0, lifetimeTicks: 8 * S },
};

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

/** Items that spawn randomly as specials (weight > 0), in table order. */
export const SPECIAL_ITEM_IDS = ITEM_IDS.filter((id) => ITEMS[id].weight > 0);

/** Item that grants a given effect (first match), for HUD labels/colors. */
export function itemForEffect(effect: EffectId): ItemDef | undefined {
  return ITEM_IDS.map((id) => ITEMS[id]).find((d) => d.effect === effect);
}
