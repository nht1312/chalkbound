import { describe, expect, it } from 'vitest';
import { MOVEMENT } from '../config/movement';
import { vec3 } from '../math/vec';
import { forwardFromYaw, placeStructure, type Footprint } from './placement';

/**
 * Where a structure lands when the player draws one (SPEC §6.8: "materializes
 * in the world ahead of the player, oriented to their facing").
 */

const FEET = vec3(0, 0, 0);

/** A wall-ish slab: thin front to back, tall, standing on the floor. */
const SLAB: Footprint = { halfExtents: vec3(1, 1.25, 0.1), gapM: 1.5, standOn: false };
/** A bridge-ish deck: long front to back, flat, walked on, anchored behind. */
const DECK: Footprint = { halfExtents: vec3(0.75, 0.1, 2), gapM: -0.5, standOn: true };

describe('forwardFromYaw', () => {
  /**
   * Must agree with `stepPlayer`, which drives movement from the same angle.
   * If these ever disagree, a player walks one way and builds another.
   */
  it('matches the direction a player walks when they hold forward', () => {
    for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2, 0.37]) {
      const forward = forwardFromYaw(yaw);
      expect(forward.x).toBeCloseTo(-Math.sin(yaw), 9);
      expect(forward.z).toBeCloseTo(-Math.cos(yaw), 9);
    }
  });

  it('is a unit vector at every angle', () => {
    for (const yaw of [0, 1, -2.2, 3.1]) {
      const { x, z } = forwardFromYaw(yaw);
      expect(Math.hypot(x, z)).toBeCloseTo(1, 9);
    }
  });
});

describe('placeStructure', () => {
  it.each([
    ['facing -Z', 0, { x: 0, z: -1 }],
    ['facing -X', Math.PI / 2, { x: -1, z: 0 }],
    ['facing +Z', Math.PI, { x: 0, z: 1 }],
    ['facing +X', -Math.PI / 2, { x: 1, z: 0 }],
  ] as const)('puts it ahead of the player when %s', (_name, yaw, direction) => {
    const { position } = placeStructure(FEET, yaw, SLAB);
    const distance = Math.hypot(position.x, position.z);
    expect(position.x).toBeCloseTo(direction.x * distance, 6);
    expect(position.z).toBeCloseTo(direction.z * distance, 6);
    expect(distance).toBeGreaterThan(0);
  });

  it('turns it to face the player, so a wall presents its face', () => {
    for (const yaw of [0, 0.8, -2.5]) expect(placeStructure(FEET, yaw, SLAB).yaw).toBeCloseTo(yaw, 9);
  });

  it('follows the player rather than assuming the origin', () => {
    const feet = vec3(3, 1.5, -7);
    const { position } = placeStructure(feet, Math.PI, SLAB);
    expect(position.x).toBeCloseTo(3, 6);
    expect(position.z).toBeGreaterThan(-7);
  });

  /**
   * The one adjustment placement makes (plan decision 1). Placement never
   * fails — there is no refund path — so the only thing it must guarantee is
   * that the player is not sealed inside something that stands up.
   */
  it('never leaves the player inside a thing that stands up', () => {
    for (const yaw of [0, 1, 2, 3, -1, -2]) {
      const { position } = placeStructure(FEET, yaw, SLAB);
      const gap = Math.hypot(position.x, position.z) - SLAB.halfExtents.z;
      expect(gap, `yaw ${yaw}`).toBeGreaterThanOrEqual(MOVEMENT.capsule.radius);
    }
  });

  /**
   * A surface the player walks on is the opposite case, and the distinction
   * is load-bearing. Someone bridging a gap stands at its lip; a deck that
   * began even half a metre ahead of them would leave a hole exactly where
   * their first step lands, and they would fall into the thing they drew to
   * cross. It has to reach back under their feet.
   */
  it('reaches back under the feet of whoever drew it', () => {
    for (const yaw of [0, 1, 2, 3, -1, -2]) {
      const { position } = placeStructure(FEET, yaw, DECK);
      const nearEdge = Math.hypot(position.x, position.z) - DECK.halfExtents.z;
      expect(nearEdge, `yaw ${yaw}`).toBeLessThan(0);
    }
  });

  it('still reaches well past the player on the far side', () => {
    const { position } = placeStructure(FEET, 0, DECK);
    const farEdge = Math.hypot(position.x, position.z) + DECK.halfExtents.z;
    expect(farEdge).toBeGreaterThan(DECK.halfExtents.z);
  });

  it('keeps the requested clearance in front of the player capsule', () => {
    const { position } = placeStructure(FEET, 0, SLAB);
    const nearFace = Math.hypot(position.x, position.z) - SLAB.halfExtents.z;
    expect(nearFace).toBeCloseTo(MOVEMENT.capsule.radius + SLAB.gapM, 6);
  });

  it('pushes a deep footprint further out, so its near edge stays put', () => {
    const shallow = placeStructure(FEET, 0, SLAB);
    const deep = placeStructure(FEET, 0, { ...SLAB, halfExtents: vec3(1, 1.25, 2) });
    expect(Math.abs(deep.position.z)).toBeGreaterThan(Math.abs(shallow.position.z));
  });

  describe('height', () => {
    it('stands a slab on the floor the player is standing on', () => {
      const { position } = placeStructure(vec3(0, 4, 0), 0, SLAB);
      expect(position.y).toBeCloseTo(4 + SLAB.halfExtents.y, 6);
    });

    it('sinks a walkable deck so its top is level with the player’s feet', () => {
      const { position } = placeStructure(vec3(0, 4, 0), 0, DECK);
      expect(position.y).toBeCloseTo(4 - DECK.halfExtents.y, 6);
    });
  });
});
