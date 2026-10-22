/**
 * Interfaces between main.ts and the phase-2 modules (render, post, input, ui).
 * Each module exports exactly one factory from the path noted on its interface.
 *
 * Frame flow in main.ts (per animation frame):
 *   1. input.poll(tick) per sim tick → Transport → step()
 *   2. fx = effectIntensities(localPlayer.activeEffects, alpha)
 *   3. renderer.onEvents(events) / ui.onEvents(events)  (events of all steps run this frame)
 *   4. renderer.update(prev, curr, alpha, timeSec, fx)  – syncs the Three.js scene graph only
 *   5. post.update(fx, timeSec, dtSec); post.render()  – the ONLY place that draws to the canvas
 *   6. ui.update(curr, localPlayerId)
 */
import type { Camera, Scene, WebGLRenderer } from 'three';
import type { EffectIntensities } from './sim/effects';
import type { Dir, GameEvent, GameState, InputCommand, PlayerId } from './sim/types';
import type { WorldId } from './sim/world';

export type { EffectIntensities } from './sim/effects';
export { effectIntensities, EFFECT_IDS } from './sim/effects';
export { ITEMS, itemForEffect } from './sim/items';
export { moveProgress } from './sim/state';
export { TICK_HZ } from './sim/step';
export { WORLD_IDS, type WorldId } from './sim/world';

/** Snake skins (cosmetic). Player.skinId is one of these. Visuals are defined in src/render/skins.ts. */
export const SKINS = ['classic', 'rainbow', 'pumpkin', 'neon', 'lava', 'galaxy'] as const;
export type SkinId = (typeof SKINS)[number];

/** View modes: '3d' = tilted perspective camera with 3D snake/items, '2d' = top-down camera with flat shapes. */
export const VIEW_MODES = ['3d', '2d'] as const;
export type ViewMode = (typeof VIEW_MODES)[number];

// ---------------------------------------------------------------------------
// src/render/index.ts: export function createRenderer(container: HTMLElement): GameRenderer

/**
 * Owns the WebGLRenderer (its canvas is appended to `container`), the Scene and the Camera.
 * Board: cell (x, y[, z]) of the grid; y grows downwards in sim coordinates (see Vec2). The board's
 * shape follows GameConfig.world: a new world starts flat and transforms into torus / sphere / box;
 * the 2D view always shows the flat layout (the volume has no 2D view and stays 3D).
 * Background must be pure black (#000), grid lines grey, only snakes/items colored.
 */
