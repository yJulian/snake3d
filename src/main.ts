import type { Screen, SkinId } from './contracts';
import { createInput } from './input';
import { LocalTransport } from './net/transport';
import { createRenderer } from './render';
import { createPostProcessor } from './render/post';
import { effectIntensities } from './sim/effects';
import { createInitialState, getPlayer } from './sim/state';
import { devApplyItem, step, TICK_SEC } from './sim/step';
import type { GameEvent, GameState, InputCommand, ItemId } from './sim/types';
import { createUI } from './ui';

const LOCAL_ID = 'p1';
/** Ticks between sampling an input and applying it. 0 locally; >0 for lockstep multiplayer. */
const INPUT_DELAY = 0;
/** Clamp for long frames (tab switch) so we never simulate a huge backlog. */
const MAX_FRAME_SEC = 0.25;
/** Dev mode: digit key → item applied to the local player. */
const DEV_KEYS: Record<number, ItemId> = {
  1: 'goldapple', 2: 'speed', 3: 'slowmo', 4: 'rain', 5: 'mushroom',
  6: 'tumble', 7: 'mirror', 8: 'ghost', 9: 'glitch', 0: 'shrink',
};

const app = document.getElementById('app')!;
const uiRoot = document.getElementById('ui')!;

const renderer = createRenderer(app);
const post = createPostProcessor(renderer.webgl, renderer.scene, renderer.camera);
const ui = createUI(uiRoot);
const input = createInput(window, LOCAL_ID);
const transport = new LocalTransport(LOCAL_ID);

let inbox: InputCommand[] = [];
transport.onMessage((msg) => {
  if (msg.type === 'input') inbox.push(msg.cmd);
});

let skin: SkinId = ui.getSelectedSkin();
let screen: Screen = 'menu';
let curr: GameState = newState(skin, 1);
let prev = curr;
let acc = 0;
let alpha = 0;
let pendingEvents: GameEvent[] = [];

function newState(skinId: SkinId, seed = (Date.now() ^ (Math.random() * 0x100000000)) >>> 0): GameState {
  return createInitialState({ seed }, [{ id: LOCAL_ID, skinId }]);
}

function setScreen(s: Screen): void {
  screen = s;
  ui.setScreen(s);
}

function startGame(skinId: SkinId): void {
  skin = skinId;
  curr = prev = newState(skinId);
  inbox = [];
  acc = alpha = 0;
  input.poll(0); // drop keys pressed in menus
  setScreen('playing');
}

function togglePause(): void {
  if (screen === 'playing') setScreen('paused');
  else if (screen === 'paused') setScreen('playing');
}

input.setHandlers({
  onPause: togglePause,
  onRestart: () => {
    if (screen === 'gameover') startGame(skin);
  },
  onDevKey: (digit) => {
    if (!import.meta.env.DEV || screen !== 'playing') return;
    curr = devApplyItem(curr, LOCAL_ID, DEV_KEYS[digit]);
    pendingEvents.push(...curr.events);
  },
});
ui.setHandlers({
  onStart: startGame,
  onRestart: () => startGame(skin),
  onResume: () => screen === 'paused' && setScreen('playing'),
});

function simulate(dtSec: number): void {
  acc += dtSec;
  while (acc >= TICK_SEC) {
    acc -= TICK_SEC;
    for (const cmd of input.poll(curr.tick + INPUT_DELAY)) transport.send({ type: 'input', cmd });
    const tick = curr.tick;
    const due = inbox.filter((c) => c.tick <= tick);
    inbox = inbox.filter((c) => c.tick > tick);
    prev = curr;
    curr = step(curr, due);
    pendingEvents.push(...curr.events);
    if (curr.status === 'over') {
      acc = 0;
      setScreen('gameover');
      return;
    }
  }
}

function resize(): void {
  const w = app.clientWidth || window.innerWidth;
  const h = app.clientHeight || window.innerHeight;
  renderer.resize(w, h);
  post.resize(w, h);
}

let lastMs = performance.now();
function frame(nowMs: number): void {
  const dtSec = Math.min(MAX_FRAME_SEC, (nowMs - lastMs) / 1000);
  lastMs = nowMs;
  const timeSec = nowMs / 1000;

  if (screen === 'playing') {
    simulate(dtSec);
    if (screen === 'playing') alpha = acc / TICK_SEC;
  } else {
    input.poll(0); // discard direction keys while not playing
  }

  const fx = effectIntensities(getPlayer(curr, LOCAL_ID)?.activeEffects ?? [], alpha);
  if (pendingEvents.length) {
    renderer.onEvents(pendingEvents);
    ui.onEvents(pendingEvents);
    pendingEvents = [];
  }
  renderer.update(prev, curr, alpha, timeSec, fx);
  post.update(fx, timeSec, screen === 'playing' ? dtSec : 0);
  post.render();
  ui.update(curr, LOCAL_ID);
  requestAnimationFrame(frame);
}

window.addEventListener('resize', resize);
resize();
setScreen('menu');
requestAnimationFrame(frame);
