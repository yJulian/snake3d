import * as THREE from 'three';
import type { EffectIntensities, GameRenderer, ViewMode } from '../contracts';
import { ITEMS } from '../contracts';
import type { Dir, GameConfig, GameEvent, GameState, Item, PlayerId, Vec2 } from '../sim/types';
import type { WorldId } from '../sim/world';
import { createGrid, type GridView } from './grid';
import { createItemKit, ItemView, type ItemViewLike } from './items';
import { createItemKit2D, Item2DView } from './items2d';
import { Particles } from './particles';
import { SnakePath } from './path';
import { createSceneKit, TILT_3D } from './scene';
import { BoardShape } from './shape';
import { SnakeView, type SnakeLike } from './snake';
import { Snake2DView } from './snake2d';
import { getSkin } from './skins';
import { VolumeGuides } from './volume';

/** Screen margin kept while the board tumbles (fitCamera uses 1.12 for the resting board). */
const TUMBLE_MARGIN = 1.06;
/** Duration of the flat <-> curved transformation. */
const MORPH_SEC = 1.8;
/** Follow stiffness (1/s) of the torus scroll and the sphere rotation. */
const FOLLOW_RATE = 5;
const LIFT_3D = 1.2;
const LIFT_2D = 0.1;
const WORLD_TILT: Record<WorldId, number> = {
  flat: TILT_3D,
  torus: THREE.MathUtils.degToRad(38),
  sphere: TILT_3D,
  volume: THREE.MathUtils.degToRad(50),
};
const SCREEN_DIRS: Partial<Record<Dir, [number, number]>> = { up: [0, 1], down: [0, -1], left: [-1, 0], right: [1, 0] };

const tmpCorner = new THREE.Vector3();
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const qIdentity = new THREE.Quaternion();

