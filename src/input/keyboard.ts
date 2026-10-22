import type { Dir } from '../sim/types';
import type { InputHandlers } from '../contracts';

const DIR_KEYS: Record<string, Dir> = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
};
const PREVENT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

/** Attaches keyboard listeners; returns a detach function. */
export function attachKeyboard(
  target: HTMLElement | Window,
  push: (d: Dir) => void,
  handlers: () => Partial<InputHandlers>,
): () => void {
  const onKey = (ev: Event) => {
    const e = ev as KeyboardEvent;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (PREVENT.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    const dir = DIR_KEYS[e.code];
    const h = handlers();
    if (dir) push(dir);
    else if (e.code === 'Escape' || e.code === 'KeyP') h.onPause?.();
    else if (e.code === 'KeyR' || e.code === 'Enter' || e.code === 'NumpadEnter') h.onRestart?.();
    else if (/^(Digit|Numpad)\d$/.test(e.code)) h.onDevKey?.(Number(e.code.slice(-1)));
  };
  target.addEventListener('keydown', onKey);
  return () => target.removeEventListener('keydown', onKey);
}
