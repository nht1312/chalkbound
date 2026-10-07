/**
 * Player movement constants. Speeds and jump height are **[PLACEHOLDER]**:
 * SPEC.md fixes only that The Erased (3.2 m/s) is faster than a walk and
 * slower than a sprint. Tune at the Phase 1 feel check.
 */
export const MOVEMENT = {
  /** m/s [PLACEHOLDER] */
  walkSpeed: 2.8,
  /** m/s, forward only [PLACEHOLDER] */
  sprintSpeed: 5.2,
  /** m/s [PLACEHOLDER] */
  crouchSpeed: 1.4,
  /** Horizontal acceleration toward the wished velocity on the ground, m/s². */
  groundAcceleration: 40,
  /** Horizontal acceleration while airborne (air control), m/s². */
  airAcceleration: 6,
  /** Jump apex height above the take-off point, m [PLACEHOLDER] */
  jumpHeight: 1.0,

  capsule: {
    radius: 0.3,
    /** Total standing height including the hemispherical caps, m. */
    standingHeight: 1.8,
    /** Total crouching height, m. */
    crouchingHeight: 1.2,
  },
  controller: {
    /** Gap the controller keeps from obstacles, m. */
    skinWidth: 0.02,
    /** Highest step climbed without jumping, m. */
    stepHeight: 0.3,
    /** Narrowest step surface considered climbable, m. */
    stepMinWidth: 0.2,
    /** Steepest walkable slope, degrees. */
    maxSlopeDegrees: 45,
    /** Distance the controller snaps down to stay glued to the ground, m. */
    snapToGround: 0.3,
  },
} as const;
