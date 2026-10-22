import type { InputCommand, PlayerId } from '../sim/types';

/** Messages exchanged between peers. Kept small and JSON-serialisable. */
export type NetMessage =
  | { type: 'input'; cmd: InputCommand }
  | { type: 'hello'; playerId: PlayerId; skinId: string }
  | { type: 'start'; seed: number; players: { id: PlayerId; skinId: string }[] }
  | { type: 'hash'; tick: number; hash: string };

export type MessageHandler = (msg: NetMessage, from: PlayerId) => void;

/**
 * Abstract message channel. Singleplayer uses LocalTransport (loopback);
 * a later WebRtcTransport implements the same interface over an RTCDataChannel.
 */
export interface Transport {
  readonly localPlayerId: PlayerId;
  /** Broadcasts to all peers, including the local peer (loopback), so everyone processes the same stream. */
  send(msg: NetMessage): void;
  /** Subscribes to incoming messages; returns an unsubscribe function. */
  onMessage(handler: MessageHandler): () => void;
  close(): void;
}

/** Synchronous in-process loopback. */
export class LocalTransport implements Transport {
  private handlers = new Set<MessageHandler>();
  private closed = false;

  constructor(readonly localPlayerId: PlayerId) {}

  send(msg: NetMessage): void {
    if (this.closed) return;
    for (const h of [...this.handlers]) h(msg, this.localPlayerId);
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  close(): void {
    this.closed = true;
    this.handlers.clear();
  }
}
