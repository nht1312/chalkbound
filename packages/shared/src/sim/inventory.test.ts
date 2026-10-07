import { describe, expect, it } from 'vitest';
import { INVENTORY } from '../config/inventory';
import { addItem, createInventory, removeItem, type Inventory, type ItemDef } from './inventory';

// Fixture items: no real items exist until Phase 4.
const stone: ItemDef = { id: 'stone', maxStack: 5 };
const relic: ItemDef = { id: 'relic', maxStack: 1 };

const count = (inv: Inventory, id: string): number =>
  inv.reduce((n, slot) => n + (slot?.item === id ? slot.count : 0), 0);

describe('createInventory', () => {
  it('has the configured number of empty slots (SPEC §9: 6)', () => {
    const inv = createInventory();
    expect(INVENTORY.slots).toBe(6);
    expect(inv).toHaveLength(6);
    expect(inv.every((slot) => slot === null)).toBe(true);
  });
});

describe('addItem', () => {
  it('puts items into the first empty slot', () => {
    const { inventory, added, leftover } = addItem(createInventory(), stone, 3);
    expect(inventory[0]).toEqual({ item: 'stone', count: 3 });
    expect({ added, leftover }).toEqual({ added: 3, leftover: 0 });
  });

  it('tops up existing stacks before using empty slots', () => {
    let inv = addItem(createInventory(), stone, 3).inventory;
    inv = addItem(inv, relic, 1).inventory; // slot 1
    inv = addItem(inv, stone, 4).inventory; // 2 into slot 0, 2 into slot 2
    expect(inv[0]).toEqual({ item: 'stone', count: 5 });
    expect(inv[1]).toEqual({ item: 'relic', count: 1 });
    expect(inv[2]).toEqual({ item: 'stone', count: 2 });
  });

  it('respects the stack limit across several slots', () => {
    const { inventory } = addItem(createInventory(), stone, 12);
    expect(inventory.slice(0, 3)).toEqual([
      { item: 'stone', count: 5 },
      { item: 'stone', count: 5 },
      { item: 'stone', count: 2 },
    ]);
  });

  it('reports leftovers when the inventory is full', () => {
    let inv = createInventory();
    for (let i = 0; i < INVENTORY.slots; i++) inv = addItem(inv, relic, 1).inventory;
    const result = addItem(inv, stone, 3);
    expect(result).toMatchObject({ added: 0, leftover: 3 });
    expect(result.inventory).toEqual(inv);
  });

  it('adds partially when only some of the amount fits', () => {
    let inv = createInventory();
    for (let i = 0; i < INVENTORY.slots - 1; i++) inv = addItem(inv, relic, 1).inventory;
    const result = addItem(inv, stone, 7);
    expect(result).toMatchObject({ added: 5, leftover: 2 });
    expect(count(result.inventory, 'stone')).toBe(5);
  });

  it('does not mutate the original inventory', () => {
    const inv = createInventory();
    addItem(inv, stone, 3);
    expect(inv.every((slot) => slot === null)).toBe(true);
  });

  it('rejects invalid counts and item definitions (server-side bugs, not client input)', () => {
    expect(() => addItem(createInventory(), stone, 0)).toThrow(RangeError);
    expect(() => addItem(createInventory(), stone, 1.5)).toThrow(RangeError);
    expect(() => addItem(createInventory(), { id: 'bad', maxStack: 0 }, 1)).toThrow(RangeError);
  });
});

describe('removeItem', () => {
  const filled = addItem(createInventory(), stone, 4).inventory;

  it('removes part of a stack', () => {
    const { inventory, removed } = removeItem(filled, 0, 3);
    expect(removed).toEqual({ item: 'stone', count: 3 });
    expect(inventory[0]).toEqual({ item: 'stone', count: 1 });
  });

  it('empties the slot when the whole stack is removed', () => {
    const { inventory, removed } = removeItem(filled, 0, 4);
    expect(removed).toEqual({ item: 'stone', count: 4 });
    expect(inventory[0]).toBeNull();
  });

  it('removes only what the stack holds', () => {
    expect(removeItem(filled, 0, 99).removed).toEqual({ item: 'stone', count: 4 });
  });

  it('is a no-op for invalid or empty slots and non-positive counts (may come from a client)', () => {
    for (const [slot, n] of [
      [-1, 1],
      [INVENTORY.slots, 1],
      [1.5, 1],
      [1, 1], // empty slot
      [0, 0],
      [0, -2],
    ] as const) {
      const result = removeItem(filled, slot, n);
      expect(result.removed).toBeNull();
      expect(result.inventory).toBe(filled);
    }
  });
});
