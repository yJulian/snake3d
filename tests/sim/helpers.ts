import { createInitialState } from '../../src/sim/state';
import { step } from '../../src/sim/step';
import type { Dir, GameState, InputCommand, Vec2 } from '../../src/sim/types';

export function makeState(seed = 42, extra: Partial<GameState['config']> = {}): GameState {
  const s = createInitialState({ seed, ...extra }, [{ id: 'p1', skinId: 'classic' }]);
  s.items = []; // tests place items explicitly
  s.specialSpawnCooldown = 1e9;
  return s;
}

/** Steps until the player performed `moves` moves (or died). */
export function runMoves(s: GameState, moves: number, dir?: Dir): GameState {
  let cur = s;
  for (let m = 0; m < moves && cur.players[0].alive; m++) {
    let first = true;
    do {
      const inputs: InputCommand[] = first && dir ? [{ playerId: 'p1', tick: cur.tick, dir }] : [];
      first = false;
      cur = step(cur, inputs);
    } while (cur.players[0].alive && cur.players[0].snake.moveCooldown !== cur.players[0].snake.moveInterval);
  }
  return cur;
}

export function setSnake(s: GameState, segments: Vec2[], dir: Dir): void {
  const sn = s.players[0].snake;
  sn.segments = segments;
  sn.prevSegments = segments.map((c) => ({ ...c }));
  sn.dir = dir;
  sn.pendingDirs = [];
}

export const head = (s: GameState) => s.players[0].snake.segments[0];
