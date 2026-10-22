import {
  applyInputEffects,
  hasEffect,
  moveIntervalFor,
  opposite,
  scoreMultiplier,
  startEffect,
  tickEffects,
} from './effects';
import { ITEMS, SPECIAL_ITEM_IDS } from './items';
import { randRange, weightedIndex } from './rng';
import { cellOf, ensureApple, spawnItem } from './state';
import type { DeathCause, Dir, GameConfig, GameEvent, GameState, InputCommand, ItemId, Player, PlayerId, Vec2 } from './types';
import { advance, dirsFor, sameCell } from './world';

/** Simulation ticks per second. Movement happens every `moveInterval` ticks per player. */
export const TICK_HZ = 60;
export const TICK_SEC = 1 / TICK_HZ;
export const MAX_PENDING_DIRS = 2;

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/**
 * Queues a turn: max 2 pending, ignores repeats, 180° reversals (relative to the last queued dir)
 * and directions the world does not have (ascend/descend outside 'volume').
 */
function queueDir(cfg: GameConfig, p: Player, raw: Dir): void {
  if (!dirsFor(cfg).includes(raw)) return;
  const s = p.snake;
  const d = applyInputEffects(p, raw);
  const last = s.pendingDirs.length ? s.pendingDirs[s.pendingDirs.length - 1] : s.dir;
  if (s.pendingDirs.length >= MAX_PENDING_DIRS || d === last || d === opposite(last)) return;
  s.pendingDirs.push(d);
}

function contains(cells: readonly Vec2[], c: Vec2, from = 0): boolean {
  for (let i = from; i < cells.length; i++) if (sameCell(cells[i], c)) return true;
  return false;
}

/** Applies an item's gameplay effect to a player (mutates). Shared by eating and dev tools. */
function consume(p: Player, kind: ItemId, at: Vec2, events: GameEvent[]): void {
  const def = ITEMS[kind];
  const points = def.points * scoreMultiplier(p);
  p.score += points;
  if (def.growth > 0) p.snake.pendingGrowth += def.growth;
  if (def.growth < 0) {
    const len = Math.max(2, p.snake.segments.length + def.growth);
    p.snake.segments = p.snake.segments.slice(0, len);
    p.snake.prevSegments = p.snake.prevSegments.slice(0, len);
    p.snake.pendingGrowth = 0;
  }
  events.push({ type: 'eat', playerId: p.id, itemId: kind, ...cellOf(at), points });
  if (def.effect) startEffect(p, def.effect, def.durationTicks, events);
}

/**
 * Advances the game by one tick and returns a NEW state (the input state is never mutated;
 * internally a deep copy is mutated in place). `inputs` are applied in (tick, playerId) order;
 * the caller delivers the commands that belong to `state.tick` (late commands are still applied, future ones ignored).
 */
