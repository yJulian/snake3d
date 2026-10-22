import type { GameState } from './types';

/** 32-bit FNV-1a over the canonical JSON of the state, as 8 hex digits. */
export function hashState(state: GameState): string {
  const str = JSON.stringify(state);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
