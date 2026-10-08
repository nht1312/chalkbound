import type { BlueprintId, Quality } from './blueprint';
import { resampleStroke } from './normalize';
import type { PlanePoint, Point2, Sketch, Stroke } from './types';

/**
 * Synthetic sketch generation for the test corpus (plan T3, decision 4).
 *
 * Not exported from the package index: this is test and tooling support, and
 * it must never reach the client bundle. Every generator is seeded, so the
 * corpus is identical on every machine and in CI.
 *
 * The hand model matters. A real player's wobble is low-frequency — the arm
 * drifts, it does not vibrate — while the *timing* between samples is noisy.
 * Modelling it the other way round would produce sketches that fail
 * `Straightness` and pass `HumanLikeness` for exactly the wrong reasons.
 */

/** mulberry32: small, fast, and good enough for shaping fixtures. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface HandOptions {
  /** Points sampled along the stroke. */
  readonly samples?: number;
  /** Peak sideways drift, in plane metres. */
  readonly wobble?: number;
  /** Average milliseconds between samples. */
  readonly dt?: number;
}

/**
 * Traces `waypoints` the way a hand would: resampled evenly, pushed sideways
 * by a smooth low-frequency drift, and sampled at uneven intervals.
 */
export function handStroke(
  waypoints: readonly Point2[],
  rng: () => number,
  options: HandOptions = {},
): Stroke {
  const samples = options.samples ?? 28;
  const wobble = options.wobble ?? 0.004;
  const dt = options.dt ?? 22;

  const path = resampleStroke(waypoints, samples);
  const first = path[0] ?? { x: 0, y: 0 };
  const last = path[path.length - 1] ?? first;
  const span = Math.hypot(last.x - first.x, last.y - first.y) || 1;
  // Unit normal to the stroke's overall direction: drift pushes across it.
  const nx = -(last.y - first.y) / span;
  const ny = (last.x - first.x) / span;

  const phase = rng() * Math.PI * 2;
  const cycles = 1 + rng();
  let t = 0;
  const points: PlanePoint[] = path.map((p, i) => {
    const f = samples > 1 ? i / (samples - 1) : 0;
    // Zero at both ends, so drift bends the stroke without moving its endpoints.
    const drift = Math.sin(phase + f * cycles * Math.PI * 2) * Math.sin(f * Math.PI) * wobble;
    if (i > 0) t += dt * (0.55 + 0.9 * rng());
    return { x: p.x + nx * drift, y: p.y + ny * drift, t: Math.round(t) };
  });
  return { points, durationMs: Math.round(t) };
}

/** Assembles strokes into a sketch, with a pause between them. */
export function handSketch(strokes: readonly Stroke[], pauseMs = 180): Sketch {
  let offset = 0;
  const placed: Stroke[] = [];
  for (const stroke of strokes) {
    const shifted = stroke.points.map((p): PlanePoint => ({ ...p, t: p.t + offset }));
    placed.push({ points: shifted, durationMs: stroke.durationMs });
    offset += stroke.durationMs + pauseMs;
  }
  const last = placed[placed.length - 1]?.points.at(-1);
  return { strokes: placed, durationMs: last?.t ?? 0 };
}

export interface SwordShape {
  /** Blade length in plane metres. */
  readonly length?: number;
  /** Guard length as a fraction of the blade. */
  readonly guardRatio?: number;
  /** Where the guard crosses, 0 at the hilt end and 1 at the tip. */
  readonly guardAt?: number;
  /** Rotation of the whole sword, degrees clockwise from upright. */
  readonly tiltDeg?: number;
  /** Plane-space offset of the whole sword. */
  readonly centre?: Point2;
}

/** The waypoints of a sword: blade drawn tip to hilt, then the guard across it. */
export function swordWaypoints(shape: SwordShape = {}): Point2[][] {
  const length = shape.length ?? 0.5;
  const guard = length * (shape.guardRatio ?? 0.37);
  const at = shape.guardAt ?? 0.25;
  const centre = shape.centre ?? { x: 0, y: 0 };
  const angle = ((shape.tiltDeg ?? 0) * Math.PI) / 180;

  const place = (x: number, y: number): Point2 => ({
    x: centre.x + x * Math.cos(angle) + y * Math.sin(angle),
    y: centre.y - x * Math.sin(angle) + y * Math.cos(angle),
  });

  const half = length / 2;
  const guardY = -half + at * length;
  return [
    [place(0, half), place(0, -half)],
    [place(-guard / 2, guardY), place(guard / 2, guardY)],
  ];
}

