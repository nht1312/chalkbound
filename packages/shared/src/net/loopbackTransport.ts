import {
  createTransportStats,
  type Reliability,
  type Transport,
  type TransportStats,
} from './transport';

/** Simulated network conditions, applied independently in each direction. */
export interface LinkConditions {
  /** One-way base latency in milliseconds. */
  readonly latencyMs: number;
  /** Uniform random jitter added to latency, ± this many milliseconds. */
  readonly jitterMs: number;
  /** Probability in [0, 1] that an unreliable message is lost. */
  readonly lossRate: number;
}

export const PERFECT_LINK: LinkConditions = { latencyMs: 0, jitterMs: 0, lossRate: 0 };

/** Time source and timer, injectable so tests run deterministically. */
export interface Scheduler {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): void;
}

export interface LoopbackOptions {
  readonly conditions?: LinkConditions;
  /** Supplied by the host environment (browser, Node, or a test clock). */
  readonly scheduler: Scheduler;
  /** Random source in [0, 1) for loss and jitter. */
  readonly random?: () => number;
}

/**
 * Creates two connected in-process transport ends: `[client, server]`.
 * Reliable messages are never lost and arrive in send order; unreliable
 * messages may be dropped and, under jitter, reordered — like a real link.
 */
export function createLoopbackPair(options: LoopbackOptions): [Transport, Transport] {
  const conditions = options.conditions ?? PERFECT_LINK;
  const { scheduler } = options;
  const random = options.random ?? Math.random;

  const a = new LoopbackEnd(conditions, scheduler, random);
  const b = new LoopbackEnd(conditions, scheduler, random);
  a.peer = b;
  b.peer = a;
  return [a, b];
}

class LoopbackEnd implements Transport {
  peer: LoopbackEnd | undefined;
  readonly stats: TransportStats = createTransportStats();
  private readonly handlers = new Set<(data: Uint8Array) => void>();
  private lastReliableDeliveryAt = -Infinity;
  private closed = false;

  constructor(
    private readonly conditions: LinkConditions,
    private readonly scheduler: Scheduler,
    private readonly random: () => number,
  ) {}

  send(data: Uint8Array, reliability: Reliability): void {
    const peer = this.peer;
    if (this.closed || !peer) return;

    this.stats.messagesSent++;
    this.stats.bytesSent += data.byteLength;

    if (reliability === 'unreliable' && this.random() < this.conditions.lossRate) {
      this.stats.messagesDropped++;
      return;
    }

    const now = this.scheduler.now();
    const jitter = (this.random() * 2 - 1) * this.conditions.jitterMs;
    let deliverAt = now + Math.max(0, this.conditions.latencyMs + jitter);
    if (reliability === 'reliable') {
      // Reliable streams are ordered: never overtake an earlier reliable message.
      deliverAt = Math.max(deliverAt, this.lastReliableDeliveryAt);
      this.lastReliableDeliveryAt = deliverAt;
    }

    // Copy so the sender can reuse its buffer, as with a real socket.
    const copy = data.slice();
    this.scheduler.setTimeout(() => peer.deliver(copy), deliverAt - now);
  }

  onMessage(handler: (data: Uint8Array) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  close(): void {
    this.closed = true;
    this.handlers.clear();
  }

  private deliver(data: Uint8Array): void {
    if (this.closed) return;
    this.stats.messagesReceived++;
    this.stats.bytesReceived += data.byteLength;
    for (const handler of this.handlers) handler(data);
  }
}
