import { describe, expect, it } from 'vitest';
import { COMBAT } from '../config/combat';
import { FIXED_DT } from '../config/simulation';
import { vec3 } from '../math/vec';
import { createDummy, damageDummy, isStanding, tickDummy, type Dummy } from './dummy';

const SPAWN = { id: 1, position: vec3(-4, 0, 1) };
const DOWN_TICKS = Math.ceil(COMBAT.dummy.respawnDelaySeconds / FIXED_DT);

const standing = (): Dummy => createDummy(SPAWN);

describe('training dummy', () => {
  it('starts standing at full health, where it was authored', () => {
    const dummy = standing();
    expect(dummy.id).toBe(SPAWN.id);
    expect(dummy.position).toEqual(SPAWN.position);
    expect(dummy.health).toBe(COMBAT.dummy.health);
    expect(isStanding(dummy)).toBe(true);
  });

  it('takes a blow without falling', () => {
    const dummy = standing();
    expect(damageDummy(dummy, COMBAT.armed.damage)).toBe('damaged');
    expect(dummy.health).toBe(COMBAT.dummy.health - COMBAT.armed.damage);
    expect(isStanding(dummy)).toBe(true);
  });

  it('falls on the blow that empties its health', () => {
    const dummy = standing();
    expect(damageDummy(dummy, COMBAT.dummy.health - 1)).toBe('damaged');
    expect(damageDummy(dummy, 1)).toBe('felled');
    expect(isStanding(dummy)).toBe(false);
    expect(dummy.health).toBe(0);
  });

  it('cannot be hit while it is down', () => {
    const dummy = standing();
    damageDummy(dummy, 9999);
    expect(damageDummy(dummy, COMBAT.armed.damage)).toBe('already-down');
  });

  it('ignores a meaningless blow rather than healing', () => {
    const dummy = standing();
    damageDummy(dummy, COMBAT.armed.damage);
    const health = dummy.health;
    for (const amount of [0, -40, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(damageDummy(dummy, amount)).toBe('damaged');
      expect(dummy.health).toBe(health);
    }
  });

  it('stands back up at full health after the delay, exactly once', () => {
    const dummy = standing();
    damageDummy(dummy, 9999);
    let stood = 0;
    for (let i = 0; i < DOWN_TICKS - 1; i++) {
      if (tickDummy(dummy, FIXED_DT).stood) stood++;
    }
    expect(isStanding(dummy)).toBe(false);
    expect(stood).toBe(0);

    expect(tickDummy(dummy, FIXED_DT).stood).toBe(true);
    expect(isStanding(dummy)).toBe(true);
    expect(dummy.health).toBe(COMBAT.dummy.health);
    expect(tickDummy(dummy, FIXED_DT).stood).toBe(false);
  });

  it('does not count down while it is standing', () => {
    const dummy = standing();
    for (let i = 0; i < DOWN_TICKS * 2; i++) {
      expect(tickDummy(dummy, FIXED_DT).stood).toBe(false);
    }
    expect(isStanding(dummy)).toBe(true);
  });
});