/** A sword as a player would draw it. */
export function swordSketch(seed: number, shape: SwordShape = {}, hand: HandOptions = {}): Sketch {
  const rng = seededRandom(seed);
  const [blade, guard] = swordWaypoints(shape);
  return handSketch([
    handStroke(blade ?? [], rng, hand),
    handStroke(guard ?? [], rng, { ...hand, samples: hand.samples ?? 16 }),
  ]);
}

export interface WallShape {
  /** Box width in plane metres. */
  readonly width?: number;
  readonly height?: number;
  /** Which corner the loop starts at, 0 being bottom-left. */
  readonly startCorner?: number;
  readonly clockwise?: boolean;
  /** Fraction of the final side left undrawn, so the loop does not close. */
  readonly openBy?: number;
  readonly tiltDeg?: number;
  readonly centre?: Point2;
}

/**
 * The waypoints of a wall: one loop around a wide box. Unlike the sword, the
 * start corner and the direction are free — a loop has no canonical beginning
 * — so the fixtures exercise all eight traversals.
 */
export function wallWaypoints(shape: WallShape = {}): Point2[][] {
  const width = shape.width ?? 0.6;
  const height = shape.height ?? 0.3;
  const centre = shape.centre ?? { x: 0, y: 0 };
  const angle = ((shape.tiltDeg ?? 0) * Math.PI) / 180;

  const place = (x: number, y: number): Point2 => ({
    x: centre.x + x * Math.cos(angle) + y * Math.sin(angle),
    y: centre.y - x * Math.sin(angle) + y * Math.cos(angle),
  });

  const corners = [
    place(-width / 2, -height / 2),
    place(width / 2, -height / 2),
    place(width / 2, height / 2),
    place(-width / 2, height / 2),
  ];
  const ordered = (shape.clockwise ?? true) ? corners : [...corners].reverse();
  const start = shape.startCorner ?? 0;
  const loop: Point2[] = [];
  for (let i = 0; i <= 4; i++) loop.push(ordered[(start + i) % 4] as Point2);

  const openBy = shape.openBy ?? 0;
  if (openBy > 0) {
    const last = loop[4] as Point2;
    const previous = loop[3] as Point2;
    loop[4] = {
      x: previous.x + (last.x - previous.x) * (1 - openBy),
      y: previous.y + (last.y - previous.y) * (1 - openBy),
    };
  }
  return [loop];
}

/** A wall as a player would draw it: one continuous loop. */
export function wallSketch(seed: number, shape: WallShape = {}, hand: HandOptions = {}): Sketch {
  const rng = seededRandom(seed);
  const [loop] = wallWaypoints(shape);
  return handSketch([handStroke(loop ?? [], rng, { samples: hand.samples ?? 40, ...hand })]);
}

export interface BridgeShape {
  /** Rail length in plane metres. */
  readonly span?: number;
  /** Half the distance between the rails. */
  readonly gap?: number;
  /** Length of the second rail relative to the first. */
  readonly secondRatio?: number;
  /** Draw the lower rail first. Taught the other way, but it still reads. */
  readonly bottomFirst?: boolean;
  readonly tiltDeg?: number;
  readonly centre?: Point2;
}

/** The waypoints of a bridge: two rails, taught upper first. */
export function bridgeWaypoints(shape: BridgeShape = {}): Point2[][] {
  const span = shape.span ?? 0.6;
  const gap = shape.gap ?? 0.06;
  const centre = shape.centre ?? { x: 0, y: 0 };
  const angle = ((shape.tiltDeg ?? 0) * Math.PI) / 180;

  const place = (x: number, y: number): Point2 => ({
    x: centre.x + x * Math.cos(angle) + y * Math.sin(angle),
    y: centre.y - x * Math.sin(angle) + y * Math.cos(angle),
  });

  const half = span / 2;
  const second = half * (shape.secondRatio ?? 1);
  const upper = [place(-half, gap), place(half, gap)];
  const lower = [place(-second, -gap), place(second, -gap)];
  return (shape.bottomFirst ?? false) ? [lower, upper] : [upper, lower];
}

