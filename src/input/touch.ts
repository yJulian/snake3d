import type { Dir } from '../sim/types';

const THRESHOLD = 24;

/**
 * Swipe detection: every >=24px move along the dominant axis emits a direction and re-anchors.
 * With two fingers down, vertical swipes emit ascend (up) / descend (down) instead.
 */
export function attachTouch(target: HTMLElement | Window, push: (d: Dir) => void): () => void {
  let id: number | null = null;
  let ax = 0;
  let ay = 0;
  let fingers = 0;
  const root: HTMLElement | null = target instanceof Window ? document.documentElement : target;
  const prevTouchAction = root.style.touchAction;
  root.style.touchAction = 'none';

  const onStart = (ev: Event) => {
    fingers = (ev as TouchEvent).touches.length;
    const t = (ev as TouchEvent).changedTouches[0];
    if (!t || id !== null) return;
    id = t.identifier;
    ax = t.clientX;
    ay = t.clientY;
  };
  const onMove = (ev: Event) => {
    const e = ev as TouchEvent;
    if (e.cancelable) e.preventDefault();
    if (id === null) return;
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier !== id) continue;
      const dx = t.clientX - ax;
      const dy = t.clientY - ay;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < THRESHOLD) return;
      if (Math.abs(dx) > Math.abs(dy)) push(dx > 0 ? 'right' : 'left');
      else if (fingers >= 2) push(dy > 0 ? 'descend' : 'ascend');
      else push(dy > 0 ? 'down' : 'up');
      ax = t.clientX;
      ay = t.clientY;
    }
  };
  const onEnd = (ev: Event) => {
    fingers = (ev as TouchEvent).touches.length;
    for (const t of Array.from((ev as TouchEvent).changedTouches)) if (t.identifier === id) id = null;
  };

  const opts = { passive: false } as AddEventListenerOptions;
  target.addEventListener('touchstart', onStart, opts);
  target.addEventListener('touchmove', onMove, opts);
  target.addEventListener('touchend', onEnd);
  target.addEventListener('touchcancel', onEnd);
  return () => {
    target.removeEventListener('touchstart', onStart);
    target.removeEventListener('touchmove', onMove);
    target.removeEventListener('touchend', onEnd);
    target.removeEventListener('touchcancel', onEnd);
    root.style.touchAction = prevTouchAction;
  };
}
