import { CREATION, type EquippedWeaponState } from '@chalkbound/shared';
import { Group } from 'three';
import { describe, expect, it } from 'vitest';
import { createHeldWeapon, qualityTint } from './heldWeapon';

/**
 * The sketch becoming a weapon *in your hands* is the game's signature moment
 * (SPEC §6.8), so what the hand holds is driven by the authority's own
 * equipped state and nothing else.
 */

const sword = (over: Partial<EquippedWeaponState> = {}): EquippedWeaponState => ({
  blueprintId: 'sword',
  quality: 'sound',
  durability: CREATION.sword.durability,
  maxDurability: CREATION.sword.durability,
  ...over,
});

describe('the held weapon', () => {
  it('shows nothing in an empty hand', () => {
    const hand = new Group();
    const held = createHeldWeapon(hand);
    held.update(undefined);
    expect(hand.children).toHaveLength(0);
  });

  it('puts a blade in the hand once one is equipped', () => {
    const hand = new Group();
    const held = createHeldWeapon(hand);
    held.update(sword());
    expect(hand.children).toHaveLength(1);
  });

  it('takes it away again when the hand is emptied', () => {
    const hand = new Group();
    const held = createHeldWeapon(hand);
    held.update(sword());
    held.update(undefined);
    expect(hand.children).toHaveLength(0);
  });

  it('builds the blade once, not once per frame', () => {
    const hand = new Group();
    const held = createHeldWeapon(hand);
    const first = (held.update(sword()), hand.children[0]);
    for (let i = 0; i < 60; i++) held.update(sword());
    expect(hand.children).toHaveLength(1);
    expect(hand.children[0]).toBe(first);
  });

  it('rebuilds when a different sword replaces it', () => {
    const hand = new Group();
    const held = createHeldWeapon(hand);
    held.update(sword({ quality: 'crude' }));
    const crude = hand.children[0];
    held.update(sword({ quality: 'keen' }));
    expect(hand.children).toHaveLength(1);
    expect(hand.children[0]).not.toBe(crude);
  });

  it('frees the old blade rather than leaking it', () => {
    const hand = new Group();
    const held = createHeldWeapon(hand);
    held.update(sword());
    held.update(undefined);
    held.update(sword());
    held.update(undefined);
    expect(hand.children).toHaveLength(0);
  });

  it('survives being disposed with a blade still in hand', () => {
    const hand = new Group();
    const held = createHeldWeapon(hand);
    held.update(sword());
    held.dispose();
    expect(hand.children).toHaveLength(0);
  });
});

/**
 * SPEC §6.5: "quality is visible on the object — a crude sword looks roughly
 * drawn, a keen one looks crisp and glows faintly. The player can see what
 * their skill produced."
 */
describe('quality is visible', () => {
  it('gives each band its own look', () => {
    const tints = (['crude', 'sound', 'keen'] as const).map(qualityTint);
    expect(new Set(tints.map((t) => t.color)).size).toBe(3);
  });

  it('makes a keen blade the brightest and a crude one the dullest', () => {
    expect(qualityTint('keen').emissive).toBeGreaterThan(qualityTint('sound').emissive);
    expect(qualityTint('sound').emissive).toBeGreaterThanOrEqual(qualityTint('crude').emissive);
  });

  it('only lets the keen blade glow, as the spec singles it out', () => {
    expect(qualityTint('crude').emissive).toBe(0);
    expect(qualityTint('keen').emissive).toBeGreaterThan(0);
  });

  it('keeps every roughness sane for a renderer', () => {
    for (const quality of ['crude', 'sound', 'keen'] as const) {
      const tint = qualityTint(quality);
      expect(tint.roughness).toBeGreaterThanOrEqual(0);
      expect(tint.roughness).toBeLessThanOrEqual(1);
    }
  });

  it('makes a crude blade rougher than a keen one', () => {
    expect(qualityTint('crude').roughness).toBeGreaterThan(qualityTint('keen').roughness);
  });
});
