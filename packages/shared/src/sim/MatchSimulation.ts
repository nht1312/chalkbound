import { NETWORK } from '../config/network';
import type { InputCommand } from '../protocol/messages';

export type PlayerId = number;

interface PlayerInputState {
  /** Highest seq applied by the simulation; 0 means none yet. */
  lastProcessedSeq: number;
  /** Commands accepted but not yet applied, ascending by seq. */
  readonly queue: InputCommand[];
}

/**
 * The authoritative fixed-step simulation. Plain TypeScript with no renderer,
 * socket, or framework types, so it runs unchanged in the browser (loopback),
 * on the server, and in unit tests.
 *
 * Phase 0 only tracks ticks and input acknowledgement. Phase 1 applies each
 * command through the shared `stepPlayer()`.
 */
export class MatchSimulation {
  private currentTick = 0;
  private readonly players = new Map<PlayerId, PlayerInputState>();

  get tick(): number {
    return this.currentTick;
  }

  addPlayer(id: PlayerId): void {
    if (!this.players.has(id)) this.players.set(id, { lastProcessedSeq: 0, queue: [] });
  }

  removePlayer(id: PlayerId): void {
    this.players.delete(id);
  }

  /**
   * Accepts commands newer than any seen before. Commands are resent until
   * acknowledged, so duplicates and stale seqs are expected and ignored.
   */
  submitInputs(id: PlayerId, commands: readonly InputCommand[]): void {
    const player = this.players.get(id);
    if (!player) return;

    let newest = player.queue.at(-1)?.seq ?? player.lastProcessedSeq;
    for (const command of [...commands].sort((a, b) => a.seq - b.seq)) {
      if (command.seq <= newest) continue;
      player.queue.push(command);
      newest = command.seq;
    }

    const overflow = player.queue.length - NETWORK.maxQueuedInputs;
    if (overflow > 0) player.queue.splice(0, overflow);
  }

  lastProcessedSeq(id: PlayerId): number {
    return this.players.get(id)?.lastProcessedSeq ?? 0;
  }

  step(): void {
    this.currentTick++;
    for (const player of this.players.values()) {
      for (let i = 0; i < NETWORK.maxInputsPerTick; i++) {
        const command = player.queue.shift();
        if (!command) break;
        player.lastProcessedSeq = command.seq;
      }
    }
  }
}