export function createRenderer(container: HTMLElement): GameRenderer {
  const webgl = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  webgl.setClearColor(0x000000, 1);
  container.appendChild(webgl.domElement);

  const kit = createSceneKit();
  const { scene, camera, boardGroup, worldGroup } = kit;
  const itemKit = createItemKit();
  const itemKit2D = createItemKit2D();
  const particles = new Particles(worldGroup);
  const shape = new BoardShape();

  let cfg: GameConfig | null = null;
  let grid: GridView | null = null;
  let guides: VolumeGuides | null = null;
  let lastTick = -1;
  let lastTime = 0;
  let last: GameState | null = null;
  let viewW = 1;
  let viewH = 1;
  let stamp = 0;
  let mode: ViewMode = '3d';
  let viewKind: ViewMode = '3d'; // representation of snakes/items ('2d' only once the board is flat)
  let framed = false; // true after the first update(): later mode changes ease the camera
  let silentRebuild = false; // views recreated by a mode switch skip the spawn pop
  let morph = 0; // linear 0..1, eased inside BoardShape
  let fitMorph = -1;
  let fitLift = -1;
  let snapFollow = true;
  let followX = 0;
  let followY = 0;
  const globe = new THREE.Quaternion(); // sphere follow rotation (at full morph)
  const snakes = new Map<string, SnakeLike>();
  const paths = new Map<string, SnakePath>();
  const items = new Map<number, ItemViewLike>();
  const deadMemo = new Map<string, number>();

  const worldOf = (): WorldId => cfg?.world ?? 'flat';
  /** Camera mode actually used: the volume has no 2D representation. */
  const effectiveMode = (): ViewMode => (worldOf() === 'volume' ? '3d' : mode);

  function clearViews(): void {
    for (const v of snakes.values()) v.dispose();
    snakes.clear();
    for (const v of items.values()) v.dispose();
    items.clear();
    particles.clear();
  }

  /** Scale (<= 1) that keeps the rotated board (incl. content height) inside the view. */
  function tumbleFitScale(): number {
    boardGroup.scale.setScalar(1);
    boardGroup.updateMatrixWorld(true);
    camera.updateMatrixWorld();
    let ext = 0;
    const pts = kit.fitPoints;
    const stride = Math.max(1, Math.floor(pts.length / 96));
    for (let i = 0; i < pts.length; i += stride) {
      tmpCorner.copy(pts[i]).applyQuaternion(worldGroup.quaternion).applyMatrix4(boardGroup.matrixWorld).project(camera);
      ext = Math.max(ext, Math.abs(tmpCorner.x), Math.abs(tmpCorner.y));
    }
    ext *= TUMBLE_MARGIN;
    return ext > 1 ? 1 / ext : 1;
  }

  function setBoard(c: GameConfig): void {
    cfg = { ...c };
    shape.setConfig(cfg);
    grid?.object.removeFromParent();
    grid?.dispose();
    grid = createGrid(cfg, shape);
    worldGroup.add(grid.object);
    guides?.dispose();
    guides = null;
    if (cfg.world === 'volume') {
      guides = new VolumeGuides(cfg.width, cfg.height, cfg.depth);
      worldGroup.add(guides.object);
    }
    // A new board starts flat and transforms into its shape (the "Verwandlung").
    morph = 0;
    shape.setMorph(0);
    fitMorph = -1;
    kit.setTilt(WORLD_TILT[cfg.world]);
    kit.setView(effectiveMode(), framed);
    snapFollow = true;
    globe.identity();
    worldGroup.quaternion.identity();
  }

  function refit(force = false): void {
    const lift = effectiveMode() === '2d' ? LIFT_2D : LIFT_3D;
    if (!force && morph === fitMorph && lift === fitLift) return;
    fitMorph = morph;
    fitLift = lift;
    kit.fitCamera(shape.boundPoints(lift));
  }

  function advanceMorph(dt: number): void {
    const target = effectiveMode() === '2d' ? 0 : 1;
    if (worldOf() === 'flat') morph = target;
    else if (morph < target) morph = Math.min(target, morph + dt / MORPH_SEC);
    else if (morph > target) morph = Math.max(target, morph - dt / MORPH_SEC);
    shape.setMorph(morph);
    const kind: ViewMode = mode === '2d' && worldOf() !== 'volume' && morph === 0 ? '2d' : '3d';
    if (kind !== viewKind) {
      viewKind = kind;
      rebuildViews();
    }
  }

  function rebuildViews(): void {
    for (const [id, v] of snakes) deadMemo.set(id, v.deadSince);
    for (const v of snakes.values()) v.dispose();
    snakes.clear();
    for (const v of items.values()) v.dispose();
    items.clear();
    silentRebuild = true;
  }

  /** Torus: scrolls the grid so the local head stays in front. Sphere: rotates the globe towards the camera. */
  function follow(head: SnakePath | undefined, dt: number): void {
    const world = worldOf();
    const k = snapFollow ? 1 : 1 - Math.exp(-FOLLOW_RATE * dt);
    if (world === 'torus' && head && head.n > 0) {
      const [tx, ty] = shape.followTarget(head.headX, head.headY, kit.tilt3D);
      let dx = tx - followX;
      let dy = ty - followY;
      dx -= shape.width * Math.round(dx / shape.width);
      dy -= shape.height * Math.round(dy / shape.height);
      followX += dx * k;
      followY += dy * k;
      shape.setFollow(followX, followY);
    } else if (world === 'sphere' && head && head.n > 0) {
      const [cx, cy] = head.headCell;
      const dir = shape.restDir(head.headX, head.headY, shape.faceOf(cx, cy), tmpA).applyQuaternion(globe);
      const tilt = kit.tilt3D;
      tmpB.set(0, Math.cos(tilt), Math.sin(tilt));
      tmpQ.setFromUnitVectors(dir, tmpB);
      globe.premultiply(qIdentity.clone().slerp(tmpQ, k)).normalize();
    }
    const w = world === 'sphere' ? shape.morphValue * shape.morphValue * (3 - 2 * shape.morphValue) : 0;
    worldGroup.quaternion.slerpQuaternions(qIdentity, globe, w);
    snapFollow = false;
  }

  function cellPos(c: Vec2, h: number, out: THREE.Vector3): THREE.Vector3 {
    return shape.eval(c.x, c.y, c.z ?? 0, shape.faceOf(c.x, c.y), h, out);
  }

  return {
    webgl,
    scene,
    camera,
    update(_prev: GameState, curr: GameState, alpha: number, timeSec: number, fx: EffectIntensities) {
      const dt = Math.min(0.1, Math.max(0, timeSec - lastTime));
      lastTime = timeSec;
      last = curr;
      const c = curr.config;
      if (!cfg || c.world !== cfg.world || c.width !== cfg.width || c.height !== cfg.height || c.depth !== cfg.depth) {
        clearViews();
        setBoard(c);
      }
      if (curr.tick < lastTick) {
        clearViews(); // new game
        snapFollow = true;
      }
      lastTick = curr.tick;
      framed = true;
      kit.update(dt);
      advanceMorph(dt);

      // Snake paths (grid space), then follow, then map onto the (possibly scrolled) surface.
      const live = new Set<string>();
      for (const p of curr.players) {
        live.add(p.id);
        let path = paths.get(p.id);
        if (!path) paths.set(p.id, (path = new SnakePath()));
        path.prepare(p, alpha, c);
      }
      for (const id of paths.keys()) if (!live.has(id)) paths.delete(id);
      const local = curr.players[0] ? paths.get(curr.players[0].id) : undefined;
      follow(local, dt);
      grid?.update();
      refit();

      // Snakes
      for (const p of curr.players) {
        const path = paths.get(p.id)!;
        path.map(shape);
        let v = snakes.get(p.id);
        if (!v) {
          v = viewKind === '2d' ? new Snake2DView(worldGroup, p.skinId) : new SnakeView(worldGroup, p.skinId);
          v.deadSince = deadMemo.get(p.id) ?? -1;
          snakes.set(p.id, v);
        }
        v.update(p, path, timeSec, fx.ghost);
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
            viewKind === '2d'
              ? new Item2DView(it.kind, itemKit2D, worldGroup, born, it.uid)
              : new ItemView(it.kind, itemKit, worldGroup, born, it.uid);
          items.set(it.uid, v);
        }
        v.stamp = stamp;
        v.dying = -1;
        v.update(it, timeSec, shape);
      }
      for (const [uid, v] of items) {
        if (v.stamp === stamp) continue;
        if (v.dying < 0) v.dying = timeSec;
        if (!v.update({ ...v.spot, ttl: null }, timeSec, shape)) {
          v.dispose();
          items.delete(uid);
        }
      }

      guides?.update(shape, morph, [...paths.values()], local ?? null, curr.items, timeSec);

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
          cellPos(e, 0.6, tmpA);
          particles.burst(tmpA.x, tmpA.y, tmpA.z, ITEMS[e.itemId].color, e.itemId === 'goldapple' ? 40 : 18, 3.2, 0.7);
        } else if (e.type === 'death') {
          const p = last?.players.find((q) => q.id === e.playerId);
          const h = p?.snake.segments[0];
          if (p && h) {
            const col = new THREE.Color();
            getSkin(p.skinId).headColor(lastTime, col);
            cellPos(h, 0.6, tmpA);
            particles.burst(tmpA.x, tmpA.y, tmpA.z, '#ff5030', 40, 4.5, 1.0);
            particles.burst(tmpA.x, tmpA.y, tmpA.z, col.clone().multiplyScalar(0.7), 25, 3, 1.0);
          }
        }
      }
    },
    mapInput(playerId: PlayerId, dir: Dir): Dir {
      // Only the rotating globe needs screen-relative steering; everywhere else screen axes = grid axes.
      const screen = SCREEN_DIRS[dir];
      const p = last?.players.find((q) => q.id === playerId);
      const h = p?.snake.segments[0];
      if (worldOf() !== 'sphere' || shape.morphValue < 0.5 || !screen || !h) return dir;
      const face = shape.faceOf(h.x, h.y);
      const view = camera.quaternion.clone().invert().multiply(worldGroup.quaternion);
      const tangent = (dx: number, dy: number) => {
        shape.eval(h.x + dx, h.y + dy, 0, face, 0, tmpA, undefined, h.x, h.y);
        shape.eval(h.x - dx, h.y - dy, 0, face, 0, tmpB, undefined, h.x, h.y);
        const v = tmpA.sub(tmpB).applyQuaternion(view);
        const len = Math.hypot(v.x, v.y) || 1;
        return [v.x / len, v.y / len] as const;
      };
      const east = tangent(0.25, 0);
      const south = tangent(0, 0.25);
      const options: [Dir, number][] = [
        ['right', east[0] * screen[0] + east[1] * screen[1]],
        ['left', -(east[0] * screen[0] + east[1] * screen[1])],
        ['down', south[0] * screen[0] + south[1] * screen[1]],
        ['up', -(south[0] * screen[0] + south[1] * screen[1])],
      ];
      options.sort((x, y) => y[1] - x[1]);
      return options[0][0];
    },
    setViewMode(next: ViewMode) {
      if (next === mode) return;
      mode = next;
      kit.setView(effectiveMode(), framed);
      if (cfg) refit(true);
    },
    resize(width: number, height: number) {
      viewW = Math.max(1, width);
      viewH = Math.max(1, height);
      webgl.setPixelRatio(Math.min(2, window.devicePixelRatio));
      webgl.setSize(viewW, viewH);
      camera.aspect = viewW / viewH;
      camera.updateProjectionMatrix();
      if (cfg) refit(true);
    },
    dispose() {
      clearViews();
      particles.dispose();
      grid?.dispose();
      guides?.dispose();
      itemKit.dispose();
      itemKit2D.dispose();
      kit.dispose();
      webgl.dispose();
      webgl.domElement.remove();
    },
  };
}
