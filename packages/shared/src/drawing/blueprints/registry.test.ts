import { describe, expect, it } from 'vitest';
import { ECONOMY } from '../../config/economy';
import { discriminatorDistance, extractDiscriminators } from '../discriminators';
import { normalizeSketch } from '../normalize';
import type { PlanePoint, Sketch } from '../types';
import { BLUEPRINTS, blueprintById } from './registry';

/** Draws a blueprint's own reference shape as if a player had traced it exactly. */
function traceReference(id: (typeof BLUEPRINTS)[number]['id']): Sketch {
  const template = blueprintById(id);
  if (!template) throw new Error(`no blueprint ${id}`);
  let t = 0;
  const strokes = template.reference.map((points) => {
    const start = t;
    const sampled: PlanePoint[] = points.map((p, i) => ({ x: p.x, y: p.y, t: start + i * 40 }));
    t = start + (points.length - 1) * 40 + 120;
    return { points: sampled, durationMs: (points.length - 1) * 40 };
  });
  return { strokes, durationMs: t };
}

describe('the blueprint registry', () => {
  it('holds the whole MVP set (SPEC 7)', () => {
    expect(BLUEPRINTS.map((b) => b.id)).toEqual(['sword', 'wall', 'bridge']);
  });

  it('gives every blueprint a unique id', () => {
    expect(new Set(BLUEPRINTS.map((b) => b.id)).size).toBe(BLUEPRINTS.length);
  });

  it('looks a blueprint up by id, and reports an unknown one as missing', () => {
    expect(blueprintById('sword')?.id).toBe('sword');
    expect(blueprintById('halberd' as never)).toBeUndefined();
  });

  it('takes every chalk cost from the economy, so costs live in one place', () => {
    for (const blueprint of BLUEPRINTS) {
      expect(blueprint.chalkCost).toBe(ECONOMY.blueprintCost[blueprint.id]);
    }
  });

  it('declares a sane accuracy threshold and a reference shape for each blueprint', () => {
    for (const blueprint of BLUEPRINTS) {
      expect(blueprint.minAccuracy).toBeGreaterThan(0);
      expect(blueprint.minAccuracy).toBeLessThan(1);
      expect(blueprint.constraints.length).toBeGreaterThan(0);
      expect(blueprint.reference.length).toBe(blueprint.discriminators.strokeCount);
      for (const stroke of blueprint.reference) expect(stroke.length).toBeGreaterThanOrEqual(2);
    }
  });
});

/**
 * SPEC §6.3: every blueprint must differ from every other on at least two
 * discriminators. Trivially true with one blueprint; this is the guard that
 * matters from Phase 4, and it must fail CI rather than reach a player.
 */
describe('blueprint distinctness (SPEC 6.3)', () => {
  it('separates every pair on at least two discriminators', () => {
    for (let i = 0; i < BLUEPRINTS.length; i++) {
      for (let j = i + 1; j < BLUEPRINTS.length; j++) {
        const a = BLUEPRINTS[i];
        const b = BLUEPRINTS[j];
        if (!a || !b) continue;
        expect(
          discriminatorDistance(a.discriminators, b.discriminators),
          `${a.id} and ${b.id} are too alike to tell apart`,
        ).toBeGreaterThanOrEqual(2);
      }
    }
  });
});

/**
 * The declared discriminators are data a human writes, and the reference shape
 * is drawn separately. Nothing stops them drifting apart except this.
 */
describe('declared data matches the reference shape', () => {
  it.each(BLUEPRINTS.map((b) => [b.id] as const))(
    '%s: its own reference extracts the discriminators it declares',
    (id) => {
      const blueprint = blueprintById(id);
      const measured = extractDiscriminators(normalizeSketch(traceReference(id)));
      expect(measured.strokeCount).toBe(blueprint?.discriminators.strokeCount);
      expect(measured.hasIntersection).toBe(blueprint?.discriminators.hasIntersection);
      expect(measured.hasClosure).toBe(blueprint?.discriminators.hasClosure);
      expect(measured.aspect).toBe(blueprint?.discriminators.aspect);
      measured.dominantAngles.forEach((angle, i) =>
        expect(angle).toBeCloseTo(blueprint?.discriminators.dominantAngles[i] ?? NaN, 6),
      );
    },
  );

  it.each(BLUEPRINTS.map((b) => [b.id] as const))(
    '%s: its own reference satisfies every constraint it declares',
    (id) => {
      const blueprint = blueprintById(id);
      const drawing = normalizeSketch(traceReference(id));
      for (const constraint of blueprint?.constraints ?? []) {
        const result = constraint.evaluate(drawing);
        expect(result.passed, `${constraint.kind}: ${result.detail ?? ''}`).toBe(true);
      }
    },
  );
});
