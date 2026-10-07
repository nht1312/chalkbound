import { ECONOMY } from '../config/economy';
import { NETWORK } from '../config/network';
import { FIXED_DT } from '../config/simulation';
import { createStaticWorld, type PhysicsWorld, type Rapier } from '../physics/staticWorld';
import type { InputCommand } from '../protocol/messages';
import type { ChalkBoxSpawn, LevelData } from '../world/greyboxRoom';
import { addChalk } from './chalk';
import { withinInteractRange } from './interaction';
import {
  createPlayerBody,
  initialPlayerState,
  stepPlayer,
  type PlayerBody,
  type PlayerState,
} from './stepPlayer';

export type PlayerId = number;

/** Why an interaction did or did not change anything. */
export type InteractOutcome =
  'picked-up' | 'meter-full' | 'empty' | 'out-of-range' | 'unknown-target' | 'unknown-player';

export interface InteractResult {
  readonly outcome: InteractOutcome;
  /** Chalk moved from the box into the player's meter. */
  readonly taken: number;
}

interface ChalkBox {
  readonly spawn: ChalkBoxSpawn;
  remaining: number;
}

interface SimPlayer {
  readonly body: PlayerBody;
  state: PlayerState;
  /** Highest seq applied by the simulation; 0 means none yet. */
  lastProcessedSeq: number;
  /** Commands accepted but not yet applied, ascending by seq. */
  readonly queue: InputCommand[];
  /** Authoritative chalk meter; changes only through `interact`. */
  chalk: number;
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
  private readonly chalkBoxes = new Map<number, ChalkBox>();

  constructor(
    private readonly rapier: Rapier,
    private readonly level: LevelData,
  ) {
    this.world = createStaticWorld(rapier, level.boxes);
    for (const spawn of level.chalkBoxes) {
      this.chalkBoxes.set(spawn.id, { spawn, remaining: spawn.amount ?? ECONOMY.chalk.perBox });
    }
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
      chalk: ECONOMY.chalk.starting,
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

  chalk(id: PlayerId): number | undefined {
    return this.players.get(id)?.chalk;
  }

  chalkBoxRemaining(boxId: number): number | undefined {
    return this.chalkBoxes.get(boxId)?.remaining;
  }

  /** Every chalk box and what it holds, in level order. */
  chalkBoxStates(): { readonly id: number; readonly remaining: number }[] {
    return [...this.chalkBoxes.values()].map((box) => ({
      id: box.spawn.id,
      remaining: box.remaining,
    }));
  }

  /**
   * Resolves a player's interaction intent against their authoritative
   * position. The client only names the target; whether it is in reach, has
   * anything left, and how much fits are all decided here.
   */
  interact(id: PlayerId, targetId: number): InteractResult {
    const player = this.players.get(id);
    if (!player) return { outcome: 'unknown-player', taken: 0 };
    const box = this.chalkBoxes.get(targetId);
    if (!box) return { outcome: 'unknown-target', taken: 0 };
    if (!withinInteractRange(player.state, box.spawn.position)) {
      return { outcome: 'out-of-range', taken: 0 };
    }
    if (box.remaining === 0) return { outcome: 'empty', taken: 0 };

    const { chalk, taken } = addChalk(player.chalk, box.remaining);
    if (taken === 0) return { outcome: 'meter-full', taken: 0 };
    player.chalk = chalk;
    box.remaining -= taken;
    return { outcome: 'picked-up', taken };
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
