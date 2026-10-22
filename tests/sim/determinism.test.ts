import { describe, expect, it } from 'vitest';
import { hashState } from '../../src/sim/hash';
import { createInitialState } from '../../src/sim/state';
import { step } from '../../src/sim/step';
import type { Dir, GameState, InputCommand } from '../../src/sim/types';

const DIRS: Dir[] = ['up', 'right', 'down', 'left'];

/** Scripted pseudo-random inputs (independent of the sim RNG). */
function inputsFor(tick: number): InputCommand[] {
  return tick % 37 === 0 ? [{ playerId: 'p1', tick, dir: DIRS[(tick * 7) % 4] }] : [];
}

function run(seed: number, ticks: number, roundtripAt = -1): { state: GameState; hashes: string[] } {
  let s = createInitialState({ seed, width: 40, height: 40 }, [{ id: 'p1', skinId: 'classic' }]);
  const hashes: string[] = [];
  for (let t = 0; t < ticks; t++) {
    if (t === roundtripAt) s = JSON.parse(JSON.stringify(s));
    s = step(s, inputsFor(s.tick));
    hashes.push(hashState(s));
  }
  return { state: s, hashes };
}

describe('determinism', () => {
  it('same seed + inputs over 2000 ticks yields identical hashes', () => {
    const a = run(1234, 2000);
    const b = run(1234, 2000);
    expect(a.hashes).toEqual(b.hashes);
    expect(a.state.tick).toBe(2000);
  });

  it('different seeds diverge', () => {
    expect(run(1, 200).hashes.at(-1)).not.toBe(run(2, 200).hashes.at(-1));
  });

  it('JSON roundtrip mid-game changes nothing', () => {
    expect(run(99, 2000, 1000).hashes).toEqual(run(99, 2000).hashes);
  });

  it('step does not mutate its input', () => {
    const s = createInitialState({ seed: 5 }, [{ id: 'p1', skinId: 'classic' }]);
    const before = hashState(s);
    step(s, [{ playerId: 'p1', tick: 0, dir: 'up' }]);
    expect(hashState(s)).toBe(before);
  });

  it('multiplayer: input order in the array does not matter', () => {
    const players = [{ id: 'a', skinId: 'classic' }, { id: 'b', skinId: 'neon' }];
    let x = createInitialState({ seed: 7 }, players);
    let y = createInitialState({ seed: 7 }, players);
    for (let t = 0; t < 300; t++) {
      const cmds: InputCommand[] = t % 20 === 0
        ? [{ playerId: 'a', tick: t, dir: DIRS[t % 4] }, { playerId: 'b', tick: t, dir: DIRS[(t + 1) % 4] }]
        : [];
      x = step(x, cmds);
      y = step(y, [...cmds].reverse());
    }
    expect(hashState(x)).toBe(hashState(y));
  });
});
