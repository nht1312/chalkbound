import type { BlueprintId, BlueprintTemplate } from '../blueprint';
import { BRIDGE } from './bridge';
import { SWORD } from './sword';
import { WALL } from './wall';

/**
 * Every blueprint the game knows. Adding one means adding it here and passing
 * the distinctness test in `registry.test.ts` — no validator code changes
 * (prompt §7). The MVP set is complete at three (SPEC §7).
 */
export const BLUEPRINTS: readonly BlueprintTemplate[] = [SWORD, WALL, BRIDGE];

const BY_ID = new Map<BlueprintId, BlueprintTemplate>(BLUEPRINTS.map((b) => [b.id, b]));

export function blueprintById(id: BlueprintId): BlueprintTemplate | undefined {
  return BY_ID.get(id);
}
