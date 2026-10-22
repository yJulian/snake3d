import { describe, expect, it } from 'vitest';
import { effectIntensities } from '../../src/sim/effects';
import { ITEMS, SPECIAL_ITEM_IDS } from '../../src/sim/items';
import { step, devApplyItem, devSpawnItemAt } from '../../src/sim/step';
import { head, makeState, runMoves, setSnake } from './helpers';

describe('collisions', () => {
  it('wall kills', () => {
    const s = makeState(1, { width: 10, height: 10 });
    setSnake(s, [{ x: 8, y: 5 }, { x: 7, y: 5 }, { x: 6, y: 5 }], 'right');
    let r = runMoves(s, 1);
    expect(r.players[0].alive).toBe(true);
    r = runMoves(r, 1);
    expect(r.players[0].alive).toBe(false);
    expect(r.status).toBe('over');
    expect(r.events).toContainEqual({ type: 'death', playerId: 'p1', cause: 'wall' });
    expect(head(r)).toEqual({ x: 9, y: 5 }); // dead snake stays on the board
  });

  const curled = [{ x: 5, y: 5 }, { x: 5, y: 6 }, { x: 6, y: 6 }, { x: 6, y: 5 }, { x: 6, y: 4 }];

  it('self collision kills', () => {
    const s = makeState();
    setSnake(s, curled.map((c) => ({ ...c })), 'up');
    const r = runMoves(s, 1, 'right'); // head -> (6,5), occupied by body
    expect(r.players[0].alive).toBe(false);
    expect(r.events).toContainEqual({ type: 'death', playerId: 'p1', cause: 'self' });
  });

  it('moving into the tail cell that moves away is allowed', () => {
    const s = makeState();
    setSnake(s, [{ x: 5, y: 5 }, { x: 5, y: 6 }, { x: 6, y: 6 }, { x: 6, y: 5 }], 'up');
    expect(runMoves(s, 1, 'right').players[0].alive).toBe(true);
  });

  it('ghost ignores self collision', () => {
    const s = makeState();
    setSnake(s, curled.map((c) => ({ ...c })), 'up');
    const g = devApplyItem(s, 'p1', 'ghost');
    const r = runMoves(g, 1, 'right');
    expect(r.players[0].alive).toBe(true);
    expect(head(r)).toEqual({ x: 6, y: 5 });
  });
});

describe('steering', () => {
  it('no 180° turn', () => {
    const s = makeState();
    const h0 = head(s);
    const r = runMoves(s, 1, 'left');
    expect(head(r)).toEqual({ x: h0.x + 1, y: h0.y });
  });

  it('pending queue holds max 2 turns', () => {
    const s = makeState();
    const r = step(s, [
      { playerId: 'p1', tick: 0, dir: 'up' },
      { playerId: 'p1', tick: 0, dir: 'left' },
      { playerId: 'p1', tick: 0, dir: 'down' },
    ]);
    expect(r.players[0].snake.pendingDirs).toEqual(['up', 'left']);
  });

  it('mirror inverts input', () => {
    const s = makeState();
    const h0 = head(s);
    const m = devApplyItem(s, 'p1', 'mirror');
    const r = runMoves(m, 1, 'down'); // inverted to 'up'
    expect(head(r)).toEqual({ x: h0.x, y: h0.y - 1 });
  });
});

describe('items & effects', () => {
  it('apple grows the snake and scores', () => {
    const s = makeState();
    const h0 = head(s);
    const withApple = devSpawnItemAt(s, 'apple', { x: h0.x + 1, y: h0.y });
    const len0 = s.players[0].snake.segments.length;
    let r = runMoves(withApple, 1);
    expect(r.events.some((e) => e.type === 'eat' && e.itemId === 'apple')).toBe(true);
    expect(r.players[0].score).toBe(10);
    expect(r.items.some((i) => i.kind === 'apple')).toBe(true); // respawned
    r = runMoves(r, 1);
    expect(r.players[0].snake.segments.length).toBe(len0 + 1);
  });

  it('effect ends after durationTicks', () => {
    const d = ITEMS.ghost.durationTicks;
    let s = devApplyItem(makeState(3, { width: 200 }), 'p1', 'ghost');
    for (let t = 0; t < d - 1; t++) s = step(s, []);
    expect(s.players[0].activeEffects.map((e) => e.id)).toEqual(['ghost']);
    s = step(s, []);
    expect(s.players[0].activeEffects).toEqual([]);
    expect(s.events).toContainEqual({ type: 'effectEnd', playerId: 'p1', effectId: 'ghost' });
  });

  it('collecting the same effect again resets the timer', () => {
    let s = devApplyItem(makeState(3, { width: 200 }), 'p1', 'rain');
    for (let t = 0; t < 100; t++) s = step(s, []);
    s = devApplyItem(s, 'p1', 'rain');
    const e = s.players[0].activeEffects;
    expect(e).toHaveLength(1);
    expect(e[0].remainingTicks).toBe(ITEMS.rain.durationTicks);
    expect(e[0].elapsedTicks).toBe(100);
  });

  it('speed shortens move interval and doubles points', () => {
    const s = devApplyItem(makeState(), 'p1', 'speed');
    const r = runMoves(s, 1);
    expect(r.players[0].snake.moveInterval).toBeLessThan(r.config.baseMoveInterval);
    expect(devApplyItem(r, 'p1', 'apple').players[0].score).toBe(ITEMS.speed.points * 1 + 20);
  });

  it('slow lengthens move interval', () => {
    const r = runMoves(devApplyItem(makeState(), 'p1', 'slowmo'), 1);
    expect(r.players[0].snake.moveInterval).toBeGreaterThan(r.config.baseMoveInterval);
  });

  it('shrink removes 3 segments, min 2, keeps score', () => {
    const s = makeState();
    setSnake(s, Array.from({ length: 6 }, (_, i) => ({ x: 10 - i, y: 5 })), 'right');
    s.players[0].score = 70;
    let r = devApplyItem(s, 'p1', 'shrink');
    expect(r.players[0].snake.segments).toHaveLength(3);
    r = devApplyItem(r, 'p1', 'shrink');
    expect(r.players[0].snake.segments).toHaveLength(2);
    expect(r.players[0].score).toBe(70);
  });

  it('always keeps an apple and at most maxSpecials specials', () => {
    let s = makeState(11, { specialSpawnMin: 5, specialSpawnMax: 10, width: 400 });
    s.specialSpawnCooldown = 5;
    let maxSpecials = 0;
    for (let t = 0; t < 3000; t++) {
      s = step(s, []);
      expect(s.items.some((i) => i.kind === 'apple')).toBe(true);
      maxSpecials = Math.max(maxSpecials, s.items.filter((i) => i.kind !== 'apple').length);
    }
    expect(maxSpecials).toBe(2);
    expect(SPECIAL_ITEM_IDS).not.toContain('apple');
  });

  it('effect intensities fade in and out', () => {
    const fx = effectIntensities([{ id: 'rain', remainingTicks: 600, totalTicks: 600, elapsedTicks: 0 }]);
    expect(fx.rain).toBe(0);
    expect(effectIntensities([{ id: 'rain', remainingTicks: 300, totalTicks: 600, elapsedTicks: 300 }]).rain).toBe(1);
    expect(effectIntensities([{ id: 'rain', remainingTicks: 1, totalTicks: 600, elapsedTicks: 599 }]).rain).toBeLessThan(0.1);
    expect(fx.speed).toBe(0);
  });
});
