import { MOVEMENT } from '../config/movement';
import { vec3, type Vec3 } from '../math/vec';

/**
 * Where a drawn structure lands (SPEC §6.8). Deliberately free of any
 * dependency on the simulation: it takes a position and an angle, so it can
 * be reasoned about and tested without a physics world.
 *
 * **Placement never fails** (plan decision 1). A structure whose transform
 * overlaps existing geometry is placed anyway: refusing would create a "paid
 * and got nothing" case, and chalk is debited before any of this is known —
 * there is no refund path (SPEC §6.6). The single adjustment made here is the
 * one that protects the player from their own sketch, by keeping the shape
 * clear of the capsule that drew it.
 */

export interface DrawnTransform {
  /** Centre of the object's box, in world space. */
  readonly position: Vec3;
  /** Yaw in radians, matching the drawer's facing. */
  readonly yaw: number;
}

export interface Footprint {
  /** Half-extents in the object's own space; z runs away from the player. */
  readonly halfExtents: Vec3;
  /**
   * Where the near face sits. For something that stands up, this is clear
   * space kept between the player's capsule and the face. For a surface the
   * player walks on it is measured from their feet instead and may be
   * **negative**, putting the near edge behind them — see `standOn`.
   */
  readonly gapM: number;
  /** True for a surface the player walks on, which sits at their feet. */
  readonly standOn: boolean;
}

/**
 * The direction a player faces at `yaw`. Mirrors the conversion in
 * `stepPlayer`, which drives movement from the same angle — if the two ever
 * disagree, a player walks one way and builds another.
 */
export function forwardFromYaw(yaw: number): { readonly x: number; readonly z: number } {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

/**
 * Puts `footprint` in front of a player standing at `feet` and facing `yaw`,
 * turned to face them.
 *
 * The distance is measured to the object's *near face* rather than its
 * centre, so a deep shape like a bridge reaches away from the player instead
 * of swallowing them: a four-metre deck and a hand's-width slab are placed by
 * where they begin, not by where their middles land.
 */
export function placeStructure(feet: Vec3, yaw: number, footprint: Footprint): DrawnTransform {
  const { halfExtents, gapM, standOn } = footprint;
  // Something that stands up is held clear of the capsule, so the player is
  // never sealed inside their own sketch. A surface they walk on is the
  // opposite case: it has to reach *back under their feet*, anchoring on the
  // ground they are standing on. A deck that began even half a metre ahead
  // would leave a hole exactly where someone standing at the lip of a gap
  // takes their first step — they would fall into the thing they drew to
  // cross.
  const clearance = standOn ? gapM : MOVEMENT.capsule.radius + Math.max(gapM, 0);
  const distance = clearance + halfExtents.z;
  const forward = forwardFromYaw(yaw);

  return {
    position: vec3(
      feet.x + forward.x * distance,
      // A slab stands on the floor; a deck is sunk so its top is the floor.
      standOn ? feet.y - halfExtents.y : feet.y + halfExtents.y,
      feet.z + forward.z * distance,
    ),
    yaw,
  };
}