export interface GameRenderer {
  readonly webgl: WebGLRenderer;
  readonly scene: Scene;
  readonly camera: Camera;
  /**
   * Syncs the scene graph to the interpolated state between `prev` and `curr` (alpha 0..1).
   * Smooth snake positions come from SnakePath (src/render/path.ts), which interpolates across wraps.
   * Applies gameplay-visible effects in 3D: fx.tumble (board rotation), fx.ghost (snake transparency).
   * Must NOT call webgl.render – PostProcessor does the final draw.
   */
  update(prev: GameState, curr: GameState, alpha: number, timeSec: number, fx: EffectIntensities): void;
  /** One-shot reactions (eat particles, death flash, spawn pop). */
  onEvents(events: readonly GameEvent[]): void;
  /**
   * Converts a raw (screen) direction into the grid direction the player means. Identity except on the
   * rotating sphere, where grid axes turn on screen. Called before inputs are sent to the sim.
   */
  mapInput(playerId: PlayerId, dir: Dir): Dir;
  /**
   * Switches between the 3D view and the flat top-down 2D view (same Camera instance, eased transition).
   * Safe to call at any time (also mid-game); the first call before the first update() applies instantly.
   */
  setViewMode(mode: ViewMode): void;
  /** Sets webgl size/pixel ratio and camera aspect. */
  resize(width: number, height: number): void;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// src/render/post/index.ts: export function createPostProcessor(webgl, scene, camera): PostProcessor

/**
 * Screen-space effects via EffectComposer (RenderPass(scene, camera) + one pass per effect).
 * Mapping: speed → radial blur + chromatic aberration, slow → desaturation/vignette/ripple,
 * rain → droplet refraction, trip → sine warp + hue shift, mirror → horizontal flip + glitch,
 * ghost → scanlines, glitch → RGB split/block displacement/CRT, fisheye → fisheye pulse,
 * goldflash → bloom flash. tumble is handled by the renderer (no post pass required).
 * Intensities are 0..1 and may stack; a pass with intensity 0 should be disabled/cheap.
 */
export interface PostProcessor {
  update(fx: EffectIntensities, timeSec: number, dtSec: number): void;
  /** Draws the frame to the canvas. */
  render(): void;
  resize(width: number, height: number): void;
  dispose(): void;
}
export type CreatePostProcessor = (webgl: WebGLRenderer, scene: Scene, camera: Camera) => PostProcessor;

// ---------------------------------------------------------------------------
// src/input/index.ts: export function createInput(target: HTMLElement | Window, playerId: PlayerId): InputSource

export interface InputHandlers {
  /** Esc / P – toggle pause. */
  onPause: () => void;
  /** R / Enter on game over – restart. */
  onRestart: () => void;
  /** Digit keys 0–9 (only wired by main.ts in dev mode). */
  onDevKey: (digit: number) => void;
  /** V – toggle between 3D and 2D view. */
  onToggleView: () => void;
}

/**
 * Keyboard (WASD + arrows, Space/E = ascend, Shift/Q = descend), gamepad (D-pad, R1/L1) and touch swipe
 * (two-finger vertical swipe = ascend/descend). Collects direction presses between polls,
 * in order. Raw directions only – mirror inversion and 180° filtering happen in the sim.
 */
export interface InputSource {
  /** Returns and clears the buffered directions, stamped with `tick` and this source's playerId. */
  poll(tick: number): InputCommand[];
  setHandlers(handlers: Partial<InputHandlers>): void;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// src/ui/index.ts: export function createUI(root: HTMLElement): GameUI

export type Screen = 'menu' | 'playing' | 'paused' | 'gameover';

export interface UIHandlers {
  /** Start button in the menu, with the chosen skin. */
  onStart: (skinId: SkinId) => void;
  /** World switch in the menu (fires immediately; the menu background shows the transformation). */
  onWorldChange: (world: WorldId) => void;
  /** Restart button on game over. */
  onRestart: () => void;
  /** Resume button on the pause screen. */
  onResume: () => void;
  /** View switch in the menu (fires immediately, the menu background is the board). */
  onViewChange: (mode: ViewMode) => void;
}

/**
 * DOM overlay inside `root` (#ui, which has pointer-events: none – enable them on interactive elements).
 * Owns: menu with skin selection (persist choice in localStorage), HUD (score, highscore in
 * localStorage, active effects with remaining-time bars using ITEMS/itemForEffect for names and
 * colors), pause screen, game-over screen (final score, new-highscore hint).
 */
export interface GameUI {
  setScreen(screen: Screen): void;
  /** Called every frame while a game exists; HUD reads the local player's score and activeEffects. */
  update(state: GameState, localPlayerId: PlayerId): void;
  onEvents(events: readonly GameEvent[]): void;
  setHandlers(handlers: Partial<UIHandlers>): void;
  /** Last skin chosen (from localStorage), used for the first game. */
  getSelectedSkin(): SkinId;
  /** Last view mode chosen (from localStorage "snake3d.view"), default '3d'. */
  getSelectedView(): ViewMode;
  /** Last world chosen (from localStorage "snake3d.world"), default 'flat'. */
  getSelectedWorld(): WorldId;
  /** Sets and persists the view mode shown in the menu (e.g. after the V key). Does NOT call onViewChange. */
  setSelectedView(mode: ViewMode): void;
  dispose(): void;
}
