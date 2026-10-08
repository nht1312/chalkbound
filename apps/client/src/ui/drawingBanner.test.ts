import type { DrawingResult, DrawingResultOutcome, FailureCode } from '@chalkbound/shared';
import { describe, expect, it } from 'vitest';
import { describeDrawingResult, failureDetail } from './drawingBanner';

const result = (outcome: DrawingResultOutcome, chalkDebited = 0): DrawingResult => ({
  outcome,
  chalkDebited,
});

const smudge = (failures: readonly FailureCode[]): DrawingResult =>
  result({ kind: 'smudged', blueprintId: 'sword', accuracy: 0.5, failures }, 5);

describe('describeDrawingResult: created', () => {
  it('names the blueprint and the quality it was drawn at', () => {
    const message = describeDrawingResult(
      result({ kind: 'created', blueprintId: 'sword', accuracy: 0.95, quality: 'keen' }, 20),
    );
    expect(message.tone).toBe('created');
    expect(message.title).toBe('SWORD — Keen');
  });

  it('names every quality band', () => {
    const titleAt = (quality: 'crude' | 'sound' | 'keen'): string =>
      describeDrawingResult(
        result({ kind: 'created', blueprintId: 'sword', accuracy: 0.8, quality }, 20),
      ).title;
    expect(titleAt('crude')).toBe('SWORD — Crude');
    expect(titleAt('sound')).toBe('SWORD — Sound');
    expect(titleAt('keen')).toBe('SWORD — Keen');
  });

  it('shows what the creation cost', () => {
    const message = describeDrawingResult(
      result({ kind: 'created', blueprintId: 'sword', accuracy: 0.8, quality: 'sound' }, 20),
    );
    expect(message.cost).toBe('−20 chalk');
  });
});

describe('describeDrawingResult: smudged', () => {
  it('names the part of the shape that went wrong', () => {
    const message = describeDrawingResult(smudge(['no-intersection']));
    expect(message.tone).toBe('smudged');
    expect(message.detail).toBe('The crossguard didn’t cross the blade');
  });

  it('says where the crossguard landed when it crossed in the wrong place', () => {
    expect(describeDrawingResult(smudge(['intersection-misplaced'])).detail).toMatch(/crossguard/i);
    expect(describeDrawingResult(smudge(['intersection-misplaced'])).detail).not.toBe(
      describeDrawingResult(smudge(['no-intersection'])).detail,
    );
  });

  it('gives each failure code its own wording', () => {
    const codes: FailureCode[] = [
      'stroke-count',
      'missing-stroke',
      'not-straight',
      'wrong-direction',
      'wrong-relative-length',
      'no-intersection',
      'intersection-misplaced',
      'endpoints-apart',
      'not-closed',
      'wrong-aspect',
      'off-template',
      'bad-timing',
      'inhuman',
    ];
    const details = codes.map((code) => failureDetail('sword', code));
    expect(new Set(details).size).toBe(codes.length);
    for (const detail of details) expect(detail.length).toBeGreaterThan(0);
  });

  it('leads with the most actionable failure, not the first reported', () => {
    // A blade that wobbles *and* a crossguard that missed: the crossguard is
    // the thing worth fixing, and it is reported second.
    const message = describeDrawingResult(smudge(['not-straight', 'no-intersection']));
    expect(message.detail).toBe(failureDetail('sword', 'no-intersection'));
  });

  it('ranks a misplaced crossguard above a crooked line', () => {
    expect(describeDrawingResult(smudge(['not-straight', 'intersection-misplaced'])).detail).toBe(
      failureDetail('sword', 'intersection-misplaced'),
    );
  });

  it('falls back when the shape missed on accuracy with nothing named', () => {
    // Possible per SPEC_AUDIT D-07 (f): every constraint passes, the weighted
    // accuracy still misses the threshold.
    const message = describeDrawingResult(smudge([]));
    expect(message.tone).toBe('smudged');
    expect(message.detail.length).toBeGreaterThan(0);
    expect(message.title).toBe('Smudged');
  });

  it('shows the smaller cost of a smudge', () => {
    expect(describeDrawingResult(smudge(['no-intersection'])).cost).toBe('−5 chalk');
  });
});

describe('describeDrawingResult: unrecognized', () => {
  it('says it could not read the sketch rather than guessing', () => {
    const message = describeDrawingResult(
      result({ kind: 'unrecognized', reason: 'below-floor' }, 5),
    );
    expect(message.tone).toBe('unrecognized');
    expect(message.title).toBe('Unreadable');
    expect(message.detail.length).toBeGreaterThan(0);
  });

  it('distinguishes nothing-matched from too-close-to-call', () => {
    const below = describeDrawingResult(result({ kind: 'unrecognized', reason: 'below-floor' }, 5));
    const ambiguous = describeDrawingResult(
      result({ kind: 'unrecognized', reason: 'ambiguous' }, 5),
    );
    expect(ambiguous.detail).not.toBe(below.detail);
  });

  it('never names a blueprint, even when one was the closest match', () => {
    const message = describeDrawingResult(
      result({ kind: 'unrecognized', reason: 'ambiguous', bestCandidate: 'sword' }, 5),
    );
    expect(message.title).not.toMatch(/sword/i);
    expect(message.detail).not.toMatch(/sword/i);
  });
});

describe('describeDrawingResult: unaffordable', () => {
  it('says how much the blueprint needs and how much the player had', () => {
    const message = describeDrawingResult(
      result({ kind: 'unaffordable', blueprintId: 'sword', required: 20, held: 3 }, 3),
    );
    expect(message.tone).toBe('unaffordable');
    expect(message.title).toBe('Not enough chalk');
    expect(message.detail).toContain('20');
    expect(message.detail).toContain('3');
  });
});

describe('describeDrawingResult: cost', () => {
  it('says nothing about cost when nothing was taken', () => {
    expect(
      describeDrawingResult(result({ kind: 'unrecognized', reason: 'below-floor' }, 0)).cost,
    ).toBe('');
  });

  it('uses a minus sign, not a hyphen, so it reads as a debit', () => {
    expect(describeDrawingResult(smudge(['no-intersection'])).cost.startsWith('−')).toBe(true);
  });
});
