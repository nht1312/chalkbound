import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { COMBAT } from '../config/combat';
import { MOVEMENT } from '../config/movement';
import { vec3, type Vec3 } from '../math/vec';
import { DUMMY_GROUPS } from '../physics/collisionGroups';
import { createStaticWorld, type PhysicsWorld } from '../physics/staticWorld';
import type { StaticBox } from '../world/greyboxRoom';
import { castSwing, type SwingTarget, type SwingWorld } from './swingCast';
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
  /** Adds a standing collider the swing may hit, as a structure or a dummy. */
  addTarget(center: Vec3, halfExtents: Vec3, target: SwingTarget): void;
}

function scene(boxes: readonly StaticBox[] = [FLOOR]): Scene {
  const world = createStaticWorld(RAPIER, boxes);
  const colliderTargets = new Map<number, SwingTarget>();
  return {
    world,
    swingWorld: { rapier: RAPIER, world, colliderTargets },
    addTarget(center, halfExtents, target) {
      const collider = world.createCollider(
        RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z)
          .setTranslation(center.x, center.y, center.z)
          .setCollisionGroups(DUMMY_GROUPS),
      );
      colliderTargets.set(collider.handle, target);
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
      { id: 7, feet: standingAt(1.5), crouching: false },
    ]);
    expect(hit?.kind).toBe('player');
    expect(hit?.id).toBe(7);
    expect(hit?.distance).toBeLessThan(REACH);
  });

  it('reports where the blade met them, for the impact to hang off', () => {
    const { swingWorld } = scene();
    const hit = castSwing(swingWorld, { origin: EYE, direction: AHEAD, reach: REACH }, [
      { id: 1, feet: standingAt(1.5), crouching: false },
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
        { id: 1, feet: standingAt(surfaceAt(REACH - 0.05)), crouching: false },
      ]);
      expect(hit?.id).toBe(1);
    });

    it('misses a target whose surface is just outside reach', () => {
      const { swingWorld } = scene();
      const hit = castSwing(swingWorld, { origin: EYE, direction: AHEAD, reach: REACH }, [
        { id: 1, feet: standingAt(surfaceAt(REACH + 0.05)), crouching: false },
      ]);
      expect(hit).toBeUndefined();
    });

    it('misses with the shorter unarmed reach what a sword would have hit', () => {
      const feet = standingAt(surfaceAt(COMBAT.unarmed.reach + 0.3));
      const armed = scene();
      expect(
        castSwing(armed.swingWorld, { origin: EYE, direction: AHEAD, reach: REACH }, [
          { id: 1, feet, crouching: false },
        ])?.id,
      ).toBe(1);

      const unarmed = scene();
      expect(
        castSwing(
          unarmed.swingWorld,
          { origin: EYE, direction: AHEAD, reach: COMBAT.unarmed.reach },
          [{ id: 1, feet, crouching: false }],
        ),
      ).toBeUndefined();
    });
  });

  it('misses someone standing behind the attacker', () => {
    const { swingWorld } = scene();
    const hit = castSwing(swingWorld, { origin: EYE, direction: AHEAD, reach: REACH }, [
      { id: 1, feet: vec3(0, 0, 1.2), crouching: false },
    ]);
    expect(hit).toBeUndefined();
  });

  it('misses someone standing beside the attacker', () => {
    const { swingWorld } = scene();
    const hit = castSwing(swingWorld, { origin: EYE, direction: AHEAD, reach: REACH }, [
      { id: 1, feet: vec3(1.5, 0, 0), crouching: false },
    ]);
    expect(hit).toBeUndefined();
  });

  it('misses a crouching player the blade passes over', () => {
    const { swingWorld } = scene();
    // Above a crouching capsule (1.2 m) and below a standing one (1.8 m),
    // with the swung hull's own radius taken into account.
    const high = { origin: vec3(0, 1.7, 0), direction: AHEAD, reach: REACH };
    expect(
      castSwing(swingWorld, high, [{ id: 1, feet: standingAt(1.2), crouching: true }]),
    ).toBeUndefined();
    expect(
      castSwing(swingWorld, high, [{ id: 1, feet: standingAt(1.2), crouching: false }])?.id,
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
      { id: 1, feet: standingAt(1.8), crouching: false },
    ]);
    expect(hit).toBeUndefined();
  });

  it('hits a drawn structure in the way, rather than what is behind it', () => {
    const { swingWorld, addTarget } = scene();
    addTarget(vec3(0, 1.25, -1), vec3(1, 1.25, 0.1), { kind: 'structure', id: 42 });
    const hit = castSwing(swingWorld, { origin: EYE, direction: AHEAD, reach: REACH }, [
      { id: 1, feet: standingAt(1.8), crouching: false },
    ]);
    expect(hit?.kind).toBe('structure');
    expect(hit?.id).toBe(42);
  });

  it('hits the nearest of several candidates and stops there', () => {
    const { swingWorld } = scene();
    const hit = castSwing(swingWorld, { origin: EYE, direction: AHEAD, reach: REACH }, [
      { id: 1, feet: standingAt(1.8), crouching: false },
      { id: 2, feet: standingAt(1.0), crouching: false },
    ]);
    expect(hit?.id).toBe(2);
  });

  it('never lands on the swinger', () => {
    const { swingWorld, world } = scene();
    const own = world.createCollider(
      RAPIER.ColliderDesc.capsule(0.6, MOVEMENT.capsule.radius).setTranslation(0, 0.9, 0),
    );
    const hit = castSwing(swingWorld, {
      origin: EYE,
      direction: AHEAD,
      reach: REACH,
      exclude: own,
    });
    expect(hit).toBeUndefined();
  });

  it('hits the training dummy, by its collider', () => {
    const { swingWorld, addTarget } = scene();
    addTarget(vec3(0, 0.9, -1.5), vec3(0.3, 0.9, 0.3), { kind: 'dummy', id: 3 });
    const hit = castSwing(swingWorld, { origin: EYE, direction: AHEAD, reach: REACH });
    expect(hit?.kind).toBe('dummy');
    expect(hit?.id).toBe(3);
  });

  it('leaves no stand-ins behind in the world', () => {
    const { swingWorld, world } = scene();
    const before = world.colliders.len();
    for (let i = 0; i < 5; i++) {
      castSwing(swingWorld, { origin: EYE, direction: AHEAD, reach: REACH }, [
        { id: 1, feet: standingAt(1.5), crouching: false },
        { id: 2, feet: standingAt(2.0), crouching: false },
      ]);
    }
    expect(world.colliders.len()).toBe(before);
  });

  it('reports the contact point in world space, wherever the fight is', () => {
    const near = scene();
    const far = scene();
    const offset = 5;
    const hitNear = castSwing(near.swingWorld, { origin: EYE, direction: AHEAD, reach: REACH }, [
      { id: 1, feet: standingAt(1.5), crouching: false },
    ]);
    const hitFar = castSwing(
      far.swingWorld,
      { origin: vec3(offset, EYE.y, 0), direction: AHEAD, reach: REACH },
      [{ id: 1, feet: vec3(offset, 0, -1.5), crouching: false }],
    );
    expect(hitFar?.point.x).toBeCloseTo((hitNear?.point.x ?? 0) + offset, 5);
    expect(hitFar?.point.z).toBeCloseTo(hitNear?.point.z ?? 0, 5);
    expect(hitFar?.distance).toBeCloseTo(hitNear?.distance ?? 0, 5);
  });

  it('aims where the player looks', () => {
    const { swingWorld } = scene();
    const behind = { id: 1, feet: vec3(0, 0, 1.5), crouching: false };
    // Turned around: what was behind is now ahead.
    const hit = castSwing(
      swingWorld,
      { origin: EYE, direction: lookDirection(Math.PI, 0), reach: REACH },
      [behind],
    );
    expect(hit?.id).toBe(1);
  });
});
