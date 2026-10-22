# Snake3D

Browser-Snake in 3D, gebaut mit Vite, TypeScript und Three.js. Der Hintergrund ist reines Schwarz (`#000`, OLED-freundlich). Farbig sind nur die Schlangen und die Items. Das Spielfeld ist ein Raster mit grauen Linien. Screen-Effekte (Speed-Blur, Glitch, Fisheye, Regen-Refraktion u. a.) laufen als Shader-Pässe über den EffectComposer.

## Start

```bash
npm install
npm run dev      # Entwicklungsserver (Vite)
npm test         # Simulations-Tests (Vitest)
npm run build    # Typecheck (tsc --noEmit) + Produktions-Build (vite build)
```

Weitere Skripte: `npm run typecheck`, `npm run preview`.

## Steuerung

| Aktion | Eingabe |
| --- | --- |
| Richtung | `W` `A` `S` `D` oder Pfeiltasten; auf Touch-Geräten wischen |
| Pause / weiter | `Esc` oder `P` |
| Neustart (nach Game Over) | `R` oder `Enter` |
| Dev-Items (nur `npm run dev`) | Ziffern `1`–`0`, siehe unten |

Dev-Zuordnung (`DEV_KEYS` in `src/main.ts`), wirkt auf den lokalen Spieler, nur wenn `import.meta.env.DEV` gesetzt ist:

| Taste | Item | Taste | Item |
| --- | --- | --- | --- |
| `1` | Goldapfel | `6` | Würfel |
| `2` | Blitz | `7` | Spiegel |
| `3` | Sanduhr | `8` | Geist |
| `4` | Regen | `9` | Totenkopf |
| `5` | Pilz | `0` | Schere |

## Items

Dauer = `durationTicks / TICK_HZ` (TICK_HZ = 60). Die Tabelle zeigt die Werte aus `src/sim/items.ts`; die Wirkung stammt aus `ITEM_DESCRIPTIONS` in `src/ui/texts.ts`.

| Item | Name | Farbe | Wirkung | Dauer (s) | Polarität |
| --- | --- | --- | --- | --- | --- |
| `apple` | Apfel | `#ff2a2a` | Wächst um 1, +10 Punkte | – (kein Effekt) | positiv |
| `goldapple` | Goldapfel | `#ffc61a` | Wächst um 3, +50 Punkte, goldener Blitz | 0,75 | positiv |
| `speed` | Blitz | `#fff200` | Schneller, doppelte Punkte | 8 | positiv |
| `slowmo` | Sanduhr | `#22e6ff` | Langsamer, mehr Zeit zum Reagieren | 8 | positiv |
| `rain` | Regen | `#2a6bff` | Regen trübt die Sicht | 10 | negativ |
| `mushroom` | Pilz | `#ff4fd8` | Wellen und Farbverschiebung | 10 | negativ |
| `tumble` | Würfel | `#9b4dff` | Das Spielfeld kippt und dreht sich | 8 | negativ |
| `mirror` | Spiegel | `#ffffff` | Steuerung seitenverkehrt | 8 | negativ |
| `ghost` | Geist | `#5dff8a` | Schlange halb durchsichtig | 8 | positiv |
| `glitch` | Totenkopf | `#ff7a1a` | Bildstörung, Totenkopf-Chaos | 8 | negativ |
| `shrink` | Schere | `#b44dff` | Verkürzt um 3 Segmente (sofort), Effekt "fisheye" | 1,5 | positiv |

Hinweise:
- `apple` hat Gewicht 0 und wird nicht zufällig als Special gespawnt. Es gibt immer einen Apfel auf dem Feld (`ensureApple`).
- Goldapfel bleibt 6 s auf dem Feld, die übrigen Specials 8 s (`lifetimeTicks`).
- Die Dauer gilt für den Effekt. Die Schere wirkt sofort und setzt zusätzlich einen kurzen Fisheye-Effekt.

## Skins

Verfügbar: `classic`, `rainbow`, `pumpkin`, `neon`, `lava`, `galaxy`. Die Auswahl erfolgt im Menü und wird im localStorage gespeichert. Skins sind rein kosmetisch und beeinflussen die Simulation nicht.

## Architektur

- `src/sim/`: Spiellogik. Deterministisch und Tick-basiert (`step(state, inputs)` liefert einen neuen State). Enthält Items, Effekte, RNG, Hash und Zustandstypen.
- `src/net/`: Transport-Schicht (`transport.ts`, `LocalTransport` für Singleplayer). Konzept für Multiplayer siehe `src/net/README.md`.
- `src/render/`: Three.js-Szene (Grid, Schlangen, Items, Partikel, Skins). `src/render/post/` enthält die Shader-Pässe (`uberShader.ts`, `phosphorPass.ts`) und den PostProcessor.
- `src/input/`: Tastatur (`keyboard.ts`) und Touch-Wischen (`touch.ts`). Liefert Richtungen pro Tick.
- `src/ui/`: DOM-Overlay mit Menü, HUD, Pause- und Game-Over-Screen. Texte in `texts.ts`, Persistenz in `store.ts`.
- `src/contracts.ts`: Schnittstellen zwischen `main.ts` und den Modulen (Renderer, Post, Input, UI), außerdem die Liste `SKINS`.
- `src/main.ts`: Spielschleife (feste Ticks, Interpolation, Frame-Ablauf).

### Multiplayer-Roadmap

Multiplayer ist noch nicht implementiert. Das geplante Vorgehen (WebRTC DataChannel, Lockstep mit Input-Delay oder Host-autoritativ, Signalisierung und TURN) steht in [`src/net/README.md`](src/net/README.md).

## Neues Item ergänzen

1. `src/sim/types.ts`: `ItemId` um die neue ID erweitern. Bei einem neuen Effekt zusätzlich `EffectId`.
2. `src/sim/items.ts`: Eintrag in `ITEMS` (Name, Farbe, Gewicht, Effekt, Dauer, Polarität, Wachstum, Punkte, Lebensdauer).
3. `src/sim/effects.ts`: Bei neuem Effekt `EFFECT_IDS` und `EFFECT_FADE` ergänzen.
4. `src/render/items.ts`: Eintrag in `builders` (Record über `ItemId`, daher Pflicht). Optional Drehung in `SPIN`.
5. `src/ui/texts.ts`: `ITEM_DESCRIPTIONS` (Pflicht, da `Record<ItemId, string>`). Optional `EFFECT_TOASTS`.
6. Bei visuellem Effekt: Intensität in `src/render/post/index.ts` bzw. `uberShader.ts` anbinden.
7. Optional: Dev-Taste in `DEV_KEYS` (`src/main.ts`).
8. `npm test` und `npm run build` ausführen.

## Neuen Skin ergänzen

1. `src/render/skins.ts`: Skin-Objekt mit `id`, `colorAt`, `headColor`, `createHead` (optional `segmentScale`, `headScale`) anlegen und in die `for`-Schleife am Dateiende aufnehmen, die `registerSkin` aufruft.
2. `src/contracts.ts`: Die ID in das Array `SKINS` eintragen. Das Menü übernimmt sie automatisch.
