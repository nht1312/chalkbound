import { COMBAT } from '../config/combat';
import { FIXED_DT } from '../config/simulation';
import { vec3, type Vec3 } from '../math/vec';

/**
 * One second of where everybody was (ARCHITECTURE §5.4, SPEC_AUDIT R-02).
 *
 * Melee under latency is only fair if the authority can test a swing against
 * the world the attacker was actually looking at. That means keeping the
 * recent past, and being strict about how far back anyone may reach: the
 * rewind is clamped, so a client claiming enormous latency cannot hit someone
 * where they stood a second ago.
 *
 * ARCHITECTURE §5.4 describes rewinding to an *interpolated* transform. This
 * records every tick instead (plan decision 4), which makes the lookup exact
 * and the interpolation unnecessary — 60 entries per player per second is
 * cheaper than the arithmetic it replaces.
 */

export interface RecordedTransform {
  /** The tick this pose was recorded on. */
  readonly tick: number;
  /** Feet position, as `PlayerState.position`. */
  readonly position: Vec3;
  /** Crouching players are shorter, and a hit test that forgot would miss low. */
  readonly crouching: boolean;
}

const TICKS_PER_SECOND = 1 / FIXED_DT;

/** How many ticks of history are kept per player. */
export const HISTORY_TICKS = Math.round(
  (COMBAT.lagCompensation.historyMs / 1000) * TICKS_PER_SECOND,
);

/** The furthest back any one attacker may reach, in ticks. */
export const MAX_REWIND_TICKS = Math.round(
  (COMBAT.lagCompensation.maxRewindMs / 1000) * TICKS_PER_SECOND,
);

/**
 * A fixed-size ring of poses, indexed by tick. Nothing allocates after
 * construction: this is written to by every player on every tick, and a
 * per-tick allocation here would be a garbage-collection pause in the middle
 * of a fight.
 */
export class TransformHistory {
  private readonly ticks = new Int32Array(HISTORY_TICKS).fill(-1);
  private readonly x = new Float64Array(HISTORY_TICKS);
  private readonly y = new Float64Array(HISTORY_TICKS);
  private readonly z = new Float64Array(HISTORY_TICKS);
  private readonly crouching = new Uint8Array(HISTORY_TICKS);
  private newestTick = -1;

  /** The newest tick recorded, or -1 when nothing has been. */
  get newest(): number {
    return this.newestTick;
  }

  /** The oldest tick still readable. */
  get oldest(): number {
    if (this.newestTick < 0) return -1;
    return Math.max(0, this.newestTick - (HISTORY_TICKS - 1));
  }

  record(tick: number, position: Vec3, crouching: boolean): void {
    const slot = this.slotOf(tick);
    this.ticks[slot] = tick;
    this.x[slot] = position.x;
    this.y[slot] = position.y;
    this.z[slot] = position.z;
    this.crouching[slot] = crouching ? 1 : 0;
    if (tick > this.newestTick) this.newestTick = tick;
  }

  /**
   * The pose at `tick`, clamped to what is still remembered: asking for the
   * future gives the present, and asking past the end of the buffer gives the
   * oldest pose rather than nothing. A caller that has to handle "too far
   * back" separately ends up inventing its own clamp, and two clamps is one
   * too many.
   */
  at(tick: number): RecordedTransform | undefined {
    if (this.newestTick < 0) return undefined;
    const clamped = Math.min(Math.max(Math.round(tick), this.oldest), this.newestTick);
    const slot = this.slotOf(clamped);
    if (this.ticks[slot] !== clamped) return undefined;
    return {
      tick: clamped,
      position: vec3(this.x[slot] as number, this.y[slot] as number, this.z[slot] as number),
      crouching: this.crouching[slot] === 1,
    };
  }

  /**
   * Where this player was, as far as an attacker at `currentTick` claiming to
   * have seen `claimedTick` is allowed to reach.
   *
   * The clamp is applied to the *measured* difference rather than to anything
   * the client says about itself, and it clamps forward as well as back: a
   * client naming a tick in the future gets the present, not a reward.
   */
  rewind(currentTick: number, claimedTick: number): RecordedTransform | undefined {
    return this.at(rewindTick(currentTick, claimedTick));
  }

  /** Forgets everything, as when a player respawns somewhere else entirely. */
  clear(): void {
    this.ticks.fill(-1);
    this.newestTick = -1;
  }

  private slotOf(tick: number): number {
    return ((tick % HISTORY_TICKS) + HISTORY_TICKS) % HISTORY_TICKS;
  }
}

/**
 * The tick a hit test runs at: the attacker's claim, bounded by the rewind
 * clamp on one side and by the present on the other.
 */
export function rewindTick(currentTick: number, claimedTick: number): number {
  if (!Number.isFinite(claimedTick)) return currentTick;
  const earliest = currentTick - MAX_REWIND_TICKS;
  return Math.min(Math.max(Math.round(claimedTick), earliest), currentTick);
}
