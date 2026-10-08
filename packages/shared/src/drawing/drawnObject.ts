import { CREATION } from '../config/creation';
import type { Vec3 } from '../math/vec';
import type { BlueprintId, Quality } from './blueprint';
import type { DrawnTransform } from './placement';

/**
 * What a recognized sketch became (SPEC §6.8, §7.4).
 *
 * Weapons and structures are deliberately different types rather than one
 * type with optional fields, because they differ in every way that matters:
 * a weapon is carried and leaves with its owner, a structure belongs to the
 * world and outlives them (RD-07). Keeping them apart means the compiler
 * refuses the mistakes — giving a wall durability, asking a sword where it
 * stands — instead of leaving them to a code review.
 */

export type DrawnObjectId = number;

interface DrawnCommon {
  readonly id: DrawnObjectId;
  readonly blueprintId: BlueprintId;
  /** Asset name per CLAUDE.md §13. */
  readonly asset: string;
  readonly quality: Quality;
  readonly accuracy: number;
  /**
   * The tick the authority made it real. A client replaying predicted input
   * may only collide with it from this tick onward (SPEC_AUDIT R-03).
   */
  readonly solidFromTick: number;
}

export interface DrawnWeapon extends DrawnCommon {
  readonly kind: 'weapon';
  /** Weapons are carried, and leave with their owner (SPEC §7.4). */
  readonly ownerId: number;
  /** Hits left before it shatters. Spent by combat in Phase 5. */
  durability: number;
  readonly maxDurability: number;
}

export interface DrawnStructure extends DrawnCommon {
  readonly kind: 'structure';
  readonly transform: DrawnTransform;
  /** Half-extents in the object's own space; z runs away from the drawer. */
  readonly halfExtents: Vec3;
  /**
   * Who drew it — for attribution only. A structure belongs to the world, so
   * nothing about how it behaves may depend on this (RD-07): any player may
   * cross any bridge, and any player is blocked by any wall.
   */
  readonly drawnBy: number;
  health: number;
  readonly maxHealth: number;
}

export type DrawnObject = DrawnWeapon | DrawnStructure;

/**
 * A base stat as the player's quality band leaves it (SPEC §6.5, plan
 * decision 6). Rounded, because durability is a count of hits and health is a
 * count of hit points; neither has a fractional value that means anything.
 */
export function scaledStat(base: number, quality: Quality): number {
  return Math.max(1, Math.round(base * CREATION.qualityScale[quality]));
}

/**
 * Takes `amount` off a structure (RD-07). Damage arrives from a client's
 * claimed hit by way of the authority, so anything meaningless — negative,
 * zero, NaN, or a blow on something already gone — is ignored rather than
 * trusted or thrown over.
 */
export function damage(structure: DrawnStructure, amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) return;
  structure.health = Math.max(0, structure.health - amount);
}

export function isDestroyed(structure: DrawnStructure): boolean {
  return structure.health <= 0;
}
