import {
  decodeServerMessage,
  encodeClientMessage,
  NETWORK,
  ProtocolError,
  quantizeSketch,
  type BlueprintId,
  type DrawingResult,
  type InputCommand,
  type PlayerState,
  type Scheduler,
  type ServerMessage,
  type Sketch,
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
  /** Increments whenever `authoritativePlayer` is replaced; poll it to detect new snapshots. */
  snapshotCount = 0;
  /** The local player's authoritative chalk meter; undefined until the first snapshot. */
  chalk: number | undefined;
  /** Authoritative remaining chalk per box id. */
  chalkBoxes: ReadonlyMap<number, number> = new Map();
  /** The newest verdict on a submitted sketch; undefined until one arrives. */
  drawingResult: DrawingResult | undefined;
  /**
   * Increments on every verdict. Poll it rather than watching
   * `drawingResult`: drawing the same shape twice produces two identical
   * results, and the second one still deserves to be shown.
   */
  drawingResultCount = 0;

  private newestSnapshotTick = -1;
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

  /** Asks the authority to use a world object; the result arrives in a later snapshot. */
  sendInteract(targetId: number): void {
    this.transport.send(encodeClientMessage({ type: 'interact', targetId }), 'reliable');
  }

  /**
   * Submits a finished sketch. Reliable: a lost sketch costs the player the
   * chalk they were about to spend and tells them nothing.
   *
   * The sketch is quantized here so the caller's local preview and the
   * authority's verdict are computed from identical numbers. `hint` is what
   * the client's own validator made of it, and the authority uses it only to
   * count disagreements — it never changes the outcome.
   */
  sendDrawing(sketch: Sketch, hint?: BlueprintId): void {
    const quantized = quantizeSketch(sketch);
    this.transport.send(
      encodeClientMessage(
        hint === undefined
          ? { type: 'drawing', sketch: quantized }
          : { type: 'drawing', sketch: quantized, hint },
      ),
      'reliable',
    );
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

    // Not every message is tick-stamped: a drawing result answers a request,
    // it does not report the clock.
    if ('serverTick' in message) this.serverTick = Math.max(this.serverTick, message.serverTick);

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
        // Unreliable snapshots may arrive out of order. Order by server tick, not
        // by ack seq: an idle player's snapshots all share one seq.
        if (message.serverTick < this.newestSnapshotTick) break;
        this.newestSnapshotTick = message.serverTick;
        this.lastAckedSeq = message.lastProcessedSeq;
        this.authoritativePlayer = message.player;
        this.chalk = message.chalk;
        this.chalkBoxes = new Map(message.chalkBoxes.map((b) => [b.id, b.remaining]));
        this.snapshotCount++;
        this.unacked = this.unacked.filter((c) => c.seq > this.lastAckedSeq);
        break;
      case 'drawingResult':
        this.drawingResult = message.result;
        this.drawingResultCount++;
        break;
    }
  }
}
