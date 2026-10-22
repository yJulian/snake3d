import { describe, expect, it } from 'vitest';
import { EFFECT_IDS, effectIntensities } from '../../src/sim/effects';
import { ITEMS, ITEM_IDS, itemForEffect } from '../../src/sim/items';

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

describe('item table', () => {
  it('every item has a spawn weight >= 0; only apple has weight 0 (never spawned randomly)', () => {
    for (const id of ITEM_IDS) expect(ITEMS[id].weight).toBeGreaterThanOrEqual(0);
    const zero = ITEM_IDS.filter((id) => ITEMS[id].weight === 0);
    expect(zero).toEqual(['apple']);
  });

  it('every special item (weight > 0) has a weight > 0', () => {
    for (const id of ITEM_IDS.filter((i) => i !== 'apple')) expect(ITEMS[id].weight).toBeGreaterThan(0);
  });

  it('every item has a valid #rrggbb color', () => {
    for (const id of ITEM_IDS) expect(ITEMS[id].color).toMatch(HEX_COLOR);
  });

  it('every item with an effect has durationTicks > 0', () => {
    for (const id of ITEM_IDS) {
      const def = ITEMS[id];
      if (def.effect) expect(def.durationTicks, id).toBeGreaterThan(0);
    }
  });
});

describe('effects and items', () => {
  it('every EffectId has an item (no effect is without an item)', () => {
    expect(EFFECT_IDS.filter((e) => !itemForEffect(e))).toEqual([]);
  });

  it('the item found for each effect grants exactly that effect', () => {
    for (const e of EFFECT_IDS) expect(itemForEffect(e)?.effect).toBe(e);
  });
});

describe('effectIntensities', () => {
  it('returns zero for every effect when the list is empty', () => {
    const fx = effectIntensities([]);
    for (const e of EFFECT_IDS) expect(fx[e], e).toBe(0);
    expect(Object.keys(fx).sort()).toEqual([...EFFECT_IDS].sort());
  });

  it('returns zero for every effect with a non-zero alpha and empty list', () => {
    const fx = effectIntensities([], 0.5);
    expect(Object.values(fx).every((v) => v === 0)).toBe(true);
  });
});
