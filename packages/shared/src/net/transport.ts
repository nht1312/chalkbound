/**
 * Byte-level connection between a client and the authority. Phases 0–7 use
 * {@link createLoopbackPair}; Phase 8 adds a WebSocket implementation.
 */
export type Reliability = 'reliable' | 'unreliable';

export interface TransportStats {
  bytesSent: number;
  bytesReceived: number;
  messagesSent: number;
  messagesReceived: number;
  /** Messages lost to simulated (or real) packet loss on this end's sends. */
  messagesDropped: number;
}

export interface Transport {
  /** Sends one message. `unreliable` messages may be lost or reordered. */
  send(data: Uint8Array, reliability: Reliability): void;
  /** Registers a receive handler; returns an unsubscribe function. */
  onMessage(handler: (data: Uint8Array) => void): () => void;
  close(): void;
  readonly stats: Readonly<TransportStats>;
}

export function createTransportStats(): TransportStats {
  return {
    bytesSent: 0,
    bytesReceived: 0,
    messagesSent: 0,
    messagesReceived: 0,
    messagesDropped: 0,
  };
}
