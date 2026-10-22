import { describe, expect, it } from 'vitest';
import { opposite } from '../../src/sim/effects';
import { createInitialState, freeCells } from '../../src/sim/state';
import { step } from '../../src/sim/step';
import type { Dir, GameConfig, Vec2 } from '../../src/sim/types';
import { advance, allCells, isCell, PLANAR_DIRS, WORLD_SIZES, type WorldId } from '../../src/sim/world';
import { head, runMoves, setSnake } from './helpers';

function cfgFor(world: WorldId): GameConfig {
  return createInitialState({ seed: 1, world }, [{ id: 'p1', skinId: 'classic' }]).config;
}

function worldState(world: WorldId) {
  const s = createInitialState({ seed: 3, world }, [{ id: 'p1', skinId: 'classic' }]);
  s.items = [];
  s.specialSpawnCooldown = 1e9;
  return s;
}

describe('torus', () => {
  it('wraps right -> left and top -> bottom', () => {
    const cfg = cfgFor('torus');
    expect(advance(cfg, { x: cfg.width - 1, y: 3 }, 'right')!.cell).toEqual({ x: 0, y: 3 });
    expect(advance(cfg, { x: 5, y: 0 }, 'up')!.cell).toEqual({ x: 5, y: cfg.height - 1 });
  });

  it('snake survives crossing the edge', () => {
    const s = worldState('torus');
    const w = s.config.width;
    setSnake(s, [{ x: w - 1, y: 4 }, { x: w - 2, y: 4 }, { x: w - 3, y: 4 }], 'right');
    const r = runMoves(s, 2);
    expect(r.players[0].alive).toBe(true);
    expect(head(r)).toEqual({ x: 1, y: 4 });
  });
});

describe('sphere (cube net)', () => {
  const cfg = cfgFor('sphere');
  const cells = allCells(cfg);

  it('has 6 faces of N x N cells', () => {
    const N = cfg.height / 3;
    expect(cells).toHaveLength(6 * N * N);
    expect(isCell(cfg, { x: 0, y: 0 })).toBe(false);
  });

  it('every step lands on a cell and can be undone', () => {
    for (const c of cells) {
      for (const d of PLANAR_DIRS) {
        const a = advance(cfg, c, d)!;
        expect(isCell(cfg, a.cell)).toBe(true);
        const back = advance(cfg, a.cell, opposite(a.dir))!;
        expect(back.cell).toEqual(c);
        expect(back.dir).toBe(opposite(d));
      }
    }
  });

  it('walking straight 4N steps returns to the start with the same heading', () => {
    const N = cfg.height / 3;
    for (const c of cells) {
      for (const d of PLANAR_DIRS) {
        let cur: Vec2 = c;
        let dir: Dir = d;
        for (let k = 0; k < 4 * N; k++) {
          const a = advance(cfg, cur, dir)!;
          cur = a.cell;
          dir = a.dir;
        }
        expect(cur).toEqual(c);
        expect(dir).toBe(d);
      }
    }
  });

  it('queued turns are remapped when crossing a cube edge', () => {
    const N = cfg.height / 3;
    // Top face (T), heading up over its top edge onto the back face (B), arriving heading down.
    const a = advance(cfg, { x: N + 2, y: 0 }, 'up')!;
    expect(a.dir).toBe('down');
    expect(a.remap('up')).toBe('down');
    expect(a.remap('left')).toBe(opposite(a.remap('right')));
  });

  it('snake starts on the net and has no walls', () => {
    let s = worldState('sphere');
    expect(s.players[0].snake.segments.every((c) => isCell(s.config, c))).toBe(true);
    s = runMoves(s, 200);
    expect(s.players[0].alive).toBe(true);
    s = runMoves(s, 200, 'up');
    expect(s.players[0].alive).toBe(true);
  });

  it('items only spawn on net cells', () => {
    const s = worldState('sphere');
    expect(freeCells(s).every((c) => isCell(s.config, c))).toBe(true);
  });
});

describe('volume', () => {
  it('ascend / descend move along z and hit the walls', () => {
    const s = worldState('volume');
    const h0 = head(s);
    expect(h0.z).toBe(Math.floor(WORLD_SIZES.volume.depth / 2));
    let r = runMoves(s, 1, 'ascend');
    expect(head(r)).toEqual({ x: h0.x, y: h0.y, z: h0.z! + 1 });
    r = runMoves(r, s.config.depth);
    expect(r.players[0].alive).toBe(false);
    expect(r.events).toContainEqual({ type: 'death', playerId: 'p1', cause: 'wall' });
  });

  it('collisions compare z', () => {
    const s = worldState('volume');
    setSnake(s, [{ x: 5, y: 5, z: 2 }, { x: 5, y: 5, z: 1 }, { x: 4, y: 5, z: 1 }, { x: 4, y: 5, z: 2 }], 'ascend');
    expect(runMoves(s, 1, 'left').players[0].alive).toBe(true); // (4,5,2) is the tail, which moves away
  });

  it('flat worlds ignore ascend', () => {
    const s = worldState('flat');
    const r = step(s, [{ playerId: 'p1', tick: 0, dir: 'ascend' }]);
    expect(r.players[0].snake.pendingDirs).toEqual([]);
  });
});
