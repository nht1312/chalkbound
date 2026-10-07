import { describe, expect, it } from 'vitest';
import { buildCodeLookup, DEFAULT_BINDINGS, mouseButtonCode, type Bindings } from './bindings';

describe('bindings', () => {
  it('maps each default code to exactly one action', () => {
    const lookup = buildCodeLookup(DEFAULT_BINDINGS);
    for (const actions of lookup.values()) expect(actions).toHaveLength(1);
  });

  it('resolves codes to actions', () => {
    const lookup = buildCodeLookup(DEFAULT_BINDINGS);
    expect(lookup.get('KeyW')).toEqual(['MoveForward']);
    expect(lookup.get(mouseButtonCode(0))).toEqual(['Attack']);
    expect(lookup.get('KeyZ')).toBeUndefined();
  });

  it('supports one code bound to several actions', () => {
    const bindings: Bindings = { ...DEFAULT_BINDINGS, Interact: ['KeyE'], Draw: ['KeyE'] };
    expect(buildCodeLookup(bindings).get('KeyE')).toEqual(['Interact', 'Draw']);
  });
});
