import { SKINS, type SkinId } from '../contracts';
import { ITEM_IDS, ITEMS } from '../sim/items';
import { ITEM_DESCRIPTIONS } from './texts';

export interface Menu {
  el: HTMLElement;
  getSkin(): SkinId;
  select(delta: number): void;
  dispose(): void;
}

const SKIN_LABEL: Record<SkinId, string> = {
  classic: 'Classic', rainbow: 'Rainbow', pumpkin: 'Pumpkin', neon: 'Neon', lava: 'Lava', galaxy: 'Galaxy',
};

export function createMenu(initial: SkinId, onChange: (s: SkinId) => void, onStart: (s: SkinId) => void): Menu {
  const el = document.createElement('div');
  el.className = 's3d-screen menu';
  let skin = initial;

  const title = document.createElement('h1');
  title.className = 's3d-title';
  title.textContent = 'SNAKE3D';
  el.appendChild(title);

  const skins = document.createElement('div');
  skins.className = 's3d-skins';
  const buttons = new Map<SkinId, HTMLButtonElement>();
  for (const id of SKINS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.tabIndex = -1;
    b.className = 's3d-skin';
    b.innerHTML = `<span class="s3d-sw sw-${id}"></span><span></span>`;
    (b.lastChild as HTMLElement).textContent = SKIN_LABEL[id] ?? id;
    b.addEventListener('click', () => { set(id); b.blur(); });
    skins.appendChild(b);
    buttons.set(id, b);
  }
  el.appendChild(skins);

  const start = document.createElement('button');
  start.type = 'button';
  start.tabIndex = -1;
  start.className = 's3d-btn';
  start.textContent = 'Start';
  start.addEventListener('click', () => { start.blur(); onStart(skin); });
  el.appendChild(start);

  const hint = document.createElement('div');
  hint.className = 's3d-hint';
  hint.innerHTML = 'Steuerung: WASD / Pfeiltasten oder Wischen<br>Esc / P Pause · R Neustart · Enter Start · &larr; &rarr; Skin';
  el.appendChild(hint);

  const legend = document.createElement('div');
  legend.className = 's3d-legend';
  for (const id of ITEM_IDS) {
    const d = ITEMS[id];
    const row = document.createElement('div');
    row.className = d.polarity === 'negative' ? 'neg' : 'pos';
    row.style.setProperty('--c', d.color);
    const dot = document.createElement('span');
    dot.className = 's3d-dot';
    const txt = document.createElement('span');
    const name = document.createElement('b');
    name.textContent = d.name;
    txt.append(name, ' ' + ITEM_DESCRIPTIONS[id]);
    row.append(dot, txt);
    legend.appendChild(row);
  }
  el.appendChild(legend);

  function render(): void {
    for (const [id, b] of buttons) b.classList.toggle('sel', id === skin);
  }
  function set(id: SkinId): void {
    skin = id;
    render();
    onChange(id);
  }
  render();

  return {
    el,
    getSkin: () => skin,
    select(delta) {
      const i = SKINS.indexOf(skin);
      set(SKINS[(i + delta + SKINS.length) % SKINS.length]);
    },
    dispose: () => el.remove(),
  };
}
