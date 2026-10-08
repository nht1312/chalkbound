import type {
  BlueprintId,
  DrawingResult,
  DrawingResultOutcome,
  FailureCode,
  Quality,
} from '@chalkbound/shared';
import { blueprintName, blueprintParts } from '../drawing/blueprintNames';

/**
 * Turning a verdict into words (plan T7, SPEC §15).
 *
 * Under inference the player never confirmed what they were making, so the
 * game owes them two things on every submission: **what it read**, named out
 * loud so a misread is caught immediately rather than discovered in a fight
 * (SPEC_AUDIT R-11), and **what specifically went wrong** when it failed.
 * "That didn't work" teaches nothing and costs chalk; "the crossguard didn't
 * cross the blade" teaches the shape.
 *
 * All the copy lives here rather than on the authority, which sends only
 * stable failure codes (SPEC_AUDIT D-08 f).
 */
export interface DrawingMessage {
  readonly tone: DrawingResultOutcome['kind'];
  /** The headline: the blueprint and its quality, or why there isn't one. */
  readonly title: string;
  readonly detail: string;
  /** "−20 chalk", or empty when nothing was taken. */
  readonly cost: string;
}

const QUALITY_NAMES: Record<Quality, string> = {
  crude: 'Crude',
  sound: 'Sound',
  keen: 'Keen',
};

/**
 * Which failure to lead with when a sketch broke several rules at once.
 * Earlier is more actionable: a crossguard that missed the blade is a thing
 * the player can see and fix, while "not straight enough" is advice they
 * already knew. Codes absent from this list fall to the end.
 */
const PRIORITY: readonly FailureCode[] = [
  'no-intersection',
  'intersection-misplaced',
  'wrong-relative-length',
  'missing-stroke',
  'stroke-count',
  'wrong-direction',
  'not-straight',
  'endpoints-apart',
  'not-closed',
  'wrong-aspect',
  'bad-timing',
  'inhuman',
  'off-template',
];

/** What one failed constraint means for one blueprint, in the player's words. */
export function failureDetail(blueprintId: BlueprintId, code: FailureCode): string {
  const part = blueprintParts(blueprintId);
  switch (code) {
    case 'stroke-count':
      return `A ${blueprintName(blueprintId).toLowerCase()} is not that many strokes`;
    case 'missing-stroke':
      return `The ${part.cross} never arrived`;
    case 'not-straight':
      return `The ${part.main} wandered — keep the line straight`;
    case 'wrong-direction':
      return `The ${part.main} was leaning too far over`;
    case 'wrong-relative-length':
      return `The ${part.cross} was the wrong length for the ${part.main}`;
    case 'no-intersection':
      return `The ${part.cross} didn’t cross the ${part.main}`;
    case 'intersection-misplaced':
      return `The ${part.cross} crossed too far up the ${part.main}`;
    case 'endpoints-apart':
      return 'The lines didn’t meet where they should';
    case 'not-closed':
      return 'The shape never closed';
    case 'wrong-aspect':
      return 'The proportions were off';
    case 'bad-timing':
      return 'Drawn too fast to hold together';
    case 'inhuman':
      return 'That didn’t look hand-drawn';
    case 'off-template':
      return 'The shape drifted too far from the blueprint';
  }
}

export function describeDrawingResult(result: DrawingResult): DrawingMessage {
  const { outcome } = result;
  const cost = result.chalkDebited > 0 ? `−${result.chalkDebited} chalk` : '';

  switch (outcome.kind) {
    case 'created':
      return {
        tone: 'created',
        // Upper case because this is the moment the game tells the player
        // what it decided they made.
        title: `${blueprintName(outcome.blueprintId).toUpperCase()} — ${QUALITY_NAMES[outcome.quality]}`,
        detail: '',
        cost,
      };
    case 'smudged':
      return {
        tone: 'smudged',
        title: 'Smudged',
        detail: leadingFailure(outcome.blueprintId, outcome.failures),
        cost,
      };
    case 'unrecognized':
      return {
        tone: 'unrecognized',
        title: 'Unreadable',
        // Never names the closest candidate. Saying "that was almost a sword"
        // invites the player to argue with a refusal that already cost them
        // chalk, and the candidate is a diagnostic, not a judgement.
        detail:
          outcome.reason === 'ambiguous'
            ? 'That could have been two different things'
            : 'The chalk didn’t form anything you know',
        cost,
      };
    case 'unaffordable':
      return {
        tone: 'unaffordable',
        title: 'Not enough chalk',
        detail: `A ${blueprintName(outcome.blueprintId).toLowerCase()} needs ${outcome.required} — you had ${outcome.held}`,
        cost,
      };
  }
}

/**
 * Picks the one failure worth saying. A sketch that broke four rules gets one
 * sentence: a list of faults reads as the game piling on, and the player can
 * only fix one thing at a time anyway.
 */
function leadingFailure(blueprintId: BlueprintId, failures: readonly FailureCode[]): string {
  // Possible with no failures at all: every constraint can pass while the
  // weighted accuracy still misses the threshold (SPEC_AUDIT D-07 f).
  if (failures.length === 0) return 'It didn’t quite hold together';

  let best: FailureCode | undefined;
  let bestRank = Number.POSITIVE_INFINITY;
  for (const code of failures) {
    const rank = PRIORITY.indexOf(code);
    const effective = rank === -1 ? PRIORITY.length : rank;
    if (effective < bestRank) {
      bestRank = effective;
      best = code;
    }
  }
  return best ? failureDetail(blueprintId, best) : 'It didn’t quite hold together';
}

export interface DrawingBanner {
  show(message: DrawingMessage): void;
  /** Call each frame; hides the banner once it has been up long enough. */
  update(dt: number): void;
  dispose(): void;
}

/**
 * Centre-screen verdict after a submission. Shown immediately from the
 * client's own validation, then overwritten by the authority's answer — which
 * is the only one that counts, and almost always says the same thing.
 */
export function createDrawingBanner(parent: HTMLElement, holdSeconds: number): DrawingBanner {
  const doc = parent.ownerDocument;
  const root = doc.createElement('div');
  root.className = 'drawing-banner';
  root.hidden = true;
  const title = doc.createElement('div');
  title.className = 'drawing-banner__title';
  const detail = doc.createElement('div');
  detail.className = 'drawing-banner__detail';
  const cost = doc.createElement('div');
  cost.className = 'drawing-banner__cost';
  root.append(title, detail, cost);
  parent.appendChild(root);

  let remaining = 0;
  return {
    show(message) {
      root.hidden = false;
      root.dataset['tone'] = message.tone;
      title.textContent = message.title;
      detail.textContent = message.detail;
      detail.hidden = message.detail === '';
      cost.textContent = message.cost;
      cost.hidden = message.cost === '';
      remaining = holdSeconds;
    },
    update(dt) {
      if (remaining <= 0) return;
      remaining -= dt;
      if (remaining <= 0) root.hidden = true;
    },
    dispose() {
      root.remove();
    },
  };
}
