/**
 * Rapier interaction groups: the high 16 bits are the groups a collider is a
 * member of, the low 16 bits the groups it interacts with.
 */
const Group = {
  Static: 1 << 0,
  Player: 1 << 1,
  /** Walls and bridges players drew. Solid from their `solidFromTick`. */
  Drawn: 1 << 2,
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
 * Drawn structures. They interact with everything the level does, because to
 * a player standing on a bridge there is no difference between a floor someone
 * drew and a floor that was always there (SPEC §7.4).
 */
export const DRAWN_GROUPS = interactionGroups(Group.Drawn, ALL);

/**
 * Filter for a player's own movement queries: level geometry and anything
 * drawn into it. Players pass through each other until body blocking is
 * designed (Phase 8).
 *
 * Drawn geometry belongs here rather than in a filter of its own precisely
 * because client and server must agree about it tick for tick: the moment
 * movement treats a drawn wall differently from a built one, prediction and
 * authority part company and the player rubber-bands (SPEC_AUDIT R-03).
 */
export const PLAYER_MOVEMENT_QUERY = interactionGroups(
  Group.Player,
  Group.Static | Group.Drawn,
);
