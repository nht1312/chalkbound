import {
  decodeServerMessage,
  encodeClientMessage,
  NETWORK,
  ProtocolError,
  type InputCommand,
  type PlayerState,
  type Scheduler,
  type ServerMessage,
  type Transport,
} from '@chalkbound/shared';

/** Upper bound of the u16 ping id on the wire. */
const PING_ID_RANGE = 65536;

/**
 * Client end of the authority connection: sends input commands (resending
 * until acknowledged), measures round-trip time, and tracks the newest
 * authoritative tick. Holds no gameplay state of its own.
 */
export class NetClient {
  /** Smoothed round-trip time in ms, once the first pong has arrived. */
  rttMs: number | undefined;
  /** Newest authoritative tick seen in any server message. */
  serverTick = 0;
  /** Highest input seq the authority has confirmed applying. */
  lastAckedSeq = 0;
  /** The local player's state as of `lastAckedSeq`, from the newest snapshot. */
  authoritativePlayer: PlayerState | undefined;
  protocolErrors = 0;

  private unacked: InputCommand[] = [];
  private nextSeq = 1;
  private nextPingId = 0;
  private lastPingAt = -Infinity;

  constructor(
    readonly transport: Transport,
    private readonly scheduler: Scheduler,
  ) {
    transport.onMessage((data) => this.receive(data));
  }

  get unackedCount(): number {
    return this.unacked.length;
  }

  /** Reserves the next input sequence number. */
  takeInputSeq(): number {
    return this.nextSeq++;
  }

  /** Queues a command and sends it together with the newest unacknowledged ones. */
  sendInput(command: InputCommand): void {
    this.unacked.push(command);
    const overflow = this.unacked.length - NETWORK.maxQueuedInputs;
    if (overflow > 0) this.unacked.splice(0, overflow);

    const batch = this.unacked.slice(-NETWORK.maxInputBatch);
    this.transport.send(encodeClientMessage({ type: 'inputBatch', commands: batch }), 'unreliable');
  }

  /** Call once per frame; sends a ping on the configured cadence. */
  update(): void {
    const now = this.scheduler.now();
    if (now - this.lastPingAt < NETWORK.pingIntervalMs) return;
    this.lastPingAt = now;
    const id = this.nextPingId;
    this.nextPingId = (this.nextPingId + 1) % PING_ID_RANGE;
    this.transport.send(encodeClientMessage({ type: 'ping', id, clientTime: now }), 'unreliable');
  }

  private receive(data: Uint8Array): void {
    let message: ServerMessage;
    try {
      message = decodeServerMessage(data);
    } catch (error) {
      if (!(error instanceof ProtocolError)) throw error;
      this.protocolErrors++;
      return;
    }

    this.serverTick = Math.max(this.serverTick, message.serverTick);
    switch (message.type) {
      case 'pong': {
        const sample = this.scheduler.now() - message.clientTime;
        this.rttMs =
          this.rttMs === undefined
            ? sample
            : this.rttMs + (sample - this.rttMs) * NETWORK.rttSmoothing;
        break;
      }
      case 'snapshot':
        // Unreliable snapshots may arrive out of order: keep only the newest.
        if (message.lastProcessedSeq >= this.lastAckedSeq) {
          this.lastAckedSeq = message.lastProcessedSeq;
          this.authoritativePlayer = message.player;
          this.unacked = this.unacked.filter((c) => c.seq > this.lastAckedSeq);
        }
        break;
    }
  }
}
