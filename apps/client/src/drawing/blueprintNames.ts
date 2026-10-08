import type { BlueprintId } from '@chalkbound/shared';

/**
 * What the player calls each blueprint, and the parts it is made of.
 *
 * Client-side on purpose: the authority ships stable ids and failure codes,
 * never copy (SPEC_AUDIT D-08 f). Both the Codex and the drawing feedback
 * read from here, so the shape the Codex teaches and the shape a failure
 * message complains about are named the same way.
 */
const NAMES: Record<BlueprintId, string> = { sword: 'Sword', wall: 'Wall', bridge: 'Bridge' };

/**
 * The parts a failure message can point at, in the Codex's own words. `main`
 * is the stroke a shape is mostly made of and `cross` the one that completes
 * it — for the wall, which is a single loop, both name the same outline.
 */
const PARTS: Record<BlueprintId, { readonly main: string; readonly cross: string }> = {
  sword: { main: 'blade', cross: 'crossguard' },
  wall: { main: 'outline', cross: 'outline' },
  bridge: { main: 'top rail', cross: 'bottom rail' },
};

export function blueprintName(id: BlueprintId): string {
  return NAMES[id];
}

export function blueprintParts(id: BlueprintId): { readonly main: string; readonly cross: string } {
  return PARTS[id];
}
