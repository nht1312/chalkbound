import type { BlueprintId, BlueprintTemplate } from '../blueprint';
import { SWORD } from './sword';

/**
 * Every blueprint the game knows. Adding one means adding it here and passing
 * the distinctness test in `registry.test.ts` — no validator code changes
 * (prompt §7). Wall and bridge join in Phase 4.
 */
export const BLUEPRINTS: readonly BlueprintTemplate[] = [SWORD];

const BY_ID = new Map<BlueprintId, BlueprintTemplate>(BLUEPRINTS.map((b) => [b.id, b]));

export function blueprintById(id: BlueprintId): BlueprintTemplate | undefined {
  return BY_ID.get(id);
}
