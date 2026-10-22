# Networking – concept (not implemented yet)

The simulation (`src/sim`) is deterministic: same seed + same `InputCommand`s
at the same tick assignment ⇒ bit-identical `GameState` (verifiable with `hashState`).
Multiplayer builds on this. All networking goes through the `Transport` interface
(`transport.ts`); single player uses `LocalTransport` (loopback), so the input path
`InputSource → Transport → input buffer → step()` is already the same today.

## Transport: WebRTC DataChannel
- `WebRtcTransport implements Transport` – one `RTCPeerConnection` per peer (2–4 players: mesh, otherwise host star).
- DataChannel `{ ordered: true }` (inputs must arrive complete and in order; the data volume is tiny).
- ICE configuration from Vite env, never hard-coded:
  ```
  VITE_STUN_URL=stun:stun.example.org:3478
  VITE_TURN_URL=turn:turn.example.org:3478?transport=udp
  VITE_TURN_USER=...
  VITE_TURN_CREDENTIAL=...      # better: short-lived credentials from the signaling server (TURN REST API)
  ```
  → `new RTCPeerConnection({ iceServers: [{ urls: STUN }, { urls: TURN, username, credential }] })`.
  TURN is required for symmetric NATs / mobile networks; e.g. a self-hosted coturn.

## Signaling
WebRTC needs a channel to exchange the SDP offer/answer and ICE candidates.
Minimal: a small WebSocket server with rooms (`join(roomCode)`, relaying
`offer/answer/candidate`). After that the server is no longer involved. Serverless
alternative: copy/paste or a QR code of the SDP (for testing only).

## Synchronization
### Option A: lockstep with input delay (preferred)
- Local input at tick `T` is sent as `{playerId, tick: T + D, dir}` (D ≈ 3–6 ticks at 60 Hz ≈ 50–100 ms).
- A tick `T` is only simulated once it is known from **all** peers whether they have inputs for `T`.
  To that end every peer sends (batched) per tick either its inputs or an empty "ack up to tick X"
  (NetMessage extension `{type:'tickAck', upTo}`).
- Anything missing → the simulation pauses (stall), rendering keeps interpolating.
- Regularly exchange `{type:'hash', tick, hash}` → desync detection.
- Start: the host sends `{type:'start', seed, players}`; everyone runs `createInitialState` identically.
- Pro: minimal bandwidth, the sim stays unchanged. Con: latency = input delay, the slowest peer sets the pace.
- Optional later: rollback (state snapshots are trivial thanks to the JSON state; `step` is pure).

### Option B: host-authoritative
- The host simulates alone, clients only send inputs; the host broadcasts state snapshots/deltas (e.g. every move).
- Clients render the latest snapshot (interpolation) – no determinism required, but more bandwidth
  and a host advantage. Useful as a fallback or for >4 players.

## Non-network parts
- Dev helpers (`devApplyItem`, `devSpawnItemAt`) run locally only and are never transmitted.
- High scores/skins stay local; `skinId` travels in `hello`/`start` but is purely cosmetic.
