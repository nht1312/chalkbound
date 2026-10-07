import { TICKS_PER_SNAPSHOT } from '../config/simulation';
import type { Transport } from '../net/transport';
import { decodeClientMessage, encodeServerMessage, ProtocolError } from '../protocol/codec';
import type { ClientMessage, ServerMessage } from '../protocol/messages';
import type { MatchSimulation, PlayerId } from './MatchSimulation';

/**
 * Connects transports to a {@link MatchSimulation}: decodes client intent,
 * feeds it to the simulation, and broadcasts authoritative snapshots. This is
 * the authority's socket layer for loopback play (ARCHITECTURE D-01).
 */
export class SimulationHost {
  private readonly connections = new Map<
    PlayerId,
    { transport: Transport; unsubscribe: () => void }
  >();
  private nextPlayerId = 1;
  /** Malformed messages received and dropped. */
  protocolErrors = 0;

  constructor(private readonly sim: MatchSimulation) {}

  connect(transport: Transport): PlayerId {
    const id = this.nextPlayerId++;
    this.sim.addPlayer(id);
    const unsubscribe = transport.onMessage((data) => this.receive(id, transport, data));
    this.connections.set(id, { transport, unsubscribe });
    return id;
  }

  disconnect(id: PlayerId): void {
    this.connections.get(id)?.unsubscribe();
    this.connections.delete(id);
    this.sim.removePlayer(id);
  }

  /** Runs one authoritative tick and broadcasts a snapshot on the snapshot cadence. */
  step(): void {
    this.sim.step();
    if (this.sim.tick % TICKS_PER_SNAPSHOT !== 0) return;

    for (const [id, { transport }] of this.connections) {
      this.send(transport, {
        type: 'snapshot',
        serverTick: this.sim.tick,
        lastProcessedSeq: this.sim.lastProcessedSeq(id),
      });
    }
  }

  private receive(id: PlayerId, transport: Transport, data: Uint8Array): void {
    let message: ClientMessage;
    try {
      message = decodeClientMessage(data);
    } catch (error) {
      if (!(error instanceof ProtocolError)) throw error;
      this.protocolErrors++;
      return;
    }

    switch (message.type) {
      case 'inputBatch':
        this.sim.submitInputs(id, message.commands);
        break;
      case 'ping':
        this.send(transport, {
          type: 'pong',
          id: message.id,
          clientTime: message.clientTime,
          serverTick: this.sim.tick,
        });
        break;
    }
  }

  private send(transport: Transport, message: ServerMessage): void {
    transport.send(encodeServerMessage(message), 'unreliable');
  }
}
