import { ECONOMY } from '../../config/economy';
import type { BlueprintTemplate } from '../blueprint';
import {
  direction,
  humanLikeness,
  intersection,
  relativeLength,
  straightness,
  timing,
} from '../constraints';

/**
 * The sword: a tall blade with a short guard crossing it low (SPEC §7.1).
 *
 * Two strokes, in the order the Codex teaches: blade first, top to bottom,
 * then the guard across it. Draw direction does not matter — every constraint
 * is undirected — but stroke *order* does, because the Codex teaches it.
 */
export const SWORD: BlueprintTemplate = {
  id: 'sword',
  chalkCost: ECONOMY.blueprintCost.sword,
  minAccuracy: 0.6,

  reference: [
    [
      { x: 0, y: 0.5 },
      { x: 0, y: -0.5 },
    ],
    [
      { x: -0.185, y: -0.25 },
      { x: 0.185, y: -0.25 },
    ],
  ],

  // Used by classification (ARCHITECTURE §6.3), asserted distinct by test.
  discriminators: {
    strokeCount: 2,
    hasIntersection: true,
    hasClosure: false,
    aspect: 'tall',
    dominantAngles: [-Math.PI / 2, 0], // blade vertical, guard horizontal
  },

  // Used by grading (ARCHITECTURE §6.4).
  constraints: [
    straightness(0, 0.9), // the blade is a straight line
    direction(0, -90, 25), // and roughly vertical
    straightness(1, 0.85), // the guard is straighter still, being shorter
    direction(1, 0, 25), // and roughly horizontal
    intersection(0, 1, { at: [0.1, 0.4] }), // crossing low on the blade, from its hilt end
    relativeLength(1, 0, [0.25, 0.55]), // a guard, not a second blade
    timing({ minMs: 250, maxMs: 6000 }),
    humanLikeness(),
  ],

  spawn: { kind: 'weapon', asset: 'CB_WEAPON_Sword_A' },
};
