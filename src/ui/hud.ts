import { itemForEffect } from '../contracts';
import type { ActiveEffect, EffectId, GameEvent, GameState, PlayerId } from '../sim/types';
import { ITEMS } from '../sim/items';
import { EFFECT_TOASTS } from './texts';

const BLINK_TICKS = 120; // last 2 s at 60 Hz

interface Badge { el: HTMLElement; label: HTMLElement; bar: HTMLElement; }

export interface Hud {
  el: HTMLElement;
  update(state: GameState, id: PlayerId, highscore: number): void;
  onEvents(events: readonly GameEvent[]): void;
  reset(): void;
  setVisible(v: boolean): void;
}

function div(cls: string, parent?: HTMLElement): HTMLElement {
  const d = document.createElement('div');
  d.className = cls;
  parent?.appendChild(d);
  return d;
}
function stat(parent: HTMLElement, label: string, cls = ''): HTMLElement {
  const s = div('s3d-stat ' + cls, parent);
  s.append(label);
  const b = document.createElement('b');
  b.textContent = '0';
  s.appendChild(b);
  return b;
}

export function createHud(): Hud {
  const el = div('s3d-hud');
  const row = div('s3d-row', el);
  const left = div('', row);
  const scoreEl = stat(left, 'Score');
  const lenEl = stat(left, 'Length');
  lenEl.style.fontSize = '16px';
  const layerEl = stat(left, 'Layer');
  layerEl.style.fontSize = '16px';
  const layerStat = layerEl.parentElement!;
  const pops = div('s3d-pop-wrap', left);
  const hiEl = stat(div('', row), 'High score', 'r');
  const fx = div('s3d-fx', el);

  let localId: PlayerId | null = null;
  const badges = new Map<EffectId, Badge>();
  const last = { score: -1, len: -1, hi: -1, layer: '-' };

  function badgeFor(e: ActiveEffect): Badge | null {
    let b = badges.get(e.id);
    if (b) return b;
    const def = itemForEffect(e.id);
    if (!def || e.id === 'goldflash') return null;
    const be = div('s3d-badge' + (def.polarity === 'negative' ? ' neg' : ''), fx);
    be.style.setProperty('--c', def.color);
    const label = div('', be);
    label.textContent = def.name;
    const bar = div('s3d-bar', be);
    const fill = document.createElement('i');
    bar.appendChild(fill);
    b = { el: be, label, bar: fill };
    badges.set(e.id, b);
    return b;
  }

  function spawn(cls: string, text: string, color: string, parent: HTMLElement): void {
    const n = div(cls, parent);
    n.textContent = text;
    n.style.color = color;
    n.addEventListener('animationend', () => n.remove(), { once: true });
  }

  return {
    el,
    update(state, id, highscore) {
      localId = id;
      const p = state.players.find((q) => q.id === id);
      if (!p) return;
      const score = p.score;
      if (score !== last.score) { last.score = score; scoreEl.textContent = String(score); }
      const len = p.snake.segments.length;
      if (len !== last.len) { last.len = len; lenEl.textContent = String(len); }
      // Volume only: current layer of the head (1 = bottom).
      const { world, depth } = state.config;
      const layer = world === 'volume' ? `${(p.snake.segments[0]?.z ?? 0) + 1} / ${depth}` : '';
      if (layer !== last.layer) {
        last.layer = layer;
        layerEl.textContent = layer;
        layerStat.hidden = !layer;
      }
      const hi = Math.max(highscore, score);
      if (hi !== last.hi) { last.hi = hi; hiEl.textContent = String(hi); }

      const seen = new Set<EffectId>();
      for (const e of p.activeEffects) {
        const b = badgeFor(e);
        if (!b) continue;
        seen.add(e.id);
        b.bar.style.transform = `scaleX(${Math.max(0, Math.min(1, e.remainingTicks / e.totalTicks))})`;
        b.el.classList.toggle('blink', e.remainingTicks <= BLINK_TICKS);
      }
      for (const [eid, b] of badges) {
        if (!seen.has(eid)) { b.el.remove(); badges.delete(eid); }
      }
    },
    onEvents(events) {
      for (const ev of events) {
        if (localId !== null && 'playerId' in ev && ev.playerId !== localId) continue;
        if (ev.type === 'eat') {
          const def = ITEMS[ev.itemId];
          const txt = ev.points > 0 ? `+${ev.points} ${def.name}` : def.name;
          spawn('s3d-pop', txt, def.color, pops);
        } else if (ev.type === 'effectStart') {
          const t = EFFECT_TOASTS[ev.effectId];
          const def = itemForEffect(ev.effectId);
          if (t && def) spawn('s3d-toast', t, def.color, el);
        }
      }
    },
    reset() {
      last.score = last.len = last.hi = -1;
      for (const b of badges.values()) b.el.remove();
      badges.clear();
      pops.textContent = '';
      for (const t of Array.from(el.querySelectorAll('.s3d-toast'))) t.remove();
    },
    setVisible(v) { el.hidden = !v; },
  };
}
