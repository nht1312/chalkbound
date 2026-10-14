/**
 * Combat constants (SPEC §8, §7.1; SPEC_AUDIT RD-04). Every value here is
 * **[PLACEHOLDER]** and is tuned by playing — the spec says so itself.
 *
 * Three sword hits kill a player at full health, which is what keeps fights
 * short enough to read and makes starting one a decision rather than a habit.
 * An unarmed player is nearly helpless on purpose (SPEC §8): without chalk you
 * have nothing, and that is the first thing a match should teach.
 */
export const COMBAT = {
  player: {
    /** Health at spawn. No regeneration in the MVP (SPEC §8). */
    maxHealth: 100,
    /** Seconds spent down before standing back up (plan decision 8). */
    respawnDelaySeconds: 3,
  },

  swing: {
    /** Milliseconds from the button to the blade becoming dangerous. */
    windupMs: 120,
    /** Milliseconds the blade is dangerous. */
    activeMs: 80,
    /** Milliseconds after that before another swing may start. */
    recoveryMs: 250,
    /** Stamina per swing, spent whether or not the swing lands. */
    staminaCost: 20,
  },

  /** With a drawn sword in hand (SPEC §7.1). */
  armed: {
    damage: 35,
    /** Metres from the eyes along the look direction. */
    reach: 2.2,
    /** Durability spent per *landed* hit (plan decision 6). */
    durabilityPerHit: 1,
  },

  /** With nothing in hand. Possible, and almost pointless (SPEC §8). */
  unarmed: {
    damage: 5,
    /** A fist does not reach as far as a blade [PLACEHOLDER]. */
    reach: 1.2,
  },

  /**
   * The swung arc is modelled as a sphere swept along the look direction
   * rather than a true arc: a melee hull wide enough to forgive the aim a
   * player cannot see exactly, narrow enough that a miss reads as a miss.
   */
  arcRadius: 0.35,

  /**
   * Lag compensation (ARCHITECTURE §5.4, SPEC_AUDIT R-02).
   *
   * `historyMs` is how far back the authority can see; `maxRewindMs` is how
   * far back it is willing to go for any one attacker. The clamp is the whole
   * point: without it, a client that claims enough latency can hit someone
   * where they stood a second ago.
   */
  lagCompensation: {
    historyMs: 1000,
    maxRewindMs: 200,
  },

  /** The static training dummy of the vertical slice (plan decision 7). */
  dummy: {
    health: 100,
    /** Capsule, roughly player-sized so reach tests mean something. */
    radius: 0.3,
    height: 1.8,
    /** Seconds down before it stands back up at full health. */
    respawnDelaySeconds: 5,
  },
} as const;
