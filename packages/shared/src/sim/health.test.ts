import { describe, expect, it } from 'vitest';
import { COMBAT } from '../config/combat';
import { FIXED_DT } from '../config/simulation';
import { applyDamage, FULL_HEALTH, isAlive, tickRespawn, type HealthState } from './health';

const SWORD = COMBAT.armed.damage;

describe('player health', () => {
  it('starts full and alive', () => {
    expect(FULL_HEALTH.value).toBe(COMBAT.player.maxHealth);
    expect(isAlive(FULL_HEALTH)).toBe(true);
  });

  it('takes three sword hits to kill, as the spec intends', () => {
    let health = FULL_HEALTH;
    health = applyDamage(health, SWORD);
    expect(isAlive(health)).toBe(true);
    health = applyDamage(health, SWORD);
    expect(isAlive(health)).toBe(true);
    health = applyDamage(health, SWORD);
    expect(isAlive(health)).toBe(false);
  });

  it('clamps at zero rather than going negative', () => {
    expect(applyDamage(FULL_HEALTH, 1e6).value).toBe(0);
  });

  it('ignores meaningless amounts', () => {
    for (const amount of [0, -10, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(applyDamage(FULL_HEALTH, amount)).toBe(FULL_HEALTH);
    }
  });

  it('cannot be damaged further once down', () => {
    const dead = applyDamage(FULL_HEALTH, COMBAT.player.maxHealth);
    expect(applyDamage(dead, SWORD)).toBe(dead);
  });

  it('starts the respawn countdown on death', () => {
    const dead = applyDamage(FULL_HEALTH, COMBAT.player.maxHealth);
    expect(dead.respawnIn).toBe(COMBAT.player.respawnDelaySeconds);
  });

  it('does not count down for the living', () => {
    const hurt = applyDamage(FULL_HEALTH, SWORD);
    const tick = tickRespawn(hurt, FIXED_DT);
    expect(tick.health).toBe(hurt);
    expect(tick.respawned).toBe(false);
  });

  it('stands back up at full health after the delay, exactly once', () => {
    let health: HealthState = applyDamage(FULL_HEALTH, COMBAT.player.maxHealth);
    const ticks = Math.ceil(COMBAT.player.respawnDelaySeconds / FIXED_DT);
    let respawns = 0;
    for (let i = 0; i < ticks - 1; i++) {
      const tick = tickRespawn(health, FIXED_DT);
      health = tick.health;
      if (tick.respawned) respawns++;
    }
    expect(isAlive(health)).toBe(false);
    expect(respawns).toBe(0);

    const last = tickRespawn(health, FIXED_DT);
    expect(last.respawned).toBe(true);
    expect(last.health).toEqual(FULL_HEALTH);
    // The countdown does not keep firing once it has fired.
    expect(tickRespawn(last.health, FIXED_DT).respawned).toBe(false);
  });

  it('ignores a nonsense delta rather than respawning early', () => {
    const dead = applyDamage(FULL_HEALTH, COMBAT.player.maxHealth);
    for (const dt of [0, -1, Number.NaN]) {
      expect(tickRespawn(dead, dt).respawned).toBe(false);
    }
  });
});
