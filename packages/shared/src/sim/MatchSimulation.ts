import type RAPIER from '@dimforge/rapier3d-compat';
import { DRAWING } from '../config/drawing';
import { ECONOMY } from '../config/economy';
import { NETWORK } from '../config/network';
import { FIXED_DT } from '../config/simulation';
import type { BlueprintId, Quality } from '../drawing/blueprint';
import { blueprintById } from '../drawing/blueprints/registry';
import {
  damage,
  isDestroyed,
  type DrawnObject,
  type DrawnStructure,
  type DrawnWeapon,
} from '../drawing/drawnObject';
import { spawnDrawnObject } from '../drawing/spawn';
import { chalkDebitFor, toDrawingResultOutcome, type DrawingResult } from '../drawing/result';
import type { Sketch } from '../drawing/types';
import { validateSketch } from '../drawing/validate';
import { quantizeSketch } from '../drawing/wire';
import { addDrawnCollider, removeDrawnCollider } from '../physics/drawnColliders';
import { createStaticWorld, type PhysicsWorld, type Rapier } from '../physics/staticWorld';
import type {
  DrawnObjectState,
  EquippedWeaponState,
  InputCommand,
} from '../protocol/messages';
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

/** Why a sketch was never graded. A refusal costs the player nothing. */
export type DrawingRefusal = 'unknown-player' | 'no-chalk' | 'rate-limited';

/**
 * Either a verdict to send back, or silence. The two are kept apart in the
 * type so a caller cannot send a refusal to the client by accident: a refused
 * submission is the authority declining to answer, not an outcome.
 */
export type DrawingSubmissionResult =
  | { readonly kind: 'resolved'; readonly result: DrawingResult }
  | { readonly kind: 'refused'; readonly reason: DrawingRefusal };

/** A client's claim about its own sketch that the authority disagreed with. */
export interface HintDisagreement {
  readonly hint: BlueprintId | undefined;
  readonly recognized: BlueprintId | undefined;
}

