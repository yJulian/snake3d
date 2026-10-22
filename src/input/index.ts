import type { InputHandlers, InputSource } from '../contracts';
import type { Dir, InputCommand, PlayerId } from '../sim/types';
import { attachKeyboard } from './keyboard';
import { attachTouch } from './touch';

/** Standard-mapping D-Pad: 12 up, 13 down, 14 left, 15 right. */
const PAD_DIRS: Dir[] = ['up', 'down', 'left', 'right'];

export function createInput(target: HTMLElement | Window, playerId: PlayerId): InputSource {
  let buffer: Dir[] = [];
  let handlers: Partial<InputHandlers> = {};
  const push = (d: Dir) => {
    if (buffer.length < 16) buffer.push(d);
  };
  const detachKeys = attachKeyboard(target, push, () => handlers);
  const detachTouch = attachTouch(target, push);
  const padHeld = [false, false, false, false];

  function pollGamepad(): void {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = Array.from(pads).find((p) => p && p.connected);
    for (let i = 0; i < 4; i++) {
      const down = !!pad?.buttons[12 + i]?.pressed;
      if (down && !padHeld[i]) push(PAD_DIRS[i]);
      padHeld[i] = down;
    }
  }

  return {
    poll(tick): InputCommand[] {
      pollGamepad();
      const out = buffer.map((dir) => ({ playerId, tick, dir }));
      buffer = [];
      return out;
    },
    setHandlers(next) {
      handlers = { ...handlers, ...next };
    },
    dispose() {
      detachKeys();
      detachTouch();
      buffer = [];
    },
  };
}
