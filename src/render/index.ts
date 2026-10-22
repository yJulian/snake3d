import * as THREE from 'three';
import type { EffectIntensities, GameRenderer, ViewMode } from '../contracts';
import { ITEMS, interpolateSegments } from '../contracts';
import type { GameEvent, GameState, Item } from '../sim/types';
import { createGrid, type GridView } from './grid';
import { createItemKit, ItemView, type ItemViewLike } from './items';
import { createItemKit2D, Item2DView } from './items2d';
import { Particles } from './particles';
import { createSceneKit } from './scene';
import { SnakeView, type Layout, type SnakeLike } from './snake';
import { Snake2DView } from './snake2d';
import { getSkin } from './skins';

/** Screen margin kept while the board tumbles (fitCamera uses 1.12 for the resting board). */
const TUMBLE_MARGIN = 1.06;
const tmpCorner = new THREE.Vector3();

export function createRenderer(container: HTMLElement): GameRenderer {
  const webgl = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  webgl.setClearColor(0x000000, 1);
  container.appendChild(webgl.domElement);

  const kit = createSceneKit();
  const { scene, camera, boardGroup } = kit;
  const itemKit = createItemKit();
  const itemKit2D = createItemKit2D();
  const particles = new Particles(boardGroup);

  const lay: Layout = { ox: 0, oz: 0 };
  let cols = 0;
  let rows = 0;
  let grid: GridView | null = null;
  let lastTick = -1;
  let lastTime = 0;
  let last: GameState | null = null;
  let viewW = 1;
  let viewH = 1;
  let stamp = 0;
  let mode: ViewMode = '3d';
  let framed = false; // true after the first update(): later mode changes ease the camera
  let silentRebuild = false; // views recreated by a mode switch skip the spawn pop
  const snakes = new Map<string, SnakeLike>();
  const items = new Map<number, ItemViewLike>();
  const deadMemo = new Map<string, number>();

  function clearViews(): void {
    for (const v of snakes.values()) v.dispose();
    snakes.clear();
    for (const v of items.values()) v.dispose();
    items.clear();
    particles.clear();
  }

  /** Scale (<= 1) that keeps the rotated board (incl. snake height) inside the view. */
  function tumbleFitScale(): number {
    boardGroup.scale.setScalar(1);
    boardGroup.updateMatrixWorld(true);
    camera.updateMatrixWorld();
    let ext = 0;
    for (let i = 0; i < 8; i++) {
      tmpCorner
        .set(((i & 1 ? 1 : -1) * cols) / 2, i & 4 ? kit.contentHeight : 0, ((i & 2 ? 1 : -1) * rows) / 2)
        .applyMatrix4(boardGroup.matrixWorld)
        .project(camera);
      ext = Math.max(ext, Math.abs(tmpCorner.x), Math.abs(tmpCorner.y));
    }
    ext *= TUMBLE_MARGIN;
    return ext > 1 ? 1 / ext : 1;
  }

  function setBoard(c: number, r: number): void {
    cols = c;
    rows = r;
    grid?.object.removeFromParent();
    grid?.dispose();
    grid = createGrid(c, r);
    boardGroup.add(grid.object);
    lay.ox = -c / 2 + 0.5;
    lay.oz = -r / 2 + 0.5;
    kit.fitCamera(c, r);
  }

  return {
    webgl,
    scene,
    camera,
    update(_prev: GameState, curr: GameState, alpha: number, timeSec: number, fx: EffectIntensities) {
      const dt = Math.min(0.1, Math.max(0, timeSec - lastTime));
      lastTime = timeSec;
      last = curr;
      if (curr.config.width !== cols || curr.config.height !== rows) {
        clearViews();
        setBoard(curr.config.width, curr.config.height);
      }
      if (curr.tick < lastTick) clearViews(); // new game
      lastTick = curr.tick;
      framed = true;
      kit.update(dt);

      // Snakes
      const live = new Set<string>();
      for (const p of curr.players) {
        live.add(p.id);
        let v = snakes.get(p.id);
        if (!v) {
          v = mode === '2d' ? new Snake2DView(boardGroup, p.skinId) : new SnakeView(boardGroup, p.skinId);
          v.deadSince = deadMemo.get(p.id) ?? -1;
          snakes.set(p.id, v);
        }
        v.update(p, interpolateSegments(p, alpha), timeSec, lay, fx.ghost);
      }
      for (const [id, v] of snakes) {
        if (!live.has(id)) {
          v.dispose();
          snakes.delete(id);
        }
      }

      // Items
      stamp++;
      for (const it of curr.items as readonly Item[]) {
        let v = items.get(it.uid);
        if (v && v.kind !== it.kind) {
          v.dispose();
          items.delete(it.uid);
          v = undefined;
        }
        if (!v) {
          const born = silentRebuild ? timeSec - 10 : timeSec;
          v =
            mode === '2d'
              ? new Item2DView(it.kind, itemKit2D, boardGroup, born, it.uid)
              : new ItemView(it.kind, itemKit, boardGroup, born, it.uid);
          items.set(it.uid, v);
        }
        v.stamp = stamp;
        v.dying = -1;
        v.update(it, timeSec, lay);
      }
      for (const [uid, v] of items) {
        if (v.stamp === stamp) continue;
        if (v.dying < 0) v.dying = timeSec;
        // keep last known position; update() only needs x/y/ttl
        const keep = v.update({ uid, kind: v.kind, x: v.root.position.x - lay.ox, y: v.root.position.z - lay.oz, ttl: null }, timeSec, lay);
        if (!keep) {
          v.dispose();
          items.delete(uid);
        }
      }

      silentRebuild = false;
      deadMemo.clear();
      particles.update(dt);

      // Tumble: smooth, returns exactly to identity at 0; shrinks the board so it never leaves the frame
      const a = fx.tumble;
      if (a > 0) {
        boardGroup.rotation.set(
          a * 0.45 * Math.sin(timeSec * 0.8),
          a * 1.1 * Math.sin(timeSec * 0.45 + 2),
          a * 0.5 * Math.sin(timeSec * 0.6 + 1),
        );
        boardGroup.scale.setScalar(tumbleFitScale());
      } else {
        boardGroup.rotation.set(0, 0, 0);
        boardGroup.scale.setScalar(1);
      }
    },
    onEvents(events: readonly GameEvent[]) {
      for (const e of events) {
        if (e.type === 'eat') {
          particles.burst(e.x + lay.ox, 0.6, e.y + lay.oz, ITEMS[e.itemId].color, e.itemId === 'goldapple' ? 40 : 18, 3.2, 0.7);
        } else if (e.type === 'death') {
          const p = last?.players.find((q) => q.id === e.playerId);
          const h = p?.snake.segments[0];
          if (p && h) {
            const c = new THREE.Color();
            getSkin(p.skinId).headColor(lastTime, c);
            particles.burst(h.x + lay.ox, 0.6, h.y + lay.oz, '#ff5030', 40, 4.5, 1.0);
            particles.burst(h.x + lay.ox, 0.6, h.y + lay.oz, c.clone().multiplyScalar(0.7), 25, 3, 1.0);
          }
        }
      }
    },
    setViewMode(next: ViewMode) {
      if (next === mode) return;
      mode = next;
      kit.setView(next, framed);
      // Snakes/items are rebuilt lazily by the next update() in the new representation.
      for (const [id, v] of snakes) deadMemo.set(id, v.deadSince);
      for (const v of snakes.values()) v.dispose();
      snakes.clear();
      for (const v of items.values()) v.dispose();
      items.clear();
      silentRebuild = true;
    },
    resize(width: number, height: number) {
      viewW = Math.max(1, width);
      viewH = Math.max(1, height);
      webgl.setPixelRatio(Math.min(2, window.devicePixelRatio));
      webgl.setSize(viewW, viewH);
      camera.aspect = viewW / viewH;
      camera.updateProjectionMatrix();
      if (cols > 0) kit.fitCamera(cols, rows);
    },
    dispose() {
      clearViews();
      particles.dispose();
      grid?.dispose();
      itemKit.dispose();
      itemKit2D.dispose();
      kit.dispose();
      webgl.dispose();
      webgl.domElement.remove();
    },
  };
}
