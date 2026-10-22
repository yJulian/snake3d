# Snake3D

Browser Snake in 3D, built with Vite, TypeScript and Three.js. The background is pure black (`#000`, OLED-friendly). Only the snakes and the items are colored. The board is a grid with gray lines. Screen effects (speed blur, glitch, fisheye, rain refraction and more) run as shader passes on the EffectComposer.

## Getting started

```bash
npm install
npm run dev      # dev server (Vite)
npm test         # simulation tests (Vitest)
npm run build    # typecheck (tsc --noEmit) + production build (vite build)
```

Other scripts: `npm run typecheck`, `npm run preview`.

## Controls

| Action | Input |
| --- | --- |
| Direction | `W` `A` `S` `D` or arrow keys; swipe on touch devices |
| Up / down (3D Space only) | `Space` / `E` up, `Shift` / `Q` down; gamepad `R1` / `L1`; touch: swipe vertically with two fingers |
| Pause / resume | `Esc` or `P` |
| Restart (after game over) | `R` or `Enter` |
| View 3D / 2D | `V` (anywhere); in the menu also the toggle or `↑` `↓` |
| World | in the menu the toggle or `Tab` / `Shift+Tab` |
| Dev items (`npm run dev` only) | digits `1`–`0`, see below |

Dev mapping (`DEV_KEYS` in `src/main.ts`), applies to the local player, only when `import.meta.env.DEV` is set:

| Key | Item | Key | Item |
| --- | --- | --- | --- |
| `1` | Gold Apple | `6` | Dice |
| `2` | Lightning | `7` | Mirror |
| `3` | Hourglass | `8` | Ghost |
| `4` | Rain | `9` | Skull |
| `5` | Mushroom | `0` | Scissors |

## View

Two view modes: `3d` (angled perspective camera, snake and items as 3D objects) and `2d` (classic flat: camera looking straight down with a narrow FOV, snake and items as flat shapes on the board). Toggle with `V` on any screen or via the toggle in the menu (takes effect immediately, even mid-game, with a smooth camera transition). The choice is stored in localStorage (`snake3d.view`). The tumble effect tilts the board in 2D as well. Implementation: `ViewMode`/`VIEW_MODES` in `src/contracts.ts`, `GameRenderer.setViewMode`; 2D variants in `src/render/snake2d.ts` and `src/render/items2d.ts`, camera in `src/render/scene.ts`.

## Worlds

Four board topologies (`WorldId`/`WORLD_IDS` in `src/sim/world.ts`). The world is chosen in the menu and stored in localStorage (`snake3d.world`). A new board starts flat and morphs into its shape with an animation (about 1.8 s). The 2D view always shows the flat layout. When switching, the shape rolls back up or unrolls.

| World | Size | Rules | 3D rendering |
| --- | --- | --- | --- |
| `flat` (Flat) | 24 × 24 | Walls | as before |
| `torus` (Torus) | 36 × 16 | No walls: exit right to enter left, exit top to enter bottom | The rectangle rolls into a tube and bends into a ring. The grid scrolls around the ring so the head stays in front. |
| `sphere` (Sphere) | 6 × 10 × 10 | Cube surface without walls, stored as a cross-shaped net (40 × 30). Crossing a cube edge takes you to the neighboring face, and the direction rotates with it. | The net folds into a cube and inflates into a sphere (equal-angle cube sphere). The sphere rotates so the head faces the camera. |
| `volume` (3D Space) | 12 × 12 × 12 | Walls in all directions. Extra directions `ascend` / `descend` (z + 1 / z − 1). | Wireframe box that grows out of the floor. Plus a grid on the current head layer, the snake's floor shadow, plumb lines from items and head down to the floor, and items on the head layer pulse. The HUD shows the layer. No 2D view. |

Controls on the sphere: because the sphere rotates beneath the snake, the keys are screen-relative. `GameRenderer.mapInput` converts the pressed direction into the matching net direction of the current cube face before the input reaches the simulation. In all other worlds the screen and grid axes coincide.

Implementation: simulation in `src/sim/world.ts` (`advance` returns the target cell, the new direction and a conversion for already queued turns). Rendering in `src/render/shape.ts` (`BoardShape`: grid coordinates to world position and normal, depending on the morph), `src/render/path.ts` (interpolation across seams) and `src/render/volume.ts` (depth cues). Tests are in `tests/sim/world.test.ts`.

## Items

Duration = `durationTicks / TICK_HZ` (TICK_HZ = 60). The table shows the values from `src/sim/items.ts`; the effect text comes from `ITEM_DESCRIPTIONS` in `src/ui/texts.ts`.

