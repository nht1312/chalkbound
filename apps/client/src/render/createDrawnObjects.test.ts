import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import type { GhostObject, SolidObject } from '../drawing/DrawnObjects';
import { createDrawnObjectsView } from './createDrawnObjects';

/**
 * Greybox rendering for player-made geometry (ROADMAP: primitives only until
 * Phase 6). What matters here is the lifecycle — a mesh per structure,
 * created once, removed once, never leaked — because these appear and vanish
 * while the match runs, unlike the level, which is built once and kept.
 */

const solid = (over: Partial<SolidObject> = {}): SolidObject => ({
  id: 1,
  blueprintId: 'wall',
  quality: 'sound',
  transform: { position: { x: 0, y: 1.25, z: -2 }, yaw: 0 },
  halfExtents: { x: 1, y: 1.25, z: 0.1 },
  solidFromTick: 10,
  health: 60,
  ...over,
});

const ghost = (over: Partial<GhostObject> = {}): GhostObject => ({
  blueprintId: 'wall',
  position: { x: 0, y: 1.25, z: -2 },
  yaw: 0,
  halfExtents: { x: 1, y: 1.25, z: 0.1 },
  ...over,
});

/** Every mesh this view owns, collapses included. */
const owned = (scene: Scene): string[] =>
  scene.children.filter((c) => c.name.startsWith('drawn-')).map((c) => c.name);

/** Only the structures still standing — a collapse is on its way out. */
const standing = (scene: Scene): string[] =>
  scene.children.filter((c) => c.name.startsWith('drawn-solid')).map((c) => c.name);

describe('rendering drawn structures', () => {
  it('shows an empty world as empty', () => {
    const scene = new Scene();
    createDrawnObjectsView(scene).update([], []);
    expect(owned(scene)).toEqual([]);
  });

  it('puts a mesh in the scene for a confirmed structure', () => {
    const scene = new Scene();
    createDrawnObjectsView(scene).update([solid()], []);
    expect(owned(scene)).toHaveLength(1);
  });

  it('stands it where the authority says, turned the way it says', () => {
    const scene = new Scene();
    createDrawnObjectsView(scene).update(
      [solid({ transform: { position: { x: 3, y: 1, z: -4 }, yaw: 1.25 } })],
      [],
    );
    const mesh = scene.children.find((c) => c.name.startsWith('drawn-solid'));
    expect(mesh?.position.x).toBeCloseTo(3, 6);
    expect(mesh?.position.z).toBeCloseTo(-4, 6);
    expect(mesh?.rotation.y).toBeCloseTo(1.25, 6);
  });

  it('builds a mesh once, not once per frame', () => {
    const scene = new Scene();
    const view = createDrawnObjectsView(scene);
    view.update([solid()], []);
    const first = scene.children.find((c) => c.name.startsWith('drawn-solid'));
    for (let i = 0; i < 60; i++) view.update([solid()], []);
    expect(owned(scene)).toHaveLength(1);
    expect(scene.children.find((c) => c.name.startsWith('drawn-solid'))).toBe(first);
  });

  it('removes the mesh when the structure is gone', () => {
    const scene = new Scene();
    const view = createDrawnObjectsView(scene);
    view.update([solid({ id: 1 }), solid({ id: 2 })], []);
    expect(standing(scene)).toHaveLength(2);
    view.update([solid({ id: 2 })], []);
    expect(standing(scene)).toEqual(['drawn-solid-2']);
  });

  it('leaks nothing over many appearances and disappearances', () => {
    const scene = new Scene();
    const view = createDrawnObjectsView(scene);
    for (let i = 0; i < 50; i++) {
      view.update([solid({ id: i })], []);
      // Let each collapse finish before the next arrives, so what is left is
      // the one structure standing rather than a backlog of effects.
      for (let f = 0; f < 60; f++) view.advance(1 / 60);
    }
    expect(owned(scene)).toHaveLength(1);
    view.update([], []);
    for (let f = 0; f < 60; f++) view.advance(1 / 60);
    expect(owned(scene)).toEqual([]);
  });

  it('sizes a bridge differently from a wall, as their footprints differ', () => {
    const scene = new Scene();
    createDrawnObjectsView(scene).update(
      [
        solid({ id: 1, blueprintId: 'wall', halfExtents: { x: 1, y: 1.25, z: 0.1 } }),
        solid({ id: 2, blueprintId: 'bridge', halfExtents: { x: 0.75, y: 0.1, z: 2 } }),
      ],
      [],
    );
    expect(owned(scene)).toHaveLength(2);
  });

  it('clears everything it owns when disposed', () => {
    const scene = new Scene();
    const view = createDrawnObjectsView(scene);
    view.update([solid()], [ghost()]);
    view.dispose();
    expect(owned(scene)).toEqual([]);
  });
});

