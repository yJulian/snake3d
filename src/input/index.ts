import type { InputHandlers, InputSource } from '../contracts';
import type { Dir, InputCommand, PlayerId } from '../sim/types';
import { attachKeyboard } from './keyboard';
import { attachTouch } from './touch';

/** Standard mapping: D-Pad 12 up, 13 down, 14 left, 15 right; R1 (5) ascend, L1 (4) descend. */
const PAD_BUTTONS: [number, Dir][] = [[12, 'up'], [13, 'down'], [14, 'left'], [15, 'right'], [5, 'ascend'], [4, 'descend']];

export function createInput(target: HTMLElement | Window, playerId: PlayerId): InputSource {
  let buffer: Dir[] = [];
  let handlers: Partial<InputHandlers> = {};
  const push = (d: Dir) => {
    if (buffer.length < 16) buffer.push(d);
  };
  const detachKeys = attachKeyboard(target, push, () => handlers);
  const detachTouch = attachTouch(target, push);
  const padHeld = PAD_BUTTONS.map(() => false);

  function pollGamepad(): void {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = Array.from(pads).find((p) => p && p.connected);
    PAD_BUTTONS.forEach(([button, dir], i) => {
      const down = !!pad?.buttons[button]?.pressed;
      if (down && !padHeld[i]) push(dir);
      padHeld[i] = down;
    });
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
