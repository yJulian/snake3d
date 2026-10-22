// Pure data types of the simulation. Everything here is plain JSON (no classes, Maps, Sets).

/** Grid coordinates: x grows to the right, y grows downwards (row 0 = top). */
export interface Vec2 {
  x: number;
  y: number;
}

/** 'up' = y-1, 'down' = y+1, 'left' = x-1, 'right' = x+1. */
export type Dir = 'up' | 'down' | 'left' | 'right';

export type PlayerId = string;

export type EffectId =
  | 'speed'
  | 'slow'
  | 'rain'
  | 'trip'
  | 'tumble'
  | 'mirror'
  | 'ghost'
  | 'glitch'
  | 'fisheye'
  | 'goldflash';

export type ItemId =
  | 'apple'
  | 'goldapple'
  | 'speed'
  | 'slowmo'
  | 'rain'
  | 'mushroom'
  | 'tumble'
  | 'mirror'
  | 'ghost'
  | 'glitch'
  | 'shrink';

export interface ActiveEffect {
  id: EffectId;
  /** Ticks until the effect ends (reset to totalTicks when collected again). */
  remainingTicks: number;
  totalTicks: number;
  /** Ticks since first activation; NOT reset on refresh (used for smooth fade-in). */
  elapsedTicks: number;
}

export interface Snake {
  /** segments[0] is the head. */
  segments: Vec2[];
  /** Segments before the most recent move (for render interpolation). */
  prevSegments: Vec2[];
  /** Direction of the last move. */
  dir: Dir;
  /** Queued turns, max 2; applied one per move. */
  pendingDirs: Dir[];
  /** Segments still to be added (one per move). */
  pendingGrowth: number;
  /** Ticks until the next move. */
  moveCooldown: number;
  /** Interval (ticks per cell) that was used when the last move was scheduled. */
  moveInterval: number;
}

export interface Player {
  id: PlayerId;
  /** Purely cosmetic, read by the renderer (see SKINS in contracts.ts). */
  skinId: string;
  snake: Snake;
  score: number;
  alive: boolean;
  activeEffects: ActiveEffect[];
}

export interface Item {
  /** Unique per game, increasing. */
  uid: number;
  kind: ItemId;
  x: number;
  y: number;
  /** Ticks until the item disappears from the board; null = stays forever (apples). */
  ttl: number | null;
}

export interface GameConfig {
  width: number;
  height: number;
  seed: number;
  /** Ticks per cell without effects. */
  baseMoveInterval: number;
  initialLength: number;
  maxSpecials: number;
  /** Random delay range (ticks) between special spawn attempts. */
  specialSpawnMin: number;
  specialSpawnMax: number;
}

export type DeathCause = 'wall' | 'self' | 'player';

export type GameEvent =
  | { type: 'eat'; playerId: PlayerId; itemId: ItemId; x: number; y: number; points: number }
  | { type: 'death'; playerId: PlayerId; cause: DeathCause }
  | { type: 'effectStart'; playerId: PlayerId; effectId: EffectId; refreshed: boolean }
  | { type: 'effectEnd'; playerId: PlayerId; effectId: EffectId }
  | { type: 'spawn'; uid: number; itemId: ItemId; x: number; y: number }
  | { type: 'despawn'; uid: number; itemId: ItemId; x: number; y: number }
  | { type: 'gameOver' };

export interface GameState {
  /** Number of completed steps. Inputs stamped with `tick` are applied by the step from tick -> tick+1. */
  tick: number;
  config: GameConfig;
  /** mulberry32 state (uint32). */
  rng: number;
  players: Player[];
  items: Item[];
  nextItemUid: number;
  specialSpawnCooldown: number;
  status: 'running' | 'over';
  /** Events produced by the most recent step only. */
  events: GameEvent[];
}

export interface InputCommand {
  playerId: PlayerId;
  /** Tick at which the command is applied (see GameState.tick). */
  tick: number;
  dir: Dir;
}
