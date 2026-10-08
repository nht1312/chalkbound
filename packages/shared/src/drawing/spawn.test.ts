import { describe, expect, it } from 'vitest';
import { CREATION } from '../config/creation';
import { BLUEPRINTS, blueprintById } from './blueprints/registry';
import { vec3 } from '../math/vec';
import { spawnDrawnObject, type SpawnRequest } from './spawn';
import type { BlueprintId } from './blueprint';

const REQUEST: SpawnRequest = {
  id: 42,
  tick: 900,
  playerId: 7,
  feet: vec3(0, 0, 0),
  yaw: 0,
};

const spawn = (id: BlueprintId, quality: 'crude' | 'sound' | 'keen' = 'sound', accuracy = 0.8) => {
  const blueprint = blueprintById(id);
  if (!blueprint) throw new Error(`no blueprint ${id}`);
  return spawnDrawnObject(blueprint, { quality, accuracy }, REQUEST);
};

describe('the spawn registry', () => {
  it('builds something for every blueprint the game knows', () => {
    // The guard that keeps "add a blueprint, register a spawn" honest: a new
    // blueprint with no construction must fail here, not in a player's hands.
    for (const blueprint of BLUEPRINTS) {
      expect(() => spawnDrawnObject(blueprint, { quality: 'sound', accuracy: 0.8 }, REQUEST))
        .not.toThrow();
    }
  });

  it('stamps every object with the tick it became real (R-03)', () => {
    for (const blueprint of BLUEPRINTS) {
      expect(spawn(blueprint.id).solidFromTick).toBe(REQUEST.tick);
    }
  });

  it('carries the id, the asset name and the grade through', () => {
    const sword = spawn('sword', 'keen', 0.95);
    expect(sword.id).toBe(REQUEST.id);
    expect(sword.blueprintId).toBe('sword');
    expect(sword.asset).toBe('CB_WEAPON_Sword_A');
    expect(sword.quality).toBe('keen');
    expect(sword.accuracy).toBeCloseTo(0.95, 9);
  });
});

describe('weapons go to the hands', () => {
  it('makes the sword a weapon owned by the player who drew it', () => {
    const sword = spawn('sword');
    expect(sword.kind).toBe('weapon');
    if (sword.kind !== 'weapon') return;
    expect(sword.ownerId).toBe(REQUEST.playerId);
  });

  it('gives it durability scaled by how well it was drawn', () => {
    for (const [quality, factor] of [
      ['crude', 0.7],
      ['sound', 1],
      ['keen', 1.3],
    ] as const) {
      const sword = spawn('sword', quality);
      if (sword.kind !== 'weapon') throw new Error('expected a weapon');
      expect(sword.durability).toBe(Math.round(CREATION.sword.durability * factor));
      expect(sword.durability).toBe(sword.maxDurability);
    }
  });
});

describe('structures go to the world', () => {
  it.each([['wall'], ['bridge']] as const)('makes the %s a structure', (id) => {
    expect(spawn(id).kind).toBe('structure');
  });

  it('gives a wall its spec health and stands it ahead of the player', () => {
    const wall = spawn('wall');
    if (wall.kind !== 'structure') throw new Error('expected a structure');
    expect(wall.health).toBe(CREATION.wall.health);
    expect(wall.maxHealth).toBe(CREATION.wall.health);
    expect(wall.halfExtents.x).toBeCloseTo(CREATION.wall.width / 2, 9);
    expect(wall.halfExtents.y).toBeCloseTo(CREATION.wall.height / 2, 9);
    // Facing -Z at yaw 0, and standing on the floor the player stands on.
    expect(wall.transform.position.z).toBeLessThan(0);
    expect(wall.transform.position.y).toBeCloseTo(CREATION.wall.height / 2, 9);
  });

  it('lays a bridge flat, with its span reaching away from the player', () => {
    const bridge = spawn('bridge');
    if (bridge.kind !== 'structure') throw new Error('expected a structure');
    expect(bridge.health).toBe(CREATION.bridge.health);
    expect(bridge.halfExtents.z).toBeCloseTo(CREATION.bridge.span / 2, 9);
    expect(bridge.halfExtents.x).toBeCloseTo(CREATION.bridge.width / 2, 9);
    // Its top is level with the feet that drew it, so it can be stepped onto.
    expect(bridge.transform.position.y).toBeCloseTo(-CREATION.bridge.thickness / 2, 9);
  });

  it('scales a structure’s health by quality, like a weapon’s durability', () => {
    const crude = spawn('wall', 'crude');
    const keen = spawn('wall', 'keen');
    if (crude.kind !== 'structure' || keen.kind !== 'structure') throw new Error('structures');
    expect(crude.health).toBeLessThan(CREATION.wall.health);
    expect(keen.health).toBeGreaterThan(CREATION.wall.health);
  });

  it('records who drew it without letting that change anything (RD-07)', () => {
    const a = spawn('wall');
    const b = spawnDrawnObject(
      blueprintById('wall')!,
      { quality: 'sound', accuracy: 0.8 },
      { ...REQUEST, playerId: 99 },
    );
    if (a.kind !== 'structure' || b.kind !== 'structure') throw new Error('structures');
    expect(a.drawnBy).toBe(7);
    expect(b.drawnBy).toBe(99);
    // Everything that governs behaviour is identical whoever drew it.
    expect({ ...a, drawnBy: 0 }).toEqual({ ...b, drawnBy: 0 });
  });

  it('turns a structure to face whoever drew it', () => {
    const wall = spawn('wall');
    if (wall.kind !== 'structure') throw new Error('expected a structure');
    expect(wall.transform.yaw).toBeCloseTo(REQUEST.yaw, 9);
  });
});
