import { CREATION, type DrawnObjectState } from '@chalkbound/shared';
import { describe, expect, it } from 'vitest';
import { DrawnObjects } from './DrawnObjects';

/**
 * The client's view of player-made geometry (SPEC_AUDIT R-03).
 *
 * Between releasing the stroke and the authority's verdict there is one round
 * trip in which the client knows what it drew and the world does not yet
 * agree. It shows a ghost: visible, so the drawing feels immediate, and never
 * collidable, so prediction cannot run against geometry the server has not
 * confirmed. The spec's own VFX window is what hides the delay.
 */

const confirmed = (over: Partial<DrawnObjectState> = {}): DrawnObjectState => ({
  id: 1,
  blueprintId: 'wall',
  quality: 'sound',
  position: { x: 0, y: 1.25, z: -2 },
  yaw: 0,
  solidFromTick: 100,
  health: CREATION.wall.health,
  ...over,
});

describe('the pending ghost', () => {
  it('shows nothing before anything is drawn', () => {
    const objects = new DrawnObjects();
    expect(objects.ghosts()).toEqual([]);
    expect(objects.solid()).toEqual([]);
  });

  it('shows a ghost the moment a sketch is submitted', () => {
    const objects = new DrawnObjects();
    objects.predict('wall', { x: 0, y: 0, z: 0 }, 0);
    expect(objects.ghosts()).toHaveLength(1);
    expect(objects.ghosts()[0]?.blueprintId).toBe('wall');
  });

  it('never makes a ghost solid, however long it waits', () => {
    const objects = new DrawnObjects();
    objects.predict('wall', { x: 0, y: 0, z: 0 }, 0);
    for (let tick = 0; tick < 600; tick++) objects.reconcile([], tick);
    expect(objects.solid()).toEqual([]);
  });

  it('puts the ghost where the object will actually stand', () => {
    const objects = new DrawnObjects();
    objects.predict('wall', { x: 0, y: 0, z: 0 }, 0);
    const ghost = objects.ghosts()[0];
    // Ahead of the drawer, as placement will put the real one.
    expect(ghost?.position.z).toBeLessThan(0);
    expect(ghost?.halfExtents.x).toBeCloseTo(CREATION.wall.width / 2, 9);
  });

  it('shows nothing for a blueprint that builds no structure', () => {
    const objects = new DrawnObjects();
    objects.predict('sword', { x: 0, y: 0, z: 0 }, 0);
    expect(objects.ghosts()).toEqual([]);
  });
});

describe('the solid transition', () => {
  it('replaces the ghost with the confirmed object', () => {
    const objects = new DrawnObjects();
    objects.predict('wall', { x: 0, y: 0, z: 0 }, 0);
    objects.reconcile([confirmed()], 100);
    expect(objects.ghosts()).toEqual([]);
    expect(objects.solid()).toHaveLength(1);
    expect(objects.solid()[0]?.id).toBe(1);
  });

  it('gives up on a ghost the authority never confirms', () => {
    const objects = new DrawnObjects();
    objects.predict('wall', { x: 0, y: 0, z: 0 }, 0);
    // A smudge: the sketch was read, charged for, and built nothing.
    objects.abandonPending();
    expect(objects.ghosts()).toEqual([]);
    expect(objects.solid()).toEqual([]);
  });

  it('adopts a structure it never predicted, because the world is shared', () => {
    // Another player's wall, or one drawn before this client connected.
    const objects = new DrawnObjects();
    objects.reconcile([confirmed({ id: 9 })], 100);
    expect(objects.solid().map((o) => o.id)).toEqual([9]);
  });

  it('keeps a confirmed object across later snapshots without rebuilding it', () => {
    const objects = new DrawnObjects();
    objects.reconcile([confirmed()], 100);
    const first = objects.solid()[0];
    objects.reconcile([confirmed()], 102);
    expect(objects.solid()[0]).toBe(first);
  });

  it('forgets an object the authority has stopped sending', () => {
    const objects = new DrawnObjects();
    objects.reconcile([confirmed({ id: 1 }), confirmed({ id: 2 })], 100);
    expect(objects.solid()).toHaveLength(2);
    objects.reconcile([confirmed({ id: 2 })], 102);
    expect(objects.solid().map((o) => o.id)).toEqual([2]);
  });

  it('follows the authority when a confirmed object takes damage', () => {
    const objects = new DrawnObjects();
    objects.reconcile([confirmed({ health: 60 })], 100);
    objects.reconcile([confirmed({ health: 20 })], 102);
    expect(objects.solid()[0]?.health).toBe(20);
  });

  /**
   * The R-03 invariant from the client's side. Everything a snapshot names is
   * already solid at that snapshot's tick, so there is never a moment where
   * the client holds an object it must not yet collide with.
   */
  it('never holds a solid object from a tick it has not reached', () => {
    const objects = new DrawnObjects();
    for (const tick of [100, 104, 108]) {
      objects.reconcile([confirmed({ solidFromTick: tick })], tick);
      for (const object of objects.solid()) {
        expect(object.solidFromTick).toBeLessThanOrEqual(tick);
      }
    }
  });

  it('reports what changed, so colliders are built and freed once each', () => {
    const objects = new DrawnObjects();
    const added = objects.reconcile([confirmed({ id: 1 })], 100);
    expect(added.added.map((o) => o.id)).toEqual([1]);
    expect(added.removed).toEqual([]);

    const nothing = objects.reconcile([confirmed({ id: 1 })], 102);
    expect(nothing.added).toEqual([]);
    expect(nothing.removed).toEqual([]);

    const gone = objects.reconcile([], 104);
    expect(gone.added).toEqual([]);
    expect(gone.removed).toEqual([1]);
  });
});