/** A bridge as a player would draw it. */
export function bridgeSketch(seed: number, shape: BridgeShape = {}, hand: HandOptions = {}): Sketch {
  const rng = seededRandom(seed);
  return handSketch(bridgeWaypoints(shape).map((rail) => handStroke(rail, rng, hand)));
}

/** A closed ring, for the circle fixtures. */
export function ringWaypoints(radius: number, points = 32): Point2[] {
  const out = Array.from({ length: points }, (_, i) => {
    const a = (i / points) * Math.PI * 2;
    return { x: Math.cos(a) * radius, y: Math.sin(a) * radius };
  });
  return [...out, { x: radius, y: 0 }];
}

/** A wandering line that means nothing, for the scribble fixtures. */
export function scribbleWaypoints(seed: number, steps = 14, reach = 0.12): Point2[] {
  const rng = seededRandom(seed);
  const out: Point2[] = [{ x: 0, y: 0 }];
  for (let i = 0; i < steps; i++) {
    const previous = out[out.length - 1] ?? { x: 0, y: 0 };
    out.push({
      x: previous.x + (rng() * 2 - 1) * reach,
      y: previous.y + (rng() * 2 - 1) * reach,
    });
  }
  return out;
}

/** Traces a set of waypoint strokes as one sketch, with one seeded hand. */
export function traceSketch(seed: number, waypoints: readonly Point2[][]): Sketch {
  const rng = seededRandom(seed);
  return handSketch(waypoints.map((w) => handStroke(w, rng)));
}

const p = (x: number, y: number): Point2 => ({ x, y });

export interface Fixture {
  readonly name: string;
  readonly sketch: Sketch;
  /** What a person would say this is, or null for "not any blueprint". */
  readonly intent: BlueprintId | null;
  /** The outcome it must produce for a player who can afford it. */
  readonly outcome: 'created' | 'smudged' | 'unrecognized';
  /** For a created fixture, the band it must land in (SPEC §6.5). */
  readonly quality?: Quality;
}

/**
 * The Phase 3 corpus. Every entry is tagged with what a person would say it
 * is, and with the outcome the validator must reach — so the suite asserts
 * design intent, not whatever the code currently happens to do.
 *
 * Human-recorded sketches are added by playing (plan decision 4); until then
 * these are synthetic, and the hand model above is what makes them fair.
 */