describe('the ghost reads as pending', () => {
  it('shows a mesh for a ghost awaiting its verdict', () => {
    const scene = new Scene();
    createDrawnObjectsView(scene).update([], [ghost()]);
    expect(scene.children.filter((c) => c.name.startsWith('drawn-ghost'))).toHaveLength(1);
  });

  it('draws it see-through, so it cannot be mistaken for a real wall', () => {
    const scene = new Scene();
    createDrawnObjectsView(scene).update([], [ghost()]);
    const mesh = scene.children.find((c) => c.name.startsWith('drawn-ghost'));
    const material = (mesh as { material?: { transparent?: boolean; opacity?: number } }).material;
    expect(material?.transparent).toBe(true);
    expect(material?.opacity).toBeLessThan(1);
  });

  it('takes the ghost away once it is confirmed', () => {
    const scene = new Scene();
    const view = createDrawnObjectsView(scene);
    view.update([], [ghost()]);
    view.update([solid()], []);
    expect(scene.children.filter((c) => c.name.startsWith('drawn-ghost'))).toHaveLength(0);
    expect(scene.children.filter((c) => c.name.startsWith('drawn-solid'))).toHaveLength(1);
  });
});

describe('quality is visible on a structure too', () => {
  it('gives the three bands three different looks', () => {
    const scene = new Scene();
    createDrawnObjectsView(scene).update(
      [
        solid({ id: 1, quality: 'crude' }),
        solid({ id: 2, quality: 'sound' }),
        solid({ id: 3, quality: 'keen' }),
      ],
      [],
    );
    const colours = scene.children
      .filter((c) => c.name.startsWith('drawn-solid'))
      .map((c) => (c as { material?: { color?: { getHex(): number } } }).material?.color?.getHex());
    expect(new Set(colours).size).toBe(3);
  });

  it('rebuilds a structure whose grade changed, and only then', () => {
    const scene = new Scene();
    const view = createDrawnObjectsView(scene);
    view.update([solid({ quality: 'crude' })], []);
    const crude = scene.children.find((c) => c.name.startsWith('drawn-solid'));
    view.update([solid({ quality: 'crude' })], []);
    expect(scene.children.find((c) => c.name.startsWith('drawn-solid'))).toBe(crude);
    view.update([solid({ quality: 'keen' })], []);
    expect(scene.children.find((c) => c.name.startsWith('drawn-solid'))).not.toBe(crude);
  });
});

/**
 * The loop ends in loss (CLAUDE.md §25). A wall that blinked out of existence
 * would spend that moment on nothing, so a destroyed structure settles and
 * fades instead. A greybox stand-in for the real effect at Phase 6.
 */
describe('a destroyed structure collapses', () => {
  it('leaves something behind when a structure goes', () => {
    const scene = new Scene();
    const view = createDrawnObjectsView(scene);
    view.update([solid()], []);
    view.update([], []);
    expect(view.collapsing).toBe(1);
    expect(scene.children.filter((c) => c.name.startsWith('drawn-collapse'))).toHaveLength(1);
  });

  it('fades it out and then frees it', () => {
    const scene = new Scene();
    const view = createDrawnObjectsView(scene);
    view.update([solid()], []);
    view.update([], []);
    for (let i = 0; i < 60; i++) view.advance(1 / 60);
    expect(view.collapsing).toBe(0);
    expect(owned(scene)).toEqual([]);
  });

  it('sinks it as it goes, rather than bursting', () => {
    const scene = new Scene();
    const view = createDrawnObjectsView(scene);
    view.update([solid()], []);
    view.update([], []);
    view.advance(0.2);
    const mesh = scene.children.find((c) => c.name.startsWith('drawn-collapse'));
    expect(mesh?.scale.y).toBeLessThan(1);
    expect(mesh?.scale.x).toBe(1);
  });

  it('collapses several at once without confusing them', () => {
    const scene = new Scene();
    const view = createDrawnObjectsView(scene);
    view.update([solid({ id: 1 }), solid({ id: 2 }), solid({ id: 3 })], []);
    view.update([solid({ id: 2 })], []);
    expect(view.collapsing).toBe(2);
    for (let i = 0; i < 60; i++) view.advance(1 / 60);
    expect(view.collapsing).toBe(0);
    expect(owned(scene)).toHaveLength(1);
  });

  it('does not resurrect a structure that is rebuilt while the old one fades', () => {
    const scene = new Scene();
    const view = createDrawnObjectsView(scene);
    view.update([solid({ id: 1 })], []);
    view.update([], []);
    view.update([solid({ id: 1 })], []);
    expect(scene.children.filter((c) => c.name.startsWith('drawn-solid'))).toHaveLength(1);
    for (let i = 0; i < 60; i++) view.advance(1 / 60);
    expect(owned(scene)).toHaveLength(1);
  });

  it('frees a collapse still in flight when disposed', () => {
    const scene = new Scene();
    const view = createDrawnObjectsView(scene);
    view.update([solid()], []);
    view.update([], []);
    view.dispose();
    expect(owned(scene)).toEqual([]);
  });
});
