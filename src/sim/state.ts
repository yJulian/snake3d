import { ITEMS } from './items';
import { randInt, seedToRng } from './rng';
import type { Dir, GameConfig, GameEvent, GameState, ItemId, Player, PlayerId, Vec2 } from './types';

export const DEFAULT_CONFIG: Omit<GameConfig, 'seed'> = {
  width: 24,
  height: 24,
  baseMoveInterval: 8, // 60 Hz / 8 = 7.5 cells per second
  initialLength: 3,
  maxSpecials: 2,
  specialSpawnMin: 4 * 60,
  specialSpawnMax: 9 * 60,
};

export interface PlayerSetup {
  id: PlayerId;
  skinId: string;
}

/**
 * Creates a fresh game. Snakes are placed on evenly spaced rows heading right.
 */
export function createInitialState(
  config: Partial<GameConfig> & { seed: number },
  players: PlayerSetup[],
): GameState {
  const cfg: GameConfig = { ...DEFAULT_CONFIG, ...config };
  const n = players.length;
  const state: GameState = {
    tick: 0,
    config: cfg,
    rng: seedToRng(cfg.seed),
    players: players.map((p, i): Player => {
      const y = Math.floor(((i + 1) * cfg.height) / (n + 1));
      const headX = Math.floor(cfg.width / 2) - (n > 1 ? Math.floor(cfg.width / 4) : 0) + cfg.initialLength - 1;
      const segments: Vec2[] = [];
      for (let k = 0; k < cfg.initialLength; k++) segments.push({ x: headX - k, y });
      const dir: Dir = 'right';
      return {
        id: p.id,
        skinId: p.skinId,
        snake: {
          segments,
          prevSegments: segments.map((s) => ({ ...s })),
          dir,
          pendingDirs: [],
          pendingGrowth: 0,
          moveCooldown: cfg.baseMoveInterval,
          moveInterval: cfg.baseMoveInterval,
        },
        score: 0,
        alive: true,
        activeEffects: [],
      };
    }),
    items: [],
    nextItemUid: 1,
    specialSpawnCooldown: cfg.specialSpawnMin,
    status: 'running',
    events: [],
  };
  ensureApple(state, []);
  state.events = [];
  return state;
}

export function getPlayer(state: GameState, id: PlayerId): Player | undefined {
  return state.players.find((p) => p.id === id);
}

/** Progress 0..1 from prevSegments to segments, given render alpha (0..1) within the current tick. */
export function moveProgress(p: Player, alpha: number): number {
  const s = p.snake;
  if (!p.alive) return 1;
  const t = (s.moveInterval - s.moveCooldown + alpha) / s.moveInterval;
  return Math.min(1, Math.max(0, t));
}

/**
 * Smooth (float) segment positions for rendering. Index 0 is the head.
 * Render-side only – never feed this back into the simulation.
 */
export function interpolateSegments(p: Player, alpha: number): Vec2[] {
  const { segments, prevSegments } = p.snake;
  const t = moveProgress(p, alpha);
  return segments.map((cur, i) => {
    const from = prevSegments[Math.min(i, prevSegments.length - 1)] ?? cur;
    return { x: from.x + (cur.x - from.x) * t, y: from.y + (cur.y - from.y) * t };
  });
}

/** All cells not occupied by a snake or an item, in row-major order. */
export function freeCells(state: GameState): Vec2[] {
  const { width, height } = state.config;
  const used = new Uint8Array(width * height);
  for (const p of state.players) for (const c of p.snake.segments) used[c.y * width + c.x] = 1;
  for (const it of state.items) used[it.y * width + it.x] = 1;
  const out: Vec2[] = [];
  for (let i = 0; i < used.length; i++) if (!used[i]) out.push({ x: i % width, y: Math.floor(i / width) });
  return out;
}

/** Adds an item (mutates state). Position defaults to a random free cell; returns false if the board is full. */
export function spawnItem(state: GameState, kind: ItemId, events: GameEvent[], at?: Vec2): boolean {
  let pos = at;
  if (!pos) {
    const cells = freeCells(state);
    if (cells.length === 0) return false;
    pos = cells[randInt(state, cells.length)];
  }
  const uid = state.nextItemUid++;
  state.items.push({ uid, kind, x: pos.x, y: pos.y, ttl: ITEMS[kind].lifetimeTicks });
  events.push({ type: 'spawn', uid, itemId: kind, x: pos.x, y: pos.y });
  return true;
}

/** Guarantees at least one apple on the board (mutates state). */
export function ensureApple(state: GameState, events: GameEvent[]): void {
  if (!state.items.some((i) => i.kind === 'apple')) spawnItem(state, 'apple', events);
}
