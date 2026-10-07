/**
 * The chalk economy, in one place (SPEC_AUDIT RD-02 / SPEC.md §5, §6.6, §7).
 * Every value is **[PLACEHOLDER]** in the spec. Chalk is a whole-unit meter.
 */
export const ECONOMY = {
  chalk: {
    /** Most chalk a player can carry. */
    max: 100,
    /** Players begin a match unarmed. */
    starting: 0,
    /** Chalk held by one chalk box. */
    perBox: 25,
    /** Chalk dropped by a defeated Erased (Phase 7). */
    erasedDrop: 15,
  },
  /** Chalk cost of a recognised, well-drawn blueprint (Phase 3–4). */
  blueprintCost: {
    sword: 20,
    wall: 15,
    bridge: 25,
  },
  /** A recognised but smudged drawing costs this fraction of its blueprint, rounded up. */
  smudgedCostFraction: 0.25,
  /** Flat cost of an unrecognised drawing. */
  unrecognizedCost: 5,
  /** Flat cost of a recognised drawing the player cannot afford; nothing is created. */
  unaffordableCost: 5,
} as const;
