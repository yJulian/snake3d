# Netzwerk – Konzept (noch nicht implementiert)

Die Simulation (`src/sim`) ist deterministisch: gleicher Seed + gleiche `InputCommand`s
in gleicher Tick-Zuordnung ⇒ bitidentischer `GameState` (prüfbar mit `hashState`).
Darauf baut Multiplayer auf. Alles Netzwerk läuft über das `Transport`-Interface
(`transport.ts`); Singleplayer nutzt `LocalTransport` (Loopback), sodass der Input-Pfad
`InputSource → Transport → Input-Puffer → step()` schon heute derselbe ist.

## Transport: WebRTC DataChannel
- `WebRtcTransport implements Transport` – ein `RTCPeerConnection` pro Peer (2–4 Spieler: Mesh, sonst Host-Stern).
- DataChannel `{ ordered: true }` (Inputs müssen vollständig und geordnet ankommen; Datenmenge winzig).
- ICE-Konfiguration aus Vite-Env, nie hartkodiert:
  ```
  VITE_STUN_URL=stun:stun.example.org:3478
  VITE_TURN_URL=turn:turn.example.org:3478?transport=udp
  VITE_TURN_USER=...
  VITE_TURN_CREDENTIAL=...      # besser: kurzlebige Credentials vom Signal-Server (TURN REST API)
  ```
  → `new RTCPeerConnection({ iceServers: [{ urls: STUN }, { urls: TURN, username, credential }] })`.
  TURN ist nötig für symmetrische NATs / Mobilfunk; z.B. eigener coturn.

## Signalisierung
WebRTC braucht einen Kanal zum Austausch von SDP-Offer/Answer und ICE-Kandidaten.
Minimal: kleiner WebSocket-Server mit Räumen (`join(roomCode)`, Weiterleiten von
`offer/answer/candidate`). Danach ist der Server nicht mehr beteiligt. Alternative ohne
Server: Copy/Paste bzw. QR-Code des SDP (nur für Tests).

## Synchronisation
### Variante A: Lockstep mit Input-Delay (bevorzugt)
- Lokaler Input bei Tick `T` wird als `{playerId, tick: T + D, dir}` gesendet (D ≈ 3–6 Ticks bei 60 Hz ≈ 50–100 ms).
- Ein Tick `T` wird erst simuliert, wenn von **allen** Peers bekannt ist, ob sie für `T` Inputs haben.
  Dafür sendet jeder Peer pro Tick (gebündelt) entweder seine Inputs oder ein leeres „ack bis Tick X“
  (NetMessage-Erweiterung `{type:'tickAck', upTo}`).
- Fehlt etwas → Simulation pausiert (Stall), Render interpoliert weiter.
- Regelmäßig `{type:'hash', tick, hash}` austauschen → Desync-Erkennung.
- Start: Host sendet `{type:'start', seed, players}`; alle erzeugen `createInitialState` identisch.
- Vorteil: minimale Bandbreite, Sim bleibt unverändert. Nachteil: Latenz = Input-Delay, langsamster Peer bestimmt Tempo.
- Optional später: Rollback (State-Snapshots sind dank JSON-State trivial; `step` ist rein).

### Variante B: Host-autoritativ
- Host simuliert allein, Clients senden nur Inputs; Host broadcastet State-Snapshots/Deltas (z.B. jede Bewegung).
- Clients rendern den letzten Snapshot (Interpolation) – kein Determinismus nötig, aber mehr Bandbreite
  und Host-Vorteil. Sinnvoll als Fallback oder bei >4 Spielern.

## Nicht-Netzwerk-Teile
- Dev-Helfer (`devApplyItem`, `devSpawnItemAt`) laufen nur lokal und werden nie übertragen.
- Highscores/Skins bleiben lokal; `skinId` reist im `hello`/`start`, ist aber nur kosmetisch.