export function step(prev: GameState, inputs: readonly InputCommand[]): GameState {
  const state = clone(prev);
  const events: GameEvent[] = [];
  state.events = events;
  if (state.status === 'over') return state;

  const cfg = state.config;
  const { baseMoveInterval } = cfg;
  const byId = new Map<PlayerId, Player>(state.players.map((p) => [p.id, p]));

  // 1. Inputs
  const ordered = inputs
    .filter((c) => c.tick <= state.tick)
    .map((c, i) => ({ c, i }))
    .sort((a, b) => a.c.tick - b.c.tick || (a.c.playerId < b.c.playerId ? -1 : a.c.playerId > b.c.playerId ? 1 : a.i - b.i));
  for (const { c } of ordered) {
    const p = byId.get(c.playerId);
    if (p?.alive) queueDir(cfg, p, c.dir);
  }

  // 2. Movement (simultaneous: compute all new bodies, then resolve collisions)
  const alive = state.players.filter((p) => p.alive);
  const movers: Player[] = [];
  const next = new Map<Player, Vec2[]>();
  const walled = new Set<Player>();
  for (const p of alive) {
    const s = p.snake;
    s.moveCooldown--;
    if (s.moveCooldown > 0) {
      next.set(p, s.segments);
      continue;
    }
    if (s.pendingDirs.length) s.dir = s.pendingDirs.shift()!;
    const adv = advance(cfg, s.segments[0], s.dir);
    movers.push(p);
    if (!adv) {
      walled.add(p);
      next.set(p, s.segments);
      continue;
    }
    // Crossing a cube edge turns the heading; queued turns are carried into the new face frame.
    s.dir = adv.dir;
    s.pendingDirs = s.pendingDirs.map(adv.remap);
    const grow = s.pendingGrowth > 0;
    next.set(p, [adv.cell, ...(grow ? s.segments : s.segments.slice(0, -1))]);
  }

  const deaths: [Player, DeathCause][] = [];
  for (const p of movers) {
    const body = next.get(p)!;
    const head = body[0];
    let cause: DeathCause | null = null;
    if (walled.has(p)) cause = 'wall';
    else if (!hasEffect(p, 'ghost') && contains(body, head, 1)) cause = 'self';
    else if (alive.some((o) => o !== p && contains(next.get(o)!, head))) cause = 'player';
    if (cause) deaths.push([p, cause]);
  }

  for (const p of movers) {
    const s = p.snake;
    if (deaths.some(([d]) => d === p)) continue;
    s.prevSegments = s.segments;
    s.segments = next.get(p)!;
    if (s.pendingGrowth > 0) s.pendingGrowth--;
    s.moveInterval = moveIntervalFor(p, baseMoveInterval);
    s.moveCooldown = s.moveInterval;
  }
  for (const [p, cause] of deaths) {
    p.alive = false;
    p.snake.prevSegments = p.snake.segments;
    p.snake.pendingDirs = [];
    events.push({ type: 'death', playerId: p.id, cause });
  }

  // 3. Effect timers tick before eating, so a freshly collected effect lasts exactly durationTicks.
  for (const p of state.players) if (p.alive) tickEffects(p, events);

  // 4. Eating
  for (const p of movers) {
    if (!p.alive) continue;
    const head = p.snake.segments[0];
    const idx = state.items.findIndex((it) => sameCell(it, head));
    if (idx < 0) continue;
    const [item] = state.items.splice(idx, 1);
    consume(p, item.kind, head, events);
  }

  // 5. Item lifetimes & spawning
  state.items = state.items.filter((it) => {
    if (it.ttl === null) return true;
    it.ttl--;
    if (it.ttl > 0) return true;
    events.push({ type: 'despawn', uid: it.uid, itemId: it.kind, ...cellOf(it) });
    return false;
  });
  ensureApple(state, events);
  if (--state.specialSpawnCooldown <= 0) {
    const specials = state.items.filter((it) => it.kind !== 'apple').length;
    if (specials < state.config.maxSpecials) {
      const kind = SPECIAL_ITEM_IDS[weightedIndex(state, SPECIAL_ITEM_IDS.map((id) => ITEMS[id].weight))];
      spawnItem(state, kind, events);
    }
    state.specialSpawnCooldown = randRange(state, state.config.specialSpawnMin, state.config.specialSpawnMax);
  }

  // 6. Game over when nobody is left alive
  if (!state.players.some((p) => p.alive)) {
    state.status = 'over';
    events.push({ type: 'gameOver' });
  }

  state.tick++;
  return state;
}

// ---------------------------------------------------------------------------
// Dev helpers – local debugging only, never sent over the network.

/** Spawns an item at a position (or a random free cell). Returns a new state. */
export function devSpawnItemAt(prev: GameState, kind: ItemId, at?: Vec2): GameState {
  const state = clone(prev);
  state.events = [];
  spawnItem(state, kind, state.events, at);
  return state;
}

/** Applies an item to a player as if eaten at the snake's head. Returns a new state. */
export function devApplyItem(prev: GameState, playerId: PlayerId, kind: ItemId): GameState {
  const state = clone(prev);
  state.events = [];
  const p = state.players.find((q) => q.id === playerId);
  if (p?.alive) consume(p, kind, p.snake.segments[0], state.events);
  return state;
}