export const CORPUS: readonly Fixture[] = [
  // --- Swords drawn well enough to create something -----------------------
  {
    name: 'sword-pristine',
    sketch: swordSketch(101, {}, { wobble: 0.0008, samples: 32 }),
    intent: 'sword',
    outcome: 'created',
    quality: 'keen',
  },
  {
    name: 'sword-clean',
    sketch: swordSketch(102),
    intent: 'sword',
    outcome: 'created',
    quality: 'keen',
  },
  {
    name: 'sword-clean-small',
    sketch: swordSketch(104, { length: 0.22 }),
    intent: 'sword',
    outcome: 'created',
  },
  {
    name: 'sword-clean-large-offset',
    sketch: swordSketch(105, { length: 0.72, centre: p(0.1, -0.05) }),
    intent: 'sword',
    outcome: 'created',
  },
  {
    name: 'sword-slight-tilt',
    sketch: swordSketch(103, { tiltDeg: 8 }),
    intent: 'sword',
    outcome: 'created',
    quality: 'sound',
  },
  {
    name: 'sword-wobbly-hand',
    sketch: swordSketch(106, {}, { wobble: 0.016 }),
    intent: 'sword',
    outcome: 'created',
    quality: 'sound',
  },
  {
    name: 'sword-guard-high-but-legal',
    sketch: swordSketch(107, { guardAt: 0.38 }),
    intent: 'sword',
    outcome: 'created',
    quality: 'sound',
  },
  {
    name: 'sword-guard-long-but-legal',
    sketch: swordSketch(108, { guardRatio: 0.52 }),
    intent: 'sword',
    outcome: 'created',
    quality: 'sound',
  },
  {
    name: 'sword-hasty-tilt',
    sketch: swordSketch(109, { tiltDeg: 20 }),
    intent: 'sword',
    outcome: 'created',
    quality: 'crude',
  },
  {
    name: 'sword-hasty-tilt-and-wobble',
    sketch: swordSketch(132, { tiltDeg: 20 }, { wobble: 0.02 }),
    intent: 'sword',
    outcome: 'created',
    quality: 'crude',
  },

  // --- Recognisably a sword, drawn too badly to hold together -------------
  {
    name: 'sword-too-sloppy-to-hold',
    sketch: swordSketch(133, { tiltDeg: 22, guardAt: 0.37, guardRatio: 0.5 }),
    intent: 'sword',
    outcome: 'smudged',
  },
  {
    name: 'sword-shaky-blade',
    sketch: swordSketch(110, {}, { wobble: 0.05 }),
    intent: 'sword',
    outcome: 'smudged',
  },
  {
    name: 'sword-upside-down',
    sketch: swordSketch(111, { guardAt: 0.78 }),
    intent: 'sword',
    outcome: 'smudged',
  },
  {
    name: 'sword-guard-across-the-middle',
    sketch: swordSketch(112, { guardAt: 0.5 }),
    intent: 'sword',
    outcome: 'smudged',
  },

  // --- Walls: one loop, begun anywhere, either way round ------------------
  {
    name: 'wall-pristine',
    sketch: wallSketch(201, {}, { wobble: 0.001, samples: 48 }),
    intent: 'wall',
    outcome: 'created',
    quality: 'keen',
  },
  {
    name: 'wall-clean',
    sketch: wallSketch(202),
    intent: 'wall',
    outcome: 'created',
  },
  {
    name: 'wall-from-the-top-right-corner',
    sketch: wallSketch(203, { startCorner: 2 }),
    intent: 'wall',
    outcome: 'created',
  },
  {
    name: 'wall-drawn-anticlockwise',
    sketch: wallSketch(204, { clockwise: false }),
    intent: 'wall',
    outcome: 'created',
  },
  {
    name: 'wall-anticlockwise-from-the-far-corner',
    sketch: wallSketch(205, { clockwise: false, startCorner: 1 }),
    intent: 'wall',
    outcome: 'created',
  },
  {
    name: 'wall-small-and-offset',
    sketch: wallSketch(206, { width: 0.32, height: 0.16, centre: p(-0.08, 0.06) }),
    intent: 'wall',
    outcome: 'created',
  },
  {
    name: 'wall-wobbly-hand',
    sketch: wallSketch(207, {}, { wobble: 0.018 }),
    intent: 'wall',
    outcome: 'created',
  },
  {
    // Short of closing by nearly half a long side: still a loop to the hard
    // filter, not a loop the player can be proud of.
    name: 'wall-barely-closed',
    sketch: wallSketch(208, { startCorner: 1, openBy: 0.45 }),
    intent: 'wall',
    outcome: 'smudged',
  },

  // --- Bridges: two rails, taught upper first -----------------------------
  {
    name: 'bridge-pristine',
    sketch: bridgeSketch(301, {}, { wobble: 0.001, samples: 36 }),
    intent: 'bridge',
    outcome: 'created',
    quality: 'keen',
  },
  {
    name: 'bridge-clean',
    sketch: bridgeSketch(302),
    intent: 'bridge',
    outcome: 'created',
  },
  {
    name: 'bridge-wide-gap',
    sketch: bridgeSketch(303, { gap: 0.1 }),
    intent: 'bridge',
    outcome: 'created',
  },
  {
    // Taught upper first, but the other order is a reading of the same shape,
    // so it creates rather than being refused. It grades no higher than the
    // taught order, which `stroke order` below asserts directly.
    name: 'bridge-drawn-bottom-rail-first',
    sketch: bridgeSketch(304, { bottomFirst: true }),
    intent: 'bridge',
    outcome: 'created',
  },
  {
    name: 'bridge-uneven-rails-but-legal',
    sketch: bridgeSketch(305, { secondRatio: 0.78 }),
    intent: 'bridge',
    outcome: 'created',
  },
  {
    name: 'bridge-slight-tilt',
    sketch: bridgeSketch(306, { tiltDeg: 7 }),
    intent: 'bridge',
    outcome: 'created',
  },
  {
    name: 'bridge-rails-too-uneven',
    sketch: bridgeSketch(307, { secondRatio: 0.4 }),
    intent: 'bridge',
    outcome: 'smudged',
  },
  {
    name: 'bridge-shaky-rails',
    sketch: bridgeSketch(308, {}, { wobble: 0.07 }),
    intent: 'bridge',
    outcome: 'smudged',
  },

  // --- Not a sword, and the system must say so rather than guess ----------
  {
    name: 'single-line',
    sketch: traceSketch(120, [[p(0, -0.3), p(0, 0.3)]]),
    intent: null,
    outcome: 'unrecognized',
  },
  {
    // Once a wall exists, a circle is no longer unreadable: it is a closed
    // loop with the wrong proportions, which is what aspect is for (SPEC
    // §6.3). Being told the shape is wrong beats being told it is unreadable.
    name: 'circle',
    sketch: traceSketch(121, [ringWaypoints(0.25)]),
    intent: null,
    outcome: 'smudged',
  },
  {
    name: 'scribble',
    sketch: traceSketch(122, [scribbleWaypoints(5)]),
    intent: null,
    outcome: 'unrecognized',
  },
  {
    name: 'scribble-two-handed',
    sketch: traceSketch(140, [scribbleWaypoints(11, 9), scribbleWaypoints(12, 9)]),
    intent: null,
    outcome: 'unrecognized',
  },
  {
    name: 'rectangle',
    sketch: traceSketch(123, [
      [p(-0.2, -0.3), p(0.2, -0.3)],
      [p(0.2, -0.3), p(0.2, 0.3)],
      [p(0.2, 0.3), p(-0.2, 0.3)],
      [p(-0.2, 0.3), p(-0.2, -0.3)],
    ]),
    intent: null,
    outcome: 'unrecognized',
  },
  {
    name: 'parallel-lines',
    sketch: traceSketch(124, [
      [p(-0.1, -0.3), p(-0.1, 0.3)],
      [p(0.1, -0.3), p(0.1, 0.3)],
    ]),
    intent: null,
    outcome: 'unrecognized',
  },
  {
    name: 'x-cross',
    sketch: traceSketch(125, [
      [p(-0.25, -0.25), p(0.25, 0.25)],
      [p(-0.25, 0.25), p(0.25, -0.25)],
    ]),
    intent: null,
    outcome: 'unrecognized',
  },
  {
    name: 'l-shape',
    sketch: traceSketch(126, [
      [p(-0.2, 0.2), p(-0.2, -0.2)],
      [p(-0.2, -0.2), p(0.2, -0.2)],
    ]),
    intent: null,
    outcome: 'unrecognized',
  },
  {
    name: 't-shape',
    sketch: traceSketch(127, [
      [p(0, -0.35), p(0, 0.35)],
      [p(-0.12, 0.3), p(0.12, 0.3)],
    ]),
    intent: null,
    outcome: 'unrecognized',
  },
  {
    name: 'sword-with-the-guard-detached',
    sketch: swordSketch(113, { guardAt: 1.4 }),
    intent: null,
    outcome: 'unrecognized',
  },

  // --- Near misses that only exist once there are three blueprints --------
  {
    // A box left visibly open is not a loop at all, so no blueprint claims it.
    name: 'open-rectangle',
    sketch: wallSketch(210, { startCorner: 1, openBy: 0.95 }),
    intent: null,
    outcome: 'unrecognized',
  },
  {
    // Two rails standing on end: a bridge's strokes, a bridge's lack of a
    // crossing, and entirely the wrong orientation.
    name: 'bridge-stood-on-end',
    sketch: bridgeSketch(311, { tiltDeg: 90 }),
    intent: null,
    outcome: 'unrecognized',
  },
  {
    // Rails so far apart the shape stops being wide.
    name: 'rails-too-far-apart',
    sketch: bridgeSketch(312, { span: 0.25, gap: 0.22 }),
    intent: null,
    outcome: 'unrecognized',
  },
  {
    // A tall thin loop: closed like a wall, proportioned like nothing.
    name: 'tall-closed-loop',
    sketch: wallSketch(213, { width: 0.16, height: 0.45 }),
    intent: null,
    outcome: 'unrecognized',
  },
];
