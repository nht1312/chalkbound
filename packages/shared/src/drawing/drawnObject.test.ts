import { describe, expect, it } from 'vitest';
import { CREATION } from '../config/creation';
import { vec3 } from '../math/vec';
import type { Quality } from './blueprint';
import { damage, isDestroyed, scaledStat, type DrawnStructure } from './drawnObject';

describe('scaledStat', () => {
  it.each([
    ['crude', 0.7],
    ['sound', 1],
    ['keen', 1.3],
  ] as const)('scales a %s object by its band', (quality, factor) => {
    expect(scaledStat(100, quality)).toBe(Math.round(100 * factor));
  });

  it('never returns a fraction of a hit point', () => {
    for (const quality of ['crude', 'sound', 'keen'] as const) {
      expect(Number.isInteger(scaledStat(CREATION.sword.durability, quality))).toBe(true);
    }
  });

  it('leaves a sound object on exactly its base stats', () => {
    expect(scaledStat(CREATION.wall.health, 'sound')).toBe(CREATION.wall.health);
  });

  it('ranks the bands, so a better drawing is never a worse object', () => {
    const bands: Quality[] = ['crude', 'sound', 'keen'];
    const values = bands.map((q) => scaledStat(50, q));
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(new Set(values).size).toBe(bands.length);
  });

  it('keeps even the crudest object worth having', () => {
    // SPEC §6.5: crude is "functional, reduced durability", not broken.
    expect(scaledStat(CREATION.sword.durability, 'crude')).toBeGreaterThan(0);
  });
});

describe('damage and destruction', () => {
  const structure = (health: number): DrawnStructure => ({
    kind: 'structure',
    id: 1,
    blueprintId: 'wall',
    asset: 'CB_DRAWN_Wall_A',
    quality: 'sound',
    accuracy: 0.8,
    transform: { position: vec3(0, 0, 0), yaw: 0 },
    halfExtents: vec3(1, 1.25, 0.1),
    solidFromTick: 10,
    drawnBy: 7,
    health,
    maxHealth: health,
  });

  it('takes hit points off', () => {
    const wall = structure(60);
    damage(wall, 25);
    expect(wall.health).toBe(35);
  });

  it('is destroyed once its health reaches zero, not before', () => {
    const wall = structure(60);
    damage(wall, 59);
    expect(isDestroyed(wall)).toBe(false);
    damage(wall, 1);
    expect(isDestroyed(wall)).toBe(true);
  });

  it('never reports negative health, however hard it is hit', () => {
    const wall = structure(40);
    damage(wall, 1000);
    expect(wall.health).toBe(0);
  });

  it('ignores a hit on something already destroyed, rather than erroring', () => {
    const wall = structure(10);
    damage(wall, 10);
    damage(wall, 10);
    expect(wall.health).toBe(0);
  });

  it('ignores a meaningless amount rather than healing', () => {
    const wall = structure(30);
    damage(wall, -5);
    damage(wall, 0);
    damage(wall, Number.NaN);
    expect(wall.health).toBe(30);
  });
});
