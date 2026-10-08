import { BLUEPRINTS, SWORD, type BlueprintTemplate } from '@chalkbound/shared';
import { describe, expect, it } from 'vitest';
import { blueprintDiagram, codexEntries, type CodexDiagramOptions } from './codex';

const options: CodexDiagramOptions = { size: 100, padding: 10, labelOffset: 8 };
/** The drawable span inside the padding. */
const INNER = options.size - options.padding * 2;

const diagram = (blueprint: BlueprintTemplate = SWORD) => blueprintDiagram(blueprint, options);
const allPoints = (blueprint?: BlueprintTemplate) =>
  diagram(blueprint).flatMap((stroke) => stroke.points);

describe('blueprintDiagram', () => {
  it('draws one polyline per stroke of the reference', () => {
    expect(diagram()).toHaveLength(SWORD.reference.length);
  });

  it('numbers the strokes from one, in the order the Codex teaches', () => {
    expect(diagram().map((stroke) => stroke.order)).toEqual([1, 2]);
  });

  it('keeps every point inside the box', () => {
    for (const point of allPoints()) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(options.size);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(options.size);
    }
  });

  it('fits the longer axis to the padded box', () => {
    const ys = allPoints().map((p) => p.y);
    expect(Math.min(...ys)).toBeCloseTo(options.padding, 6);
    expect(Math.max(...ys)).toBeCloseTo(options.padding + INNER, 6);
  });

  it('preserves the aspect rather than stretching to fill', () => {
    const points = allPoints();
    const width = Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x));
    const height = Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y));
    // A sword is tall: the blade fills the box, the guard does not.
    expect(height).toBeCloseTo(INNER, 6);
    expect(width).toBeLessThan(INNER);
    expect(width).toBeGreaterThan(0);
  });

  it('centres the shape across the short axis', () => {
    const xs = allPoints().map((p) => p.x);
    const centre = (Math.min(...xs) + Math.max(...xs)) / 2;
    expect(centre).toBeCloseTo(options.size / 2, 6);
  });

  it('flips the y axis, so the blade tip is drawn at the top', () => {
    // The reference has the blade running from y +0.5 (tip) to -0.5 (hilt);
    // in screen space the tip must come out with the smaller y.
    const blade = diagram()[0];
    const tip = blade?.points[0];
    const hilt = blade?.points.at(-1);
    expect(tip?.y ?? 0).toBeLessThan(hilt?.y ?? 0);
    expect(tip?.y).toBeCloseTo(options.padding, 6);
  });

  it('puts the crossguard low on the blade, where the blueprint has it', () => {
    const guard = diagram()[1]?.points[0];
    // Reference y -0.25 on a span of 1: three quarters of the way down.
    expect(guard?.y).toBeCloseTo(options.padding + INNER * 0.75, 6);
  });

  it('places each stroke number near where that stroke begins', () => {
    for (const stroke of diagram()) {
      const start = stroke.points[0];
      if (!start) throw new Error('expected a start point');
      const distance = Math.hypot(stroke.label.x - start.x, stroke.label.y - start.y);
      expect(distance).toBeCloseTo(options.labelOffset, 6);
    }
  });

  it('separates the stroke numbers, so they can both be read', () => {
    const [first, second] = diagram();
    if (!first || !second) throw new Error('expected two strokes');
    expect(
      Math.hypot(first.label.x - second.label.x, first.label.y - second.label.y),
    ).toBeGreaterThan(options.labelOffset);
  });

  it('survives a reference with no area without producing NaN', () => {
    const dot: BlueprintTemplate = { ...SWORD, reference: [[{ x: 0.3, y: 0.3 }]] };
    for (const point of allPoints(dot)) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
    }
  });

  it('centres a single point rather than pinning it to a corner', () => {
    const dot: BlueprintTemplate = { ...SWORD, reference: [[{ x: 0.3, y: 0.3 }]] };
    expect(allPoints(dot)[0]).toEqual({ x: options.size / 2, y: options.size / 2 });
  });

  it('skips a reference stroke with no points at all', () => {
    const sparse: BlueprintTemplate = { ...SWORD, reference: [[], [{ x: 0, y: 0 }]] };
    expect(blueprintDiagram(sparse, options)).toHaveLength(1);
  });
});

describe('codexEntries', () => {
  const cost = SWORD.chalkCost;

  it('lists every blueprint the game knows', () => {
    expect(codexEntries(100, BLUEPRINTS, options)).toHaveLength(BLUEPRINTS.length);
  });

  it('shows each blueprint with a readable name and its cost', () => {
    const [entry] = codexEntries(100, [SWORD], options);
    expect(entry?.id).toBe('sword');
    expect(entry?.name).toBe('Sword');
    expect(entry?.cost).toBe(cost);
  });

  it('marks a blueprint affordable only once the player can pay for it', () => {
    const affordableAt = (chalk: number | undefined): boolean =>
      codexEntries(chalk, [SWORD], options)[0]?.affordable ?? false;
    expect(affordableAt(cost + 1)).toBe(true);
    expect(affordableAt(cost)).toBe(true);
    expect(affordableAt(cost - 1)).toBe(false);
    expect(affordableAt(0)).toBe(false);
  });

  it('treats unknown chalk as unaffordable rather than as permission', () => {
    // Before the first snapshot the authority has not spoken.
    expect(codexEntries(undefined, [SWORD], options)[0]?.affordable).toBe(false);
  });

  it('carries the diagram, so the overlay draws the shape it teaches', () => {
    const [entry] = codexEntries(100, [SWORD], options);
    expect(entry?.strokes).toEqual(blueprintDiagram(SWORD, options));
  });
});
