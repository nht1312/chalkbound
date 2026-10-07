/**
 * Rapier interaction groups: the high 16 bits are the groups a collider is a
 * member of, the low 16 bits the groups it interacts with.
 */
const Group = {
  Static: 1 << 0,
  Player: 1 << 1,
} as const;

const ALL = 0xffff;

function interactionGroups(memberships: number, filter: number): number {
  return ((memberships << 16) | filter) >>> 0;
}

/** Level geometry: interacts with everything. */
export const STATIC_GROUPS = interactionGroups(Group.Static, ALL);

/** Player capsules. */
export const PLAYER_GROUPS = interactionGroups(Group.Player, ALL);

/**
 * Filter for a player's own movement queries: collide with level geometry
 * only. Players pass through each other until body blocking is designed
 * (Phase 8).
 */
export const PLAYER_MOVEMENT_QUERY = interactionGroups(Group.Player, Group.Static);
