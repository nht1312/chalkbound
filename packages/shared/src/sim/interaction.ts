import { INTERACTION } from '../config/interaction';
import { MOVEMENT } from '../config/movement';
import { vec3, type Vec3 } from '../math/vec';
import type { PlayerState } from './stepPlayer';

/** Where the player's eyes are: feet plus the standing or crouching eye height. */
export function eyePosition(player: PlayerState): Vec3 {
  const height = player.crouching ? MOVEMENT.eyeHeight.crouching : MOVEMENT.eyeHeight.standing;
  return vec3(player.position.x, player.position.y + height, player.position.z);
}

/**
 * Proximity rule the authority applies to every interaction intent. Line of
 * sight is not checked yet: the greybox is a single room (revisit in Phase 6).
 */
export function withinInteractRange(player: PlayerState, target: Vec3): boolean {
  const eye = eyePosition(player);
  return Math.hypot(target.x - eye.x, target.y - eye.y, target.z - eye.z) <= INTERACTION.range;
}
