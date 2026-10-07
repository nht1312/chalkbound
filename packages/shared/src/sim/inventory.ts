import { INVENTORY } from '../config/inventory';

export type ItemId = string;

/** What the inventory needs to know about an item type. */
export interface ItemDef {
  readonly id: ItemId;
  /** Most of this item one slot can hold. */
  readonly maxStack: number;
}

export interface ItemStack {
  readonly item: ItemId;
  readonly count: number;
}

/** Fixed-length slots; `null` is an empty slot. Immutable: operations return a new inventory. */
export type Inventory = readonly (ItemStack | null)[];

export function createInventory(slots: number = INVENTORY.slots): Inventory {
  return Array.from({ length: slots }, () => null);
}

/**
 * Adds `count` of `item`, topping up existing stacks first and then filling
 * empty slots in order. Whatever does not fit is reported as `leftover`.
 *
 * Items are only ever added by the authority (pickups, creation), so invalid
 * arguments are bugs and throw.
 */
export function addItem(
  inventory: Inventory,
  item: ItemDef,
  count: number,
): { inventory: Inventory; added: number; leftover: number } {
  if (!Number.isInteger(count) || count <= 0) {
    throw new RangeError(`Item count must be a positive integer, got ${count}`);
  }
  if (!Number.isInteger(item.maxStack) || item.maxStack <= 0) {
    throw new RangeError(`Item ${item.id} has invalid maxStack ${item.maxStack}`);
  }

  const slots = [...inventory];
  let remaining = count;
  const fill = (index: number, current: number): void => {
    const moved = Math.min(remaining, item.maxStack - current);
    if (moved <= 0) return;
    slots[index] = { item: item.id, count: current + moved };
    remaining -= moved;
  };

  slots.forEach((slot, index) => {
    if (remaining > 0 && slot?.item === item.id) fill(index, slot.count);
  });
  slots.forEach((slot, index) => {
    if (remaining > 0 && slot === null) fill(index, 0);
  });

  const added = count - remaining;
  return { inventory: added > 0 ? slots : inventory, added, leftover: remaining };
}

/**
 * Removes up to `count` items from `slot`. Slot indices may one day arrive in
 * a client's intent, so anything invalid — out of range, empty, non-positive
 * count — is a no-op that returns the original inventory, never a throw.
 */
export function removeItem(
  inventory: Inventory,
  slot: number,
  count: number,
): { inventory: Inventory; removed: ItemStack | null } {
  const stack = Number.isInteger(slot) ? inventory[slot] : undefined;
  if (!stack || !Number.isInteger(count) || count <= 0) return { inventory, removed: null };

  const taken = Math.min(count, stack.count);
  const slots = [...inventory];
  slots[slot] = taken === stack.count ? null : { item: stack.item, count: stack.count - taken };
  return { inventory: slots, removed: { item: stack.item, count: taken } };
}
