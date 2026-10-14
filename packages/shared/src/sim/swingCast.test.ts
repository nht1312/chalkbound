import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { COMBAT } from '../config/combat';
import { MOVEMENT } from '../config/movement';
import { vec3, type Vec3 } from '../math/vec';
import { DRAWN_GROUPS, PLAYER_GROUPS } from '../physics/collisionGroups';
import { createStaticWorld, type PhysicsWorld } from '../physics/staticWorld';
import type { StaticBox } from '../world/greyboxRoom';
import { castSwing, dummyTarget, playerTarget, type SwingWorld } from './swingCast';
import { lookDirection } from './interaction';

beforeAll(async () => {
  await RAPIER.init();
});

const REACH = COMBAT.armed.reach;
const EYE = vec3(0, MOVEMENT.eyeHeight.standing, 0);
/** Yaw 0 faces -Z, so "ahead" is negative z. */
const AHEAD = lookDirection(0, 0);

const FLOOR: StaticBox = {
  id: 'floor',
  kind: 'floor',
  center: vec3(0, -0.5, 0),
  halfExtents: vec3(50, 0.5, 50),
};

interface Scene {
  readonly swingWorld: SwingWorld;
  readonly world: PhysicsWorld;
  /** Adds a drawn structure the swing may hit. */
  addStructure(center: Vec3, halfExtents: Vec3, id: number): void;
}

function scene(boxes: readonly StaticBox[] = [FLOOR]): Scene {
  const world = createStaticWorld(RAPIER, boxes);
  const structures = new Map<number, number>();
  return {
    world,
    swingWorld: { rapier: RAPIER, world, structures },
    addStructure(center, halfExtents, id) {
      const collider = world.createCollider(
        RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z)
          .setTranslation(center.x, center.y, center.z)
          .setCollisionGroups(DRAWN_GROUPS),
      );
      structures.set(collider.handle, id);
      world.step();
    },
  };
}

/** Feet of a player standing `distance` metres straight ahead. */
const standingAt = (distance: number): Vec3 => vec3(0, 0, -distance);

