import { describe, expect, it } from 'vitest';
import { ECONOMY } from '../config/economy';
import type { BlueprintId } from './blueprint';
import { BLUEPRINTS } from './blueprints/registry';
import { CORPUS, type Fixture } from './fixtures';
import { validateSketch } from './validate';

/**
 * The acceptance suite for Phase 3 (plan T3; ROADMAP exit criteria 5 and 9).
 *
 * Every fixture declares what a person would say it is and what the validator
 * must do with it, so these tests assert the design rather than whatever the
 * code currently happens to produce. The rule that matters most is the last
 * one: a misread is never acceptable, a refusal always is.
 */

const RICH = { heldChalk: ECONOMY.chalk.max };
const outcomeOf = (f: Fixture) => validateSketch(f.sketch, RICH);

/** The blueprint a fixture was actually read as, or null if it was refused. */
function readAs(f: Fixture): BlueprintId | null {
  const outcome = outcomeOf(f);
  return outcome.kind === 'unrecognized' ? null : outcome.blueprintId;
}

describe('the corpus itself', () => {
  it('covers every outcome the validator can reach from a sketch', () => {
    const kinds = new Set(CORPUS.map((f) => f.outcome));
    expect([...kinds].sort()).toEqual(['created', 'smudged', 'unrecognized']);
  });

  it('covers all three quality bands, so SPEC 6.5 stays exercised', () => {
    const bands = CORPUS.filter((f) => f.quality).map((f) => f.quality);
    expect(new Set(bands)).toEqual(new Set(['crude', 'sound', 'keen']));
  });

  it('is big enough on both sides to be worth running', () => {
    expect(CORPUS.filter((f) => f.intent !== null).length).toBeGreaterThanOrEqual(10);
    expect(CORPUS.filter((f) => f.intent === null).length).toBeGreaterThanOrEqual(8);
  });

  it('gives every fixture a distinct name', () => {
    expect(new Set(CORPUS.map((f) => f.name)).size).toBe(CORPUS.length);
  });

  it('is deterministic: the same fixture validates the same way every time', () => {
    for (const fixture of CORPUS) {
      expect(outcomeOf(fixture)).toEqual(outcomeOf(fixture));
    }
  });
});

describe('every fixture reaches the outcome it was built for', () => {
  it.each(CORPUS.map((f) => [f.name, f] as const))('%s', (_name, fixture) => {
    const outcome = outcomeOf(fixture);
    const failures = outcome.kind === 'smudged' ? outcome.failures.map((x) => x.code) : [];
    expect(outcome.kind, `failures: ${failures.join(', ') || 'none'}`).toBe(fixture.outcome);
  });
});

describe('accuracy bands (SPEC 6.5)', () => {
  it.each(CORPUS.filter((f) => f.quality).map((f) => [f.name, f] as const))(
    '%s lands in its band',
    (_name, fixture) => {
      const outcome = outcomeOf(fixture);
      expect(outcome.kind).toBe('created');
      if (outcome.kind !== 'created') return;
      expect(outcome.quality, `accuracy ${outcome.accuracy.toFixed(3)}`).toBe(fixture.quality);
    },
  );

  it('ranks a pristine sword above a hasty one', () => {
    const accuracyOf = (name: string): number => {
      const fixture = CORPUS.find((f) => f.name === name);
      const outcome = fixture ? outcomeOf(fixture) : undefined;
      return outcome && 'accuracy' in outcome ? outcome.accuracy : NaN;
    };
    expect(accuracyOf('sword-pristine')).toBeGreaterThan(accuracyOf('sword-clean'));
    expect(accuracyOf('sword-clean')).toBeGreaterThan(accuracyOf('sword-wobbly-hand'));
    expect(accuracyOf('sword-wobbly-hand')).toBeGreaterThan(accuracyOf('sword-hasty-tilt'));
  });
});

describe('the confusion matrix', () => {
  /** intent (or 'nothing') → what it was read as → how many times. */
  function buildMatrix(): Map<string, Map<string, number>> {
    const matrix = new Map<string, Map<string, number>>();
    for (const fixture of CORPUS) {
      const from = fixture.intent ?? 'nothing';
      const to = readAs(fixture) ?? 'refused';
      const row = matrix.get(from) ?? new Map<string, number>();
      row.set(to, (row.get(to) ?? 0) + 1);
      matrix.set(from, row);
    }
    return matrix;
  }

  it('reads every sword as a sword, or refuses it — never as something else', () => {
    const row = buildMatrix().get('sword');
    expect([...(row?.keys() ?? [])].sort()).toEqual(['sword']);
  });

  it('refuses everything that is not a blueprint', () => {
    const row = buildMatrix().get('nothing');
    expect([...(row?.keys() ?? [])]).toEqual(['refused']);
  });

  it('has zero misclassifications across the whole corpus', () => {
    const misreads = CORPUS.filter((f) => {
      const was = readAs(f);
      return was !== null && was !== f.intent;
    });
    expect(misreads.map((f) => f.name)).toEqual([]);
  });
});

describe('refusal is always allowed, a misread never is', () => {
  it('never creates anything from a sketch that is not a blueprint', () => {
    const created = CORPUS.filter((f) => f.intent === null && outcomeOf(f).kind === 'created');
    expect(created.map((f) => f.name)).toEqual([]);
  });

  it('only ever creates or smudges the blueprint the fixture intended', () => {
    for (const fixture of CORPUS) {
      const outcome = outcomeOf(fixture);
      if (outcome.kind === 'created' || outcome.kind === 'smudged') {
        expect(outcome.blueprintId).toBe(fixture.intent);
      }
    }
  });

  it('explains a smudge, or at least grades it, so the UI has something to say', () => {
    for (const fixture of CORPUS) {
      const outcome = outcomeOf(fixture);
      if (outcome.kind !== 'smudged') continue;
      // Either a named structural failure, or an accuracy under the threshold.
      const threshold = BLUEPRINTS.find((b) => b.id === outcome.blueprintId)?.minAccuracy ?? 1;
      const explained = outcome.failures.length > 0 || outcome.accuracy < threshold;
      expect(explained, `${fixture.name} smudged with nothing to say`).toBe(true);
    }
  });
});
