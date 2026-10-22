// STUB – replaced in phase 2
import type { GameUI, Screen, UIHandlers } from '../contracts';

export function createUI(root: HTMLElement): GameUI {
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;top:12px;left:12px;font:16px monospace;color:#ccc;pointer-events:auto';
  root.appendChild(el);
  let h: Partial<UIHandlers> = {};
  let screen: Screen = 'menu';
  let info = '';
  const draw = () => {
    el.innerHTML = '';
    const text = document.createElement('div');
    text.textContent = `${screen.toUpperCase()} ${info}`;
    el.appendChild(text);
    const label = { menu: 'Start', gameover: 'Restart', paused: 'Resume', playing: '' }[screen];
    if (!label) return;
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.onclick = () => (screen === 'menu' ? h.onStart?.('classic') : screen === 'gameover' ? h.onRestart?.() : h.onResume?.());
    el.appendChild(btn);
  };
  draw();
  return {
    setScreen(s) {
      screen = s;
      draw();
    },
    update(state, id) {
      const p = state.players.find((q) => q.id === id);
      const next = p ? `score ${p.score} ${p.activeEffects.map((e) => `${e.id}:${e.remainingTicks}`).join(' ')}` : '';
      if (next !== info) {
        info = next;
        draw();
      }
    },
    onEvents() {},
    setHandlers(next) {
      h = { ...h, ...next };
    },
    getSelectedSkin: () => 'classic',
    dispose: () => el.remove(),
  };
}
