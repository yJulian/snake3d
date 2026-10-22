import { ITEMS } from './items';
import { randInt, seedToRng } from './rng';
import type { Dir, GameConfig, GameEvent, GameState, ItemId, Player, PlayerId, Vec2 } from './types';
import { allCells, cellIndex, WORLD_SIZES } from './world';

export const DEFAULT_CONFIG: Omit<GameConfig, 'seed'> = {
  world: 'flat',
  ...WORLD_SIZES.flat,
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
 * Creates a fresh game. Snakes are placed on evenly spaced rows heading right
 * (sphere: within the middle band of the cube net, volume: on the middle layer).
 * Width/height/depth default to WORLD_SIZES of the chosen world.
 */
export function createInitialState(
  config: Partial<GameConfig> & { seed: number },
  players: PlayerSetup[],
): GameState {
  const cfg: GameConfig = { ...DEFAULT_CONFIG, ...WORLD_SIZES[config.world ?? 'flat'], ...config };
  const n = players.length;
  const band = cfg.world === 'sphere' ? cfg.height / 3 : cfg.height;
  const bandY0 = cfg.world === 'sphere' ? band : 0;
  const z = cfg.world === 'volume' ? { z: Math.floor(cfg.depth / 2) } : {};
  const state: GameState = {
    tick: 0,
    config: cfg,
    rng: seedToRng(cfg.seed),
    players: players.map((p, i): Player => {
      const y = bandY0 + Math.floor(((i + 1) * band) / (n + 1));
      const headX = Math.floor(cfg.width / 2) - (n > 1 ? Math.floor(cfg.width / 4) : 0) + cfg.initialLength - 1;
      const segments: Vec2[] = [];
      for (let k = 0; k < cfg.initialLength; k++) segments.push({ x: headX - k, y, ...z });
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

/** All playable cells not occupied by a snake or an item, in layer/row-major order. */
export function freeCells(state: GameState): Vec2[] {
  const cfg = state.config;
  const used = new Uint8Array(cfg.width * cfg.height * cfg.depth);
  for (const p of state.players) for (const c of p.snake.segments) used[cellIndex(cfg, c)] = 1;
  for (const it of state.items) used[cellIndex(cfg, it)] = 1;
  return allCells(cfg).filter((c) => !used[cellIndex(cfg, c)]);
}

/** Copies a cell (x, y and z only when present), e.g. for events. */
export function cellOf(c: Vec2): Vec2 {
  return c.z === undefined ? { x: c.x, y: c.y } : { x: c.x, y: c.y, z: c.z };
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
  state.items.push({ uid, kind, ...cellOf(pos), ttl: ITEMS[kind].lifetimeTicks });
  events.push({ type: 'spawn', uid, itemId: kind, ...cellOf(pos) });
  return true;
}

/** Guarantees at least one apple on the board (mutates state). */
export function ensureApple(state: GameState, events: GameEvent[]): void {
  if (!state.items.some((i) => i.kind === 'apple')) spawnItem(state, 'apple', events);
}
