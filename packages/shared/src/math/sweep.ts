import type { Vec3 } from './vec';

/**
 * Sweeping a sphere along a ray, against a capsule.
 *
 * This exists because a hit test must not touch the physics world. Creating
 * a collider to stand in for a target — and stepping the world so the broad
 * phase can see it — perturbs the character controller's next result by a
 * fraction of a millimetre, and the client, which never created that
 * collider, does not perturb with it. The two then disagree about where the
 * player is standing, which is a rubber-band in the making (ARCHITECTURE §10
 * invariant 10, SPEC_AUDIT R-03). Read-only queries are safe; mutation is
 * not. So capsule targets are tested here, in arithmetic, and the world is
 * only ever *asked* questions.
 *
 * Sweeping a sphere of radius `r` against a capsule of radius `R` is the
 * same problem as casting a ray against a capsule of radius `r + R`, which
 * is the standard reduction and the one used below.
 */

const EPSILON = 1e-9;

const dot = (ax: number, ay: number, az: number, bx: number, by: number, bz: number): number =>
  ax * bx + ay * by + az * bz;

/**
 * Distance along `direction` at which a ray from `origin` first touches the
 * capsule with axis `a`–`b` and radius `radius`, or undefined if it never
 * does within `maxDistance`.
 *
 * A ray starting inside returns 0: at point-blank range the blade is already
 * touching, and reporting a miss there would be worse than reporting a hit.
 */
export function rayCapsuleDistance(
  origin: Vec3,
  direction: Vec3,
  maxDistance: number,
  a: Vec3,
  b: Vec3,
  radius: number,
): number | undefined {
  if (!(maxDistance >= 0) || radius <= 0) return undefined;

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const mx = origin.x - a.x;
  const my = origin.y - a.y;
  const mz = origin.z - a.z;

  const dd = dot(dx, dy, dz, dx, dy, dz);
  const md = dot(mx, my, mz, dx, dy, dz);
  const nd = dot(direction.x, direction.y, direction.z, dx, dy, dz);
  const mm = dot(mx, my, mz, mx, my, mz);
  const mn = dot(mx, my, mz, direction.x, direction.y, direction.z);

  // A degenerate axis is a sphere, which the cap test below already handles.
  if (dd <= EPSILON) return raySphereDistance(mm, mn, radius, maxDistance);

  const k = mm - radius * radius;
  // Already inside: the blade is touching before it moves.
  if (k <= 0 && md >= 0 && md <= dd) return 0;

  const quadA = dd - nd * nd;
  const quadB = dd * mn - nd * md;
  const quadC = dd * k - md * md;

  if (Math.abs(quadA) <= EPSILON) {
    // Parallel to the axis: only the caps can be hit.
    return nearestCap(mm, mn, md, nd, dd, radius, maxDistance);
  }

  const discriminant = quadB * quadB - quadA * quadC;
  if (discriminant < 0) return undefined;

  const t = (-quadB - Math.sqrt(discriminant)) / quadA;
  if (t > maxDistance) return undefined;
  const entry = Math.max(0, t);

  // Past either end of the cylinder, the cap sphere decides.
  const along = md + entry * nd;
  if (along < 0 || along > dd) {
    return nearestCap(mm, mn, md, nd, dd, radius, maxDistance);
  }
  return entry;
}

/** The nearer of the two cap spheres, if either is reached in range. */
function nearestCap(
  mm: number,
  mn: number,
  md: number,
  nd: number,
  dd: number,
  radius: number,
  maxDistance: number,
): number | undefined {
  const atA = raySphereDistance(mm, mn, radius, maxDistance);
  // Recentre the same quantities on the far cap: p - b = (p - a) - d.
  const bb = mm - 2 * md + dd;
  const bn = mn - nd;
  const atB = raySphereDistance(bb, bn, radius, maxDistance);
  if (atA === undefined) return atB;
  if (atB === undefined) return atA;
  return Math.min(atA, atB);
}

/**
 * Ray against a sphere, in the quantities the capsule test already has:
 * `mm` is |origin - centre|², `mn` is (origin - centre)·direction.
 */
function raySphereDistance(
  mm: number,
  mn: number,
  radius: number,
  maxDistance: number,
): number | undefined {
  const c = mm - radius * radius;
  if (c <= 0) return 0;
  if (mn > 0) return undefined; // pointing away from it
  const discriminant = mn * mn - c;
  if (discriminant < 0) return undefined;
  const t = -mn - Math.sqrt(discriminant);
  return t <= maxDistance ? Math.max(0, t) : undefined;
}

/** The point on segment `a`–`b` closest to `p`. */
export function closestPointOnSegment(p: Vec3, a: Vec3, b: Vec3): Vec3 {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const dd = dot(dx, dy, dz, dx, dy, dz);
  if (dd <= EPSILON) return a;
  const t = Math.min(
    1,
    Math.max(0, dot(p.x - a.x, p.y - a.y, p.z - a.z, dx, dy, dz) / dd),
  );
  return { x: a.x + dx * t, y: a.y + dy * t, z: a.z + dz * t };
}
