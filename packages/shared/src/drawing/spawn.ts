import { CREATION } from '../config/creation';
import { vec3, type Vec3 } from '../math/vec';
import type { BlueprintId, BlueprintTemplate, Quality } from './blueprint';
import { scaledStat, type DrawnObject, type DrawnObjectId } from './drawnObject';
import { placeStructure, type Footprint } from './placement';

/**
 * The spawn registry (ARCHITECTURE §6.6): the one place a blueprint says what
 * it becomes. Adding a blueprint means adding its data file, listing it in the
 * blueprint registry, and adding one entry here — and no validator changes
 * (prompt §7).
 *
 * The `kind` on a blueprint's `SpawnDescriptor` chooses the construction, and
 * the switch over it is exhaustive: a descriptor kind with no case is a
 * compile error, never a silently unbuilt sketch.
 */

export interface SpawnRequest {
  readonly id: DrawnObjectId;
  /** The authority's tick. Becomes the object's `solidFromTick` (R-03). */
  readonly tick: number;
  readonly playerId: number;
  /** The drawer's feet, which a structure is placed relative to. */
  readonly feet: Vec3;
  /** The drawer's facing. */
  readonly yaw: number;
}

/** The part of a `created` outcome that shapes the object (SPEC §6.5). */
export interface SpawnGrade {
  readonly quality: Quality;
  readonly accuracy: number;
}

/** How each structure occupies the world. Weapons have no footprint. */
const FOOTPRINTS: Partial<Record<BlueprintId, Footprint>> = {
  wall: {
    halfExtents: vec3(CREATION.wall.width / 2, CREATION.wall.height / 2, CREATION.wall.thickness / 2),
    gapM: CREATION.wall.gapM,
    standOn: false,
  },
  bridge: {
    halfExtents: vec3(
      CREATION.bridge.width / 2,
      CREATION.bridge.thickness / 2,
      CREATION.bridge.span / 2,
    ),
    gapM: CREATION.bridge.gapM,
    standOn: true,
  },
};

/** Base hit points per structure, before quality scales them. */
const HEALTH: Partial<Record<BlueprintId, number>> = {
  wall: CREATION.wall.health,
  bridge: CREATION.bridge.health,
};

/**
 * Builds the object a recognized sketch became. Called by the authority only,
 * after it has classified, graded and debited — so anything missing here is a
 * programming error in the registry rather than anything a player did, and it
 * throws rather than inventing a default.
 */
export function spawnDrawnObject(
  blueprint: BlueprintTemplate,
  grade: SpawnGrade,
  request: SpawnRequest,
): DrawnObject {
  const common = {
    id: request.id,
    blueprintId: blueprint.id,
    asset: blueprint.spawn.asset,
    quality: grade.quality,
    accuracy: grade.accuracy,
    solidFromTick: request.tick,
  };

  switch (blueprint.spawn.kind) {
    case 'weapon': {
      const durability = scaledStat(CREATION.sword.durability, grade.quality);
      return { ...common, kind: 'weapon', ownerId: request.playerId, durability, maxDurability: durability };
    }
    case 'structure': {
      const footprint = FOOTPRINTS[blueprint.id];
      const base = HEALTH[blueprint.id];
      if (!footprint || base === undefined) {
        throw new Error(`Blueprint ${blueprint.id} spawns a structure with no footprint or health`);
      }
      const health = scaledStat(base, grade.quality);
      return {
        ...common,
        kind: 'structure',
        transform: placeStructure(request.feet, request.yaw, footprint),
        halfExtents: footprint.halfExtents,
        drawnBy: request.playerId,
        health,
        maxHealth: health,
      };
    }
    default: {
      // Exhaustive: a new SpawnDescriptor kind is a compile error here.
      const unreachable: never = blueprint.spawn.kind;
      throw new Error(`Blueprint ${blueprint.id} has unknown spawn kind ${String(unreachable)}`);
    }
  }
}
