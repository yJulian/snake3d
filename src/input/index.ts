// STUB – replaced in phase 2
import type { InputHandlers, InputSource } from '../contracts';
import type { Dir, InputCommand, PlayerId } from '../sim/types';

const KEYS: Record<string, Dir> = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
};

export function createInput(target: HTMLElement | Window, playerId: PlayerId): InputSource {
  let buffer: Dir[] = [];
  let h: Partial<InputHandlers> = {};
  const onKey = (ev: Event) => {
    const e = ev as KeyboardEvent;
    if (KEYS[e.code]) buffer.push(KEYS[e.code]);
    else if (e.code === 'Escape' || e.code === 'KeyP') h.onPause?.();
    else if (e.code === 'KeyR' || e.code === 'Enter') h.onRestart?.();
    else if (/^Digit\d$/.test(e.code)) h.onDevKey?.(Number(e.code.slice(5)));
  };
  target.addEventListener('keydown', onKey);
  return {
    poll(tick): InputCommand[] {
      const out = buffer.map((dir) => ({ playerId, tick, dir }));
      buffer = [];
      return out;
    },
    setHandlers(next) {
      h = { ...h, ...next };
    },
    dispose() {
      target.removeEventListener('keydown', onKey);
    },
  };
}
