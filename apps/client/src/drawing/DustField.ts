import type { Point2 } from '@chalkbound/shared';

/**
 * Chalk dust falling from the cursor (SPEC §14, D-02).
 *
 * Emission tracks cursor speed, so the dust reads as chalk being abraded off
 * the stick rather than as a decoration that runs whether or not the player
 * is drawing. A stationary chalk makes no dust.
 *
 * A fixed pool, with the living particles kept contiguous at the front so the
 * renderer can upload one range instead of walking a free list.
 */
export interface DustConfig {
  readonly maxParticles: number;
  /** Particles per second at `fullSpeed`. */
  readonly emitRate: number;
  /** Cursor speed (plane m/s) at which emission reaches `emitRate`. */
  readonly fullSpeed: number;
  readonly lifeSeconds: number;
  /** Downward acceleration, plane metres per second squared. */
  readonly gravity: number;
  /** Initial scatter speed, plane metres per second. */
  readonly scatter: number;
}

export interface DustParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  /** 1 when fresh, 0 at the end of its life. */
  alpha: number;
}

export class DustField {
  /** The pool. Only the first `aliveCount` entries are live. */
  readonly particles: DustParticle[];
  private alive = 0;
  /** Fractional particles owed from previous frames. */
  private pending = 0;

  constructor(private readonly config: DustConfig) {
    this.particles = Array.from({ length: config.maxParticles }, () => ({
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      age: 0,
      alpha: 0,
    }));
  }

  get aliveCount(): number {
    return this.alive;
  }

  /**
   * Ages the field and emits at the cursor. Returns how many were emitted.
   * `random` is injected so the tests are deterministic.
   */
  update(
    cursor: Point2,
    speed: number,
    touching: boolean,
    dt: number,
    random: () => number = Math.random,
  ): number {
    this.age(dt);

    if (!touching || !Number.isFinite(speed) || speed <= 0 || !(dt > 0)) {
      // Drop the carried fraction: it belongs to the stroke that just ended,
      // and keeping it would make the next stroke emit before it has moved.
      this.pending = 0;
      return 0;
    }

    const rate = this.config.emitRate * Math.min(1, speed / this.config.fullSpeed);
    this.pending += rate * dt;
    const count = Math.floor(this.pending);
    this.pending -= count;

    let emitted = 0;
    for (let i = 0; i < count; i++) {
      if (!this.spawn(cursor, random)) break;
      emitted++;
    }
    return emitted;
  }

  clear(): void {
    this.alive = 0;
    this.pending = 0;
  }

  /** Moves and ages every live particle, retiring the spent ones. */
  private age(dt: number): void {
    if (!(dt > 0)) return;
    const { lifeSeconds, gravity } = this.config;
    let i = 0;
    while (i < this.alive) {
      const particle = this.particles[i];
      if (!particle) break;
      particle.age += dt;
      if (particle.age >= lifeSeconds) {
        // Swap the last live particle into the gap: order does not matter to
        // dust, and this keeps the live range contiguous without shuffling.
        this.alive--;
        const last = this.particles[this.alive];
        if (last && last !== particle) this.particles[i] = last;
        this.particles[this.alive] = particle;
        continue;
      }
      particle.vy -= gravity * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.alpha = 1 - particle.age / lifeSeconds;
      i++;
    }
  }

  private spawn(cursor: Point2, random: () => number): boolean {
    if (this.alive >= this.config.maxParticles) return false;
    const particle = this.particles[this.alive];
    if (!particle) return false;
    const { scatter } = this.config;
    particle.x = cursor.x;
    particle.y = cursor.y;
    particle.vx = (random() * 2 - 1) * scatter;
    particle.vy = (random() * 2 - 1) * scatter;
    particle.age = 0;
    particle.alpha = 1;
    this.alive++;
    return true;
  }
}
