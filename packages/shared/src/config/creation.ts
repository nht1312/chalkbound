/**
 * What a recognized sketch turns into (SPEC §7.1–7.3, §6.5). Every value is
 * **[PLACEHOLDER]** in the spec and is tuned by playing.
 *
 * Sizes are world metres and have nothing to do with the size of the sketch:
 * a small neat wall and a large neat wall are the same wall, because accuracy
 * decides *how good* an object is and never *what* it is (SPEC §6.5).
 */
export const CREATION = {
  /**
   * How quality scales an object's stats (plan decision 6). It multiplies
   * durability and health, never dimensions: a reach or a span that varied
   * with handwriting would be a competitive variable the player cannot see.
   */
  qualityScale: {
    crude: 0.7,
    sound: 1,
    keen: 1.3,
  },

  sword: {
    /** Hits before it shatters, at `sound` quality (SPEC §7.1). */
    durability: 20,
  },

  wall: {
    /** Hit points at `sound` quality (SPEC §7.2). */
    health: 60,
    /** Metres: 2 m across, 2.5 m tall, and thin front to back. */
    width: 2,
    height: 2.5,
    thickness: 0.2,
    /** Clear space between the drawer's capsule and the wall's near face. */
    gapM: 1.5,
  },

  bridge: {
    /** Hit points at `sound` quality (SPEC §7.3). */
    health: 40,
    /** Metres: a 4 m span running away from the drawer, 1.5 m across. */
    span: 4,
    width: 1.5,
    thickness: 0.2,
    /**
     * **Negative**: the deck's near edge sits this far *behind* the drawer's
     * feet, so it is anchored on the ground they are standing on rather than
     * beginning out over the drop. Someone bridging a gap stands at its lip,
     * and a deck that started ahead of them would put a hole exactly where
     * their first step lands. [PLACEHOLDER]
     */
    gapM: -0.5,
  },
} as const;
