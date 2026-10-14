import { describe, expect, it } from 'vitest';
import { closestPointOnSegment, rayCapsuleDistance } from './sweep';
import { vec3 } from './vec';

const AHEAD = vec3(0, 0, -1);
const FAR = 100;

/** An upright capsule: axis from `feet + r` to `feet + h - r`. */
function upright(x: number, z: number, radius = 0.3, height = 1.8) {
  return { a: vec3(x, radius, z), b: vec3(x, height - radius, z), radius };
}

describe('ray against capsule', () => {
  it('hits an upright capsule straight ahead, at its near surface', () => {
    const { a, b, radius } = upright(0, -3);
    // Level with the body, where the cylinder decides rather than a cap.
    const t = rayCapsuleDistance(vec3(0, 0.9, 0), AHEAD, FAR, a, b, radius);
    expect(t).toBeCloseTo(3 - radius, 5);
  });

  it('clips the cap of a capsule whose body the ray passes above', () => {
    const { a, b, radius } = upright(0, -3);
    // Eye height 1.6 is above a 1.8 m capsule's cylinder, which ends at 1.5:
    // the top cap sphere is what the blade actually meets.
    const overhang = 1.6 - b.y;
    const t = rayCapsuleDistance(vec3(0, 1.6, 0), AHEAD, FAR, a, b, radius);
    expect(t).toBeCloseTo(3 - Math.sqrt(radius * radius - overhang * overhang), 5);
  });

  it('misses one that is beside the ray', () => {
    const { a, b, radius } = upright(2, -3);
    expect(rayCapsuleDistance(vec3(0, 1.6, 0), AHEAD, FAR, a, b, radius)).toBeUndefined();
  });

  it('misses one that is behind the ray', () => {
    const { a, b, radius } = upright(0, 3);
    expect(rayCapsuleDistance(vec3(0, 1.6, 0), AHEAD, FAR, a, b, radius)).toBeUndefined();
  });

  it('respects the maximum distance', () => {
    const { a, b, radius } = upright(0, -3);
    const eye = vec3(0, 0.9, 0);
    expect(rayCapsuleDistance(eye, AHEAD, 2.5, a, b, radius)).toBeUndefined();
    expect(rayCapsuleDistance(eye, AHEAD, 2.8, a, b, radius)).toBeCloseTo(2.7, 5);
  });

  it('reports zero for a ray starting inside', () => {
    const { a, b, radius } = upright(0, 0);
    expect(rayCapsuleDistance(vec3(0, 1, 0), AHEAD, FAR, a, b, radius)).toBe(0);
  });

  it('hits the top cap of a capsule the ray passes over', () => {
    const { a, b, radius } = upright(0, -3);
    // Aimed at the very top of the capsule: the cap sphere, not the cylinder.
    const t = rayCapsuleDistance(vec3(0, b.y + radius - 0.01, 0), AHEAD, FAR, a, b, radius);
    expect(t).toBeDefined();
    expect(t).toBeGreaterThan(2.5);
  });

  it('misses above the top cap', () => {
    const { a, b, radius } = upright(0, -3);
    const above = vec3(0, b.y + radius + 0.02, 0);
    expect(rayCapsuleDistance(above, AHEAD, FAR, a, b, radius)).toBeUndefined();
  });

  it('misses below the bottom cap', () => {
    const { a, b, radius } = upright(0, -3);
    expect(rayCapsuleDistance(vec3(0, -0.05, 0), AHEAD, FAR, a, b, radius)).toBeUndefined();
  });

  it('hits a capsule it is aimed along, end on', () => {
    const { a, b, radius } = upright(0, 0);
    // Straight up the axis from below.
    const t = rayCapsuleDistance(vec3(0, -2, 0), vec3(0, 1, 0), FAR, a, b, radius);
    expect(t).toBeCloseTo(2 + radius - radius * 2 + radius, 1);
    expect(t).toBeGreaterThan(1.5);
  });

  it('misses a capsule parallel to the ray but off to the side', () => {
    const { a, b, radius } = upright(1, 0);
    expect(
      rayCapsuleDistance(vec3(0, -2, 0), vec3(0, 1, 0), FAR, a, b, radius),
    ).toBeUndefined();
  });

  it('treats a degenerate axis as a sphere', () => {
    const centre = vec3(0, 1.6, -2);
    const t = rayCapsuleDistance(vec3(0, 1.6, 0), AHEAD, FAR, centre, centre, 0.5);
    expect(t).toBeCloseTo(1.5, 5);
  });

  it('refuses nonsense rather than returning a hit', () => {
    const { a, b, radius } = upright(0, -1);
    const eye = vec3(0, 1.6, 0);
    expect(rayCapsuleDistance(eye, AHEAD, -1, a, b, radius)).toBeUndefined();
    expect(rayCapsuleDistance(eye, AHEAD, FAR, a, b, 0)).toBeUndefined();
  });

  it('is the same test as sweeping a sphere, by inflating the radius', () => {
    const { a, b, radius } = upright(0, -3);
    const eye = vec3(0, 0.9, 0);
    const hull = 0.35;
    // A sphere of `hull` sweeping until it touches == a ray against r + hull.
    const swept = rayCapsuleDistance(eye, AHEAD, FAR, a, b, radius + hull);
    expect(swept).toBeCloseTo((rayCapsuleDistance(eye, AHEAD, FAR, a, b, radius) ?? 0) - hull, 5);
  });
});

describe('closest point on a segment', () => {
  it('finds a point in the middle', () => {
    expect(closestPointOnSegment(vec3(1, 1, 0), vec3(0, 0, 0), vec3(0, 2, 0))).toEqual(
      vec3(0, 1, 0),
    );
  });

  it('clamps to the ends', () => {
    expect(closestPointOnSegment(vec3(0, -5, 0), vec3(0, 0, 0), vec3(0, 2, 0))).toEqual(
      vec3(0, 0, 0),
    );
    expect(closestPointOnSegment(vec3(0, 9, 0), vec3(0, 0, 0), vec3(0, 2, 0))).toEqual(
      vec3(0, 2, 0),
    );
  });

  it('survives a degenerate segment', () => {
    const a = vec3(1, 2, 3);
    expect(closestPointOnSegment(vec3(0, 0, 0), a, a)).toEqual(a);
  });
});
