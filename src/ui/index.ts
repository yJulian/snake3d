import type { GameUI, Screen, UIHandlers, ViewMode } from '../contracts';
import type { GameState, PlayerId } from '../sim/types';
import { createHud } from './hud';
import { createMenu } from './menu';
import { loadHighscore, loadSkin, loadView, saveHighscore, saveSkin, saveView } from './store';
import { injectStyles } from './styles';

function el(cls: string, parent?: HTMLElement, tag = 'div'): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  parent?.appendChild(e);
  return e;
}
function button(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.tabIndex = -1; // keep Enter/Space from re-triggering a focused button
  b.className = 's3d-btn';
  b.textContent = label;
  b.addEventListener('click', () => { b.blur(); onClick(); });
  return b;
}

export function createUI(root: HTMLElement): GameUI {
  const removeStyles = injectStyles();
  const host = el('s3d', root);
  let handlers: Partial<UIHandlers> = {};
  let screen: Screen = 'menu';
  let highscore = loadHighscore();
  let lastScore = 0;
  let newHigh = false;
  let committed = false;

  const hud = createHud();
  host.appendChild(hud.el);

  const menu = createMenu(
    loadSkin(),
    saveSkin,
    (s) => handlers.onStart?.(s),
    loadView(),
    (m) => { saveView(m); handlers.onViewChange?.(m); },
  );
  host.appendChild(menu.el);

  const pause = el('s3d-screen', host);
  el('s3d-h', pause).textContent = 'PAUSE';
  pause.appendChild(button('Weiter', () => handlers.onResume?.()));
  el('s3d-hint', pause).textContent = 'Esc / P zum Fortsetzen';

  const over = el('s3d-screen', host);
  el('s3d-h', over).textContent = 'GAME OVER';
  const overScore = el('s3d-big', over);
  const overNew = el('s3d-new', over);
  overNew.textContent = 'Neuer Highscore!';
  const overHi = el('s3d-sub', over);
  over.appendChild(button('Neustart', () => handlers.onRestart?.()));
  el('s3d-hint', over).textContent = 'R / Enter zum Neustart';

  function refreshOver(): void {
    overScore.textContent = String(lastScore);
    overNew.hidden = !newHigh;
    overHi.textContent = `Highscore ${highscore}`;
  }

  // Menu keyboard control. Enter only acts in the menu: main.ts' onRestart ignores Enter outside
  // 'gameover', and on game over the input module's Enter/R handler restarts, so no double start.
  const onKey = (e: KeyboardEvent) => {
    if (screen !== 'menu' || e.repeat) return;
    if (e.code === 'ArrowLeft') { e.preventDefault(); menu.select(-1); }
    else if (e.code === 'ArrowRight') { e.preventDefault(); menu.select(1); }
    else if (e.code === 'ArrowUp' || e.code === 'ArrowDown') { e.preventDefault(); menu.toggleView(); }
    else if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); handlers.onStart?.(menu.getSkin()); }
  };
  window.addEventListener('keydown', onKey);

  function apply(): void {
    menu.el.hidden = screen !== 'menu';
    pause.hidden = screen !== 'paused';
    over.hidden = screen !== 'gameover';
    hud.setVisible(screen !== 'menu');
  }
  apply();

  return {
    setScreen(s) {
      if (s === 'playing' && screen !== 'paused') {
        hud.reset();
        lastScore = 0;
        newHigh = false;
        committed = false;
      }
      screen = s;
      apply();
      if (s === 'gameover') refreshOver();
    },
    update(state: GameState, id: PlayerId) {
      const p = state.players.find((q) => q.id === id);
      if (p) lastScore = p.score;
      if (screen === 'menu') return;
      hud.update(state, id, highscore);
      if (screen === 'gameover' && !committed) {
        committed = true;
        if (lastScore > highscore) {
          highscore = lastScore;
          newHigh = true;
          saveHighscore(highscore);
        }
        refreshOver();
      }
    },
    onEvents(events) {
      if (screen === 'playing' || screen === 'gameover') hud.onEvents(events);
    },
    setHandlers(next) {
      handlers = { ...handlers, ...next };
    },
    getSelectedSkin: () => menu.getSkin(),
    getSelectedView: () => menu.getView(),
    setSelectedView(mode: ViewMode) {
      menu.setView(mode);
      saveView(mode);
    },
    dispose() {
      window.removeEventListener('keydown', onKey);
      menu.dispose();
      host.remove();
      removeStyles();
    },
  };
}
