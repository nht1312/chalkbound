import { ECONOMY } from '../../config/economy';
import type { BlueprintTemplate } from '../blueprint';
import {
  aspectRatio,
  direction,
  humanLikeness,
  relativeLength,
  straightness,
  templateDistance,
  timing,
} from '../constraints';

const REFERENCE = [
  [
    { x: -0.5, y: 0.1 },
    { x: 0.5, y: 0.1 },
  ],
  [
    { x: -0.5, y: -0.1 },
    { x: 0.5, y: -0.1 },
  ],
];

/**
 * The bridge: two long horizontal rails, one above the other, never touching
 * (SPEC §7.3). Separated from the sword by the crossing its strokes do not
 * make, and by a box that is wide rather than tall.
 *
 * Its two rails are interchangeable, which no other blueprint's strokes are:
 * the sword's guard is told from its blade by length, so drawing them the
 * wrong way round fails on its own merits. Nothing distinguishes these rails
 * but which was drawn first, and "upper first" is a convention, not a shape.
 * The taught gap is therefore kept narrow enough that the two orderings stay
 * close under template matching: drawing the lower rail first still reads as
 * a bridge, one quality band down, instead of being refused outright. A
 * wider-than-usual gap drawn in the untaught order is still refused.
 */
export const BRIDGE: BlueprintTemplate = {
  id: 'bridge',
  chalkCost: ECONOMY.blueprintCost.bridge,
  minAccuracy: 0.6,

  reference: REFERENCE,

  discriminators: {
    strokeCount: 2,
    hasIntersection: false,
    hasClosure: false,
    aspect: 'wide',
    dominantAngles: [0, 0],
  },

  constraints: [
    straightness(0, 0.9),
    straightness(1, 0.9),
    direction(0, 0, 22),
    direction(1, 0, 22),
    relativeLength(1, 0, [0.6, 1.7]),
    aspectRatio([1.8, 7]),
    templateDistance(REFERENCE, 0.3),
    timing({ minMs: 250, maxMs: 8000 }),
    humanLikeness(),
  ],

  spawn: { kind: 'structure', asset: 'CB_DRAWN_Bridge_A' },
};
