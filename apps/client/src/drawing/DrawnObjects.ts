import {
  blueprintById,
  CREATION,
  placeStructure,
  type BlueprintId,
  type DrawnObjectState,
  type DrawnTransform,
  type Footprint,
  type Quality,
  type Vec3,
} from '@chalkbound/shared';

/**
 * The client's view of player-made geometry (SPEC_AUDIT R-03).
 *
 * Between releasing the stroke and the authority's verdict there is one round
 * trip in which this client knows what it drew and the world does not yet
 * agree. It shows a **ghost**: visible at once, so the drawing feels
 * immediate, and never collidable, so prediction cannot run against geometry
 * the authority has not confirmed. The glow and dust of §9 occupy exactly
 * that window, which is the latency mask the spec gives us for free.
 *
 * Nothing here decides anything. The authority's list is the truth, and this
 * reconciles against it — including adopting structures it never predicted,
 * because a structure belongs to the world rather than to whoever drew it
 * (SPEC §7.4).
 */

export interface GhostObject {
  readonly blueprintId: BlueprintId;
  readonly position: Vec3;
  readonly yaw: number;
  readonly halfExtents: Vec3;
}

export interface SolidObject {
  readonly id: number;
  readonly blueprintId: BlueprintId;
  readonly quality: Quality;
  readonly transform: DrawnTransform;
  readonly halfExtents: Vec3;
  readonly solidFromTick: number;
  health: number;
}

/** What changed in the last reconcile, so colliders are built and freed once each. */
export interface DrawnObjectDelta {
  readonly added: readonly SolidObject[];
  readonly removed: readonly number[];
}

/**
 * How each structure occupies the world, mirroring the authority's own table.
 * Both sides derive the shape from the blueprint rather than sending it, so a
 * wall is the same box in the same place on either side of the wire.
 */
const FOOTPRINTS: Partial<Record<BlueprintId, Footprint>> = {
  wall: {
    halfExtents: {
      x: CREATION.wall.width / 2,
      y: CREATION.wall.height / 2,
      z: CREATION.wall.thickness / 2,
    },
    gapM: CREATION.wall.gapM,
    standOn: false,
  },
  bridge: {
    halfExtents: {
      x: CREATION.bridge.width / 2,
      y: CREATION.bridge.thickness / 2,
      z: CREATION.bridge.span / 2,
    },
    gapM: CREATION.bridge.gapM,
    standOn: true,
  },
};

export class DrawnObjects {
  private readonly confirmed = new Map<number, SolidObject>();
  private pending: GhostObject | undefined;

  /**
   * Shows what this client believes it just drew. Called on submission, not
   * on the verdict: the whole point is to fill the round trip.
   */
  predict(blueprintId: BlueprintId, feet: Vec3, yaw: number): void {
    const footprint = FOOTPRINTS[blueprintId];
    // A weapon goes to the hands and never stands in the world, so it has no
    // ghost — there is nothing for one to be a ghost of.
    if (!footprint) return;
    const transform = placeStructure(feet, yaw, footprint);
    this.pending = {
      blueprintId,
      position: transform.position,
      yaw: transform.yaw,
      halfExtents: footprint.halfExtents,
    };
  }

  /** Drops the ghost for a sketch that built nothing: a smudge, or a refusal. */
  abandonPending(): void {
    this.pending = undefined;
  }

  /** The ghost awaiting a verdict, if any. Never collidable. */
  ghosts(): readonly GhostObject[] {
    return this.pending ? [this.pending] : [];
  }

  /** Every structure the authority has confirmed. */
  solid(): readonly SolidObject[] {
    return [...this.confirmed.values()];
  }

  /**
   * Takes the authority's list as it stands at `serverTick` and reports what
   * changed. Objects are kept by identity across snapshots so a collider is
   * built once and freed once rather than rebuilt thirty times a second.
   */
  reconcile(states: readonly DrawnObjectState[], serverTick: number): DrawnObjectDelta {
    const added: SolidObject[] = [];
    const seen = new Set<number>();

    for (const state of states) {
      // Belt and braces for the R-03 invariant: anything a snapshot names is
      // solid at that snapshot's tick, and anything that is not is ignored
      // rather than collided with early.
      if (state.solidFromTick > serverTick) continue;
      seen.add(state.id);
      const existing = this.confirmed.get(state.id);
      if (existing) {
        existing.health = state.health;
        continue;
      }
      const object = toSolid(state);
      if (!object) continue;
      this.confirmed.set(state.id, object);
      added.push(object);
    }

    const removed: number[] = [];
    for (const id of this.confirmed.keys()) {
      if (!seen.has(id)) removed.push(id);
    }
    for (const id of removed) this.confirmed.delete(id);

    // Whatever was pending is now either standing in the list or was refused;
    // either way the ghost has done its job.
    if (added.length > 0) this.pending = undefined;
    return { added, removed };
  }
}

function toSolid(state: DrawnObjectState): SolidObject | undefined {
  const footprint = FOOTPRINTS[state.blueprintId];
  // A blueprint this build has no footprint for is one the authority knows
  // about and this client does not. Skipping it is the safe direction: a
  // missing wall is a visual bug, an invented one is a movement bug.
  if (!footprint || !blueprintById(state.blueprintId)) return undefined;
  return {
    id: state.id,
    blueprintId: state.blueprintId,
    quality: state.quality,
    transform: { position: state.position, yaw: state.yaw },
    halfExtents: footprint.halfExtents,
    solidFromTick: state.solidFromTick,
    health: state.health,
  };
}
