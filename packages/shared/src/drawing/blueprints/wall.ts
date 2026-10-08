import { ECONOMY } from '../../config/economy';
import type { BlueprintTemplate } from '../blueprint';
import { aspectRatio, closure, humanLikeness, templateDistance, timing } from '../constraints';

/**
 * One loop around a wide box. It begins half way along the bottom edge purely
 * so that the sample which closes the loop lands on the shape's axis of
 * symmetry: closing on a corner weights that corner twice and tilts the
 * measured principal axis a couple of degrees off horizontal, for no reason a
 * player could ever see.
 */
const REFERENCE = [
  [
    { x: 0, y: -0.25 },
    { x: 0.5, y: -0.25 },
    { x: 0.5, y: 0.25 },
    { x: -0.5, y: 0.25 },
    { x: -0.5, y: -0.25 },
    { x: 0, y: -0.25 },
  ],
];

/**
 * The wall: one closed stroke boxing in a wide rectangle (SPEC §7.2).
 *
 * Closure is what separates it from everything else the game knows. The hard
 * filter already demands a loop, so the `Closure` constraint here is set
 * tighter than the filter's own threshold — otherwise it could never fail and
 * would only pad the grade. Between the two sits a box the player meant to
 * close and did not, which is worth saying out loud.
 *
 * It has no start corner. A loop has no canonical beginning, and
 * `meanTemplateDistance` matches closed strokes at every rotation (T1a), so
 * any corner and either direction draw the same wall.
 */
export const WALL: BlueprintTemplate = {
  id: 'wall',
  chalkCost: ECONOMY.blueprintCost.wall,
  minAccuracy: 0.6,

  reference: REFERENCE,

  discriminators: {
    strokeCount: 1,
    hasIntersection: false,
    hasClosure: true,
    aspect: 'wide',
    dominantAngles: [0],
  },

  constraints: [
    closure(0, 0.15),
    aspectRatio([1.4, 3.4]),
    templateDistance(REFERENCE, 0.3),
    timing({ minMs: 250, maxMs: 8000 }),
    humanLikeness(),
  ],

  spawn: { kind: 'structure', asset: 'CB_DRAWN_Wall_A' },
};
