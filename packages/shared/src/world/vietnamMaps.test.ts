import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  VIETNAM_MAPS,
  getVietnamLevel,
  type VietnamMapId,
} from './vietnamMaps';
import { createStaticWorld } from '../physics/staticWorld';

beforeAll(async () => {
  await RAPIER.init();
});

describe('Vietnam Maps Level Data', () => {
  const mapIds: VietnamMapId[] = [
    'vietnam_quoc_hoc_hue',
    'vietnam_chu_van_an_hanoi',
    'vietnam_da_lat_lycee',
  ];

  it('provides all 3 iconic Vietnamese map metadata entries', () => {
    expect(Object.keys(VIETNAM_MAPS)).toHaveLength(3);
    expect(VIETNAM_MAPS.vietnam_quoc_hoc_hue.name).toContain('Quốc Học');
    expect(VIETNAM_MAPS.vietnam_chu_van_an_hanoi.name).toContain('Chu Van An');
    expect(VIETNAM_MAPS.vietnam_da_lat_lycee.name).toContain('Lycée Yersin');
  });

  mapIds.forEach((id) => {
    describe(`Map: ${id}`, () => {
      const level = getVietnamLevel(id);

      it('has valid non-empty geometry boxes', () => {
        expect(level.boxes.length).toBeGreaterThan(10);
        for (const box of level.boxes) {
          expect(box.id).toBeTruthy();
          expect(['floor', 'wall', 'blackboard', 'desk']).toContain(box.kind);
          expect(box.halfExtents.x).toBeGreaterThan(0);
          expect(box.halfExtents.y).toBeGreaterThan(0);
          expect(box.halfExtents.z).toBeGreaterThan(0);
          expect(Number.isFinite(box.center.x)).toBe(true);
          expect(Number.isFinite(box.center.y)).toBe(true);
          expect(Number.isFinite(box.center.z)).toBe(true);
        }
      });

      it('has chalk box pickups with unique IDs and valid quantities', () => {
        expect(level.chalkBoxes.length).toBeGreaterThanOrEqual(5);
        const ids = new Set<number>();
        for (const chalk of level.chalkBoxes) {
          expect(ids.has(chalk.id)).toBe(false);
          ids.add(chalk.id);
          expect(chalk.amount ?? 25).toBeGreaterThan(0);
          expect(Number.isFinite(chalk.position.x)).toBe(true);
          expect(Number.isFinite(chalk.position.y)).toBe(true);
          expect(Number.isFinite(chalk.position.z)).toBe(true);
        }
      });

      it('has a valid player spawn point', () => {
        expect(Number.isFinite(level.spawn.x)).toBe(true);
        expect(Number.isFinite(level.spawn.y)).toBe(true);
        expect(Number.isFinite(level.spawn.z)).toBe(true);
        expect(level.spawn.y).toBeGreaterThanOrEqual(0);
      });

      it('instantiates cleanly inside Rapier physics static world', () => {
        const world = createStaticWorld(RAPIER, level.boxes);
        expect(world.colliders.len()).toBe(level.boxes.length);
        world.free();
      });
    });
  });

  it('throws on unknown map id', () => {
    // @ts-expect-error test invalid ID
    expect(() => getVietnamLevel('invalid_map_id')).toThrow('Unknown Vietnam map id');
  });
});