| Item | Name | Color | Effect | Duration (s) | Polarity |
| --- | --- | --- | --- | --- | --- |
| `apple` | Apple | `#ff2a2a` | Grow by 1, +10 points | – (no effect) | positive |
| `goldapple` | Gold Apple | `#ffc61a` | Grow by 3, +50 points, golden flash | 0.75 | positive |
| `speed` | Lightning | `#fff200` | Faster, double points | 8 | positive |
| `slowmo` | Hourglass | `#22e6ff` | Slower, more time to react | 8 | positive |
| `rain` | Rain | `#2a6bff` | Rain blurs your vision | 10 | negative |
| `mushroom` | Mushroom | `#ff4fd8` | Waves and color shift | 10 | negative |
| `tumble` | Dice | `#9b4dff` | The board tilts and spins | 8 | negative |
| `mirror` | Mirror | `#ffffff` | Controls mirrored | 8 | negative |
| `ghost` | Ghost | `#5dff8a` | Snake turns semi-transparent | 8 | positive |
| `glitch` | Skull | `#ff7a1a` | Screen glitch, skull chaos | 8 | negative |
| `shrink` | Scissors | `#b44dff` | Shrink by 3 segments (instant), "fisheye" effect | 1.5 | positive |

Notes:
- `apple` has weight 0 and is never spawned randomly as a special. There is always one apple on the board (`ensureApple`).
- The Gold Apple stays on the board for 6 s, the other specials for 8 s (`lifetimeTicks`).
- The duration applies to the effect. The Scissors act instantly and additionally trigger a short fisheye effect.

## Skins

Available: `classic`, `rainbow`, `pumpkin`, `neon`, `lava`, `galaxy`. The skin is chosen in the menu and saved in localStorage. Skins are purely cosmetic and do not affect the simulation.

## Architecture

- `src/sim/`: game logic. Deterministic and tick-based (`step(state, inputs)` returns a new state). Contains items, effects, worlds/topology (`world.ts`), RNG, hash and state types.
- `src/net/`: transport layer (`transport.ts`, `LocalTransport` for single player). Multiplayer concept in `src/net/README.md`.
- `src/render/`: Three.js scene (grid, snakes, items, particles, skins, board shape `shape.ts`, snake path `path.ts`, 3D Space helpers `volume.ts`). `src/render/post/` contains the shader passes (`uberShader.ts`, `phosphorPass.ts`) and the PostProcessor.
- `src/input/`: keyboard (`keyboard.ts`) and touch swipes (`touch.ts`). Provides directions per tick.
- `src/ui/`: DOM overlay with menu, HUD, pause and game over screens. Texts in `texts.ts`, persistence in `store.ts`.
- `src/contracts.ts`: interfaces between `main.ts` and the modules (renderer, post, input, UI), plus the `SKINS` list.
- `src/main.ts`: game loop (fixed ticks, interpolation, frame sequence).

### Multiplayer roadmap

Multiplayer is not implemented yet. The planned approach (WebRTC DataChannel, lockstep with input delay or host-authoritative, signaling and TURN) is described in [`src/net/README.md`](src/net/README.md).

## Adding a new item

1. `src/sim/types.ts`: add the new ID to `ItemId`. For a new effect, also to `EffectId`.
2. `src/sim/items.ts`: add an entry to `ITEMS` (name, color, weight, effect, duration, polarity, growth, points, lifetime).
3. `src/sim/effects.ts`: for a new effect, extend `EFFECT_IDS` and `EFFECT_FADE`.
4. `src/render/items.ts`: add an entry to `builders` (a record over `ItemId`, so it is required). Optionally a spin in `SPIN`. Likewise `src/render/items2d.ts` (flat icon for 2D mode).
5. `src/ui/texts.ts`: `ITEM_DESCRIPTIONS` (required, since it is `Record<ItemId, string>`). Optionally `EFFECT_TOASTS`.
6. For a visual effect: wire up the intensity in `src/render/post/index.ts` or `uberShader.ts`.
7. Optional: a dev key in `DEV_KEYS` (`src/main.ts`).
8. Run `npm test` and `npm run build`.

## Adding a new skin

1. `src/render/skins.ts`: create a skin object with `id`, `colorAt`, `headColor`, `createHead` (optionally `segmentScale`, `headScale`, `createHead2D` for the flat head in 2D mode) and add it to the `for` loop at the end of the file that calls `registerSkin`.
2. `src/contracts.ts`: add the ID to the `SKINS` array. The menu picks it up automatically.
