import { NETWORK } from '../config/network';
import { FIXED_DT } from '../config/simulation';
import { createStaticWorld, type PhysicsWorld, type Rapier } from '../physics/staticWorld';
import type { InputCommand } from '../protocol/messages';
import type { LevelData } from '../world/greyboxRoom';
import {
  createPlayerBody,
  initialPlayerState,
  stepPlayer,
  type PlayerBody,
  type PlayerState,
} from './stepPlayer';

export type PlayerId = number;

interface SimPlayer {
  readonly body: PlayerBody;
  state: PlayerState;
  /** Highest seq applied by the simulation; 0 means none yet. */
  lastProcessedSeq: number;
  /** Commands accepted but not yet applied, ascending by seq. */
  readonly queue: InputCommand[];
}

/**
 * The authoritative fixed-step simulation and the world of record. Plain
 * TypeScript with no renderer, socket, or framework types, so it runs
 * unchanged in the browser (loopback), on the server, and in unit tests.
 *
 * Each player advances by exactly one `stepPlayer()` per applied command, so
 * a client replaying the same commands reproduces the same movement. A player
 * with no pending command does not move that tick.
 */
export class MatchSimulation {
  private currentTick = 0;
  private readonly players = new Map<PlayerId, SimPlayer>();
  private readonly world: PhysicsWorld;

  constructor(
    private readonly rapier: Rapier,
    private readonly level: LevelData,
  ) {
    this.world = createStaticWorld(rapier, level.boxes);
  }

  get tick(): number {
    return this.currentTick;
  }

  addPlayer(id: PlayerId): void {
    if (this.players.has(id)) return;
    this.players.set(id, {
      body: createPlayerBody(this.rapier, this.world),
      state: initialPlayerState(this.level.spawn),
      lastProcessedSeq: 0,
      queue: [],
    });
  }

  removePlayer(id: PlayerId): void {
    const player = this.players.get(id);
    if (!player) return;
    this.world.removeCharacterController(player.body.controller);
    this.world.removeCollider(player.body.collider, false);
    this.players.delete(id);
  }

  playerState(id: PlayerId): PlayerState | undefined {
    return this.players.get(id)?.state;
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
        player.state = stepPlayer(player.state, command, player.body, this.world, FIXED_DT);
        player.lastProcessedSeq = command.seq;
      }
    }
  }

  /** Releases the physics world. The simulation is unusable afterwards. */
  dispose(): void {
    this.world.free();
  }
}