/** Ticks between two accepted submissions from one player. */
const SUBMIT_INTERVAL_TICKS = Math.ceil(DRAWING.minSubmitIntervalMs / 1000 / FIXED_DT);

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
  /** Authoritative chalk meter; changes through `interact` and `submitDrawing`. */
  chalk: number;
  /** Tick of the last *accepted* drawing, for rate limiting. */
  lastDrawingTick: number;
  /**
   * Yaw of the newest command applied. Placement needs the facing the
   * authority believes in, not one the client asserts at submission time.
   */
  yaw: number;
  /**
   * The one weapon in the player's hands (SPEC §6.8). Weapons never enter
   * the inventory: putting a step between the drawing and the holding would
   * waste the moment the whole design is built around.
   */
  equipped: DrawnWeapon | undefined;
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
  /**
   * Structures drawn into the world. They are keyed by id and outlive the
   * players who drew them (SPEC §7.4) — a wall is the world's, not its
   * author's, which is where the contested play comes from.
   */
  private readonly structures = new Map<number, DrawnStructure>();
  /** Each structure's collider, so it can be taken back out again. */
  private readonly structureColliders = new Map<number, RAPIER.Collider>();
  private nextObjectId = 1;

  /**
   * Submissions whose client-side hint named something other than what the
   * authority recognized. Nothing depends on it, and it never changes an
   * outcome — it is the cheapest signal that the two validators have drifted
   * apart, which under inference is the failure that matters most.
   */
  hintDisagreements = 0;
  lastHintDisagreement: HintDisagreement | undefined;

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
      lastDrawingTick: Number.NEGATIVE_INFINITY,
      yaw: 0,
      equipped: undefined,
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
  /** Every structure standing in the world right now. */
  drawnObjects(): readonly DrawnStructure[] {
    return [...this.structures.values()];
  }

  /**
   * The same structures as the wire carries them. Size is left out because it
   * follows from the blueprint, and the drawer because a structure belongs to
   * the world (SPEC §7.4).
   */
  drawnObjectStates(): DrawnObjectState[] {
    return [...this.structures.values()].map((object) => ({
      id: object.id,
      blueprintId: object.blueprintId,
      quality: object.quality,
      position: object.transform.position,
      yaw: object.transform.yaw,
      solidFromTick: object.solidFromTick,
      health: object.health,
    }));
  }

  /**
   * Damages a structure, destroying it when its health runs out (RD-07).
   *
   * There is deliberately **no attacker argument**. A structure belongs to
   * the world, not to whoever drew it, so any player may break any wall — and
   * with nothing here to consult, ownership cannot creep in later by
   * accident. Phase 5 supplies the blows; this is the arithmetic they will
   * land on.
   */
  damageDrawnObject(id: number, amount: number): 'damaged' | 'destroyed' | 'missing' {
    const structure = this.structures.get(id);
    if (!structure) return 'missing';
    damage(structure, amount);
    if (!isDestroyed(structure)) return 'damaged';
    this.removeDrawnObject(id);
    return 'destroyed';
  }

  /**
   * Takes a structure out of the world, collider and all. Returns false for
   * one that is not there, which is the ordinary case when two hits land on
   * the same wall in the same tick rather than anything exceptional.
   */
  removeDrawnObject(id: number): boolean {
    const collider = this.structureColliders.get(id);
    if (collider) removeDrawnCollider(this.world, collider);
    this.structureColliders.delete(id);
    return this.structures.delete(id);
  }

  /** What `id` is holding, if anything. */
  equipped(id: PlayerId): DrawnWeapon | undefined {
    return this.players.get(id)?.equipped;
  }

  /** The same weapon as the wire carries it. */
  equippedState(id: PlayerId): EquippedWeaponState | undefined {
    const weapon = this.players.get(id)?.equipped;
    if (!weapon) return undefined;
    return {
      blueprintId: weapon.blueprintId,
      quality: weapon.quality,
      durability: weapon.durability,
      maxDurability: weapon.maxDurability,
    };
  }

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
   * Grades a submitted sketch and charges for it (SPEC §6.2, §6.6).
   *
   * The strokes decide everything. `hint` is the client's own guess, kept
   * only so a disagreement can be counted: letting it reach the classifier
   * would hand a client the power to name what it drew, which is the whole
   * thing server authority exists to prevent.
   *
   * The sketch is quantized before grading, so a submission reaching the
   * authority directly is judged on exactly the same numbers as one that
   * came over the wire.
   */
  submitDrawing(id: PlayerId, sketch: Sketch, hint?: BlueprintId): DrawingSubmissionResult {
    const player = this.players.get(id);
    if (!player) return { kind: 'refused', reason: 'unknown-player' };
    // Drawing needs chalk in hand (plan decision 2); with none there is
    // nothing to charge and nothing to say.
    if (player.chalk <= 0) return { kind: 'refused', reason: 'no-chalk' };
    if (this.currentTick - player.lastDrawingTick < SUBMIT_INTERVAL_TICKS) {
      return { kind: 'refused', reason: 'rate-limited' };
    }
    player.lastDrawingTick = this.currentTick;

    const outcome = toDrawingResultOutcome(
      validateSketch(quantizeSketch(sketch), { heldChalk: player.chalk }),
    );
    // An absent hint is itself a claim — "I could not read it either" — so a
    // sketch the authority recognized and the client did not is a disagreement.
    const recognized = 'blueprintId' in outcome ? outcome.blueprintId : undefined;
    if (hint !== recognized) {
      this.hintDisagreements++;
      this.lastHintDisagreement = { hint, recognized };
    }

    const chalkDebited = chalkDebitFor(outcome, player.chalk);
    player.chalk -= chalkDebited;
    // Debit first, then build: cost is a property of what was recognized, so
    // it cannot be known any earlier, and there is never a refund path.
    if (outcome.kind === 'created') this.build(id, player, outcome.blueprintId, outcome);
    return { kind: 'resolved', result: { outcome, chalkDebited } };
  }

  /**
   * Turns a `created` outcome into a thing in the world or in a hand. Nothing
   * here can fail: placement never refuses (plan decision 1), because the
   * chalk is already spent by the time it runs.
   */
  private build(
    id: PlayerId,
    player: SimPlayer,
    blueprintId: BlueprintId,
    grade: { readonly quality: Quality; readonly accuracy: number },
  ): DrawnObject | undefined {
    const blueprint = blueprintById(blueprintId);
    if (!blueprint) return undefined;

    const object = spawnDrawnObject(
      blueprint,
      { quality: grade.quality, accuracy: grade.accuracy },
      {
        id: this.nextObjectId++,
        tick: this.currentTick,
        playerId: id,
        feet: player.state.position,
        yaw: player.yaw,
      },
    );

    if (object.kind === 'structure') {
      this.structures.set(object.id, object);
      this.structureColliders.set(object.id, addDrawnCollider(this.rapier, this.world, object));
    }
    // One pair of hands, one sword (plan decision 5). The replaced weapon is
    // destroyed rather than dropped: dropping needs a world-item form that
    // nothing else in the MVP wants yet.
    else player.equipped = object;
    return object;
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
        player.yaw = command.yaw;
        player.lastProcessedSeq = command.seq;
      }
    }
  }

  /** Releases the physics world. The simulation is unusable afterwards. */
  dispose(): void {
    this.world.free();
  }
}