describe('swing cast', () => {
  it('hits nothing in an empty room', () => {
    const { swingWorld } = scene();
    expect(castSwing(swingWorld, { origin: EYE, direction: AHEAD, reach: REACH })).toBeUndefined();
  });

  it('hits a player standing well within reach', () => {
    const { swingWorld } = scene();
    const hit = castSwing(swingWorld, { origin: EYE, direction: AHEAD, reach: REACH }, [
      playerTarget(7, standingAt(1.5), false),
    ]);
    expect(hit?.kind).toBe('player');
    expect(hit?.id).toBe(7);
    expect(hit?.distance).toBeLessThan(REACH);
  });

  it('reports where the blade met them, for the impact to hang off', () => {
    const { swingWorld } = scene();
    const hit = castSwing(swingWorld, { origin: EYE, direction: AHEAD, reach: REACH }, [
      playerTarget(1, standingAt(1.5), false),
    ]);
    // The near surface of a capsule 1.5 m away, within a hull's width.
    expect(hit?.point.z).toBeLessThan(0);
    expect(hit?.point.z).toBeGreaterThan(-1.5);
    expect(Math.abs(hit?.point.x ?? 1)).toBeLessThan(COMBAT.arcRadius + 0.01);
  });

  // Vertical slice criterion 8: a hit inside reach, nothing outside it.
  describe('the reach boundary', () => {
    /** Distance to a target's near surface, from the eye. */
    const surfaceAt = (distance: number): number => distance + MOVEMENT.capsule.radius;

    it('hits a target whose surface is just inside reach', () => {
      const { swingWorld } = scene();
      const hit = castSwing(swingWorld, { origin: EYE, direction: AHEAD, reach: REACH }, [
        playerTarget(1, standingAt(surfaceAt(REACH - 0.05)), false),
      ]);
      expect(hit?.id).toBe(1);
    });

    it('misses a target whose surface is just outside reach', () => {
      const { swingWorld } = scene();
      const hit = castSwing(swingWorld, { origin: EYE, direction: AHEAD, reach: REACH }, [
        playerTarget(1, standingAt(surfaceAt(REACH + 0.05)), false),
      ]);
      expect(hit).toBeUndefined();
    });

    it('misses with the shorter unarmed reach what a sword would have hit', () => {
      const feet = standingAt(surfaceAt(COMBAT.unarmed.reach + 0.3));
      const armed = scene();
      expect(
        castSwing(armed.swingWorld, { origin: EYE, direction: AHEAD, reach: REACH }, [
          playerTarget(1, feet, false),
        ])?.id,
      ).toBe(1);

      const unarmed = scene();
      expect(
        castSwing(
          unarmed.swingWorld,
          { origin: EYE, direction: AHEAD, reach: COMBAT.unarmed.reach },
          [playerTarget(1, feet, false)],
        ),
      ).toBeUndefined();
    });
  });

  it('misses someone standing behind the attacker', () => {
    const { swingWorld } = scene();
    const hit = castSwing(swingWorld, { origin: EYE, direction: AHEAD, reach: REACH }, [
      playerTarget(1, vec3(0, 0, 1.2), false),
    ]);
    expect(hit).toBeUndefined();
  });

  it('misses someone standing beside the attacker', () => {
    const { swingWorld } = scene();
    const hit = castSwing(swingWorld, { origin: EYE, direction: AHEAD, reach: REACH }, [
      playerTarget(1, vec3(1.5, 0, 0), false),
    ]);
    expect(hit).toBeUndefined();
  });

  it('misses a crouching player the blade passes over', () => {
    const { swingWorld } = scene();
    // Above a crouching capsule (1.2 m) and below a standing one (1.8 m),
    // with the swung hull's own radius taken into account.
    const high = { origin: vec3(0, 1.7, 0), direction: AHEAD, reach: REACH };
    expect(
      castSwing(swingWorld, high, [playerTarget(1, standingAt(1.2), true)]),
    ).toBeUndefined();
    expect(
      castSwing(swingWorld, high, [playerTarget(1, standingAt(1.2), false)])?.id,
    ).toBe(1);
  });

  it('does not reach through a wall standing between them', () => {
    const wall: StaticBox = {
      id: 'wall',
      kind: 'wall',
      center: vec3(0, 1.5, -1),
      halfExtents: vec3(2, 1.5, 0.1),
    };
    const { swingWorld } = scene([FLOOR, wall]);
    const hit = castSwing(swingWorld, { origin: EYE, direction: AHEAD, reach: REACH }, [
      playerTarget(1, standingAt(1.8), false),
    ]);
    expect(hit).toBeUndefined();
  });

  it('hits a drawn structure in the way, rather than what is behind it', () => {
    const { swingWorld, addStructure } = scene();
    addStructure(vec3(0, 1.25, -1), vec3(1, 1.25, 0.1), 42);
    const hit = castSwing(swingWorld, { origin: EYE, direction: AHEAD, reach: REACH }, [
      playerTarget(1, standingAt(1.8), false),
    ]);
    expect(hit?.kind).toBe('structure');
    expect(hit?.id).toBe(42);
  });

  it('hits the nearest of several candidates and stops there', () => {
    const { swingWorld } = scene();
    const hit = castSwing(swingWorld, { origin: EYE, direction: AHEAD, reach: REACH }, [
      playerTarget(1, standingAt(1.8), false),
      playerTarget(2, standingAt(1.0), false),
    ]);
    expect(hit?.id).toBe(2);
  });

  it('never lands on the swinger, who is simply not a candidate', () => {
    // The attacker's own capsule has no collider in this query's groups and
    // is never passed in as a target, so there is nothing to exclude.
    const { swingWorld, world } = scene();
    world.createCollider(
      RAPIER.ColliderDesc.capsule(0.6, MOVEMENT.capsule.radius)
        .setTranslation(0, 0.9, 0)
        .setCollisionGroups(PLAYER_GROUPS),
    );
    world.step();
    expect(castSwing(swingWorld, { origin: EYE, direction: AHEAD, reach: REACH })).toBeUndefined();
  });

  it('hits the training dummy', () => {
    const { swingWorld } = scene();
    const hit = castSwing(swingWorld, { origin: EYE, direction: AHEAD, reach: REACH }, [
      dummyTarget(3, vec3(0, 0, -1.5)),
    ]);
    expect(hit?.kind).toBe('dummy');
    expect(hit?.id).toBe(3);
  });

  it('changes nothing about the world it is asked about', () => {
    // The whole reason capsules are tested in arithmetic: a hit test that
    // added a collider, or stepped the world to register one, would move the
    // authority's next movement result away from the client's (R-03).
    const { swingWorld, world } = scene();
    const before = world.colliders.len();
    for (let i = 0; i < 5; i++) {
      castSwing(swingWorld, { origin: EYE, direction: AHEAD, reach: REACH }, [
        playerTarget(1, standingAt(1.5), false),
        playerTarget(2, standingAt(2.0), false),
        dummyTarget(3, standingAt(2.1)),
      ]);
    }
    expect(world.colliders.len()).toBe(before);
  });

  it('reports the contact point in world space, wherever the fight is', () => {
    const near = scene();
    const far = scene();
    const offset = 5;
    const hitNear = castSwing(near.swingWorld, { origin: EYE, direction: AHEAD, reach: REACH }, [
      playerTarget(1, standingAt(1.5), false),
    ]);
    const hitFar = castSwing(
      far.swingWorld,
      { origin: vec3(offset, EYE.y, 0), direction: AHEAD, reach: REACH },
      [playerTarget(1, vec3(offset, 0, -1.5), false)],
    );
    expect(hitFar?.point.x).toBeCloseTo((hitNear?.point.x ?? 0) + offset, 5);
    expect(hitFar?.point.z).toBeCloseTo(hitNear?.point.z ?? 0, 5);
    expect(hitFar?.distance).toBeCloseTo(hitNear?.distance ?? 0, 5);
  });

  it('aims where the player looks', () => {
    const { swingWorld } = scene();
    const behind = playerTarget(1, vec3(0, 0, 1.5), false);
    // Turned around: what was behind is now ahead.
    const hit = castSwing(
      swingWorld,
      { origin: EYE, direction: lookDirection(Math.PI, 0), reach: REACH },
      [behind],
    );
    expect(hit?.id).toBe(1);
  });
});
