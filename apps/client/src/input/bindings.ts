export type Action =
  | 'MoveForward'
  | 'MoveBackward'
  | 'MoveLeft'
  | 'MoveRight'
  | 'Jump'
  | 'Crouch'
  | 'Sprint'
  | 'Interact'
  | 'Draw'
  | 'Attack'
  | 'Codex';

/** Input codes: `KeyboardEvent.code` values, or `Mouse<button>` for mouse buttons. */
export type InputCode = string;

export type Bindings = Readonly<Record<Action, readonly InputCode[]>>;

export const DEFAULT_BINDINGS: Bindings = {
  MoveForward: ['KeyW', 'ArrowUp'],
  MoveBackward: ['KeyS', 'ArrowDown'],
  MoveLeft: ['KeyA', 'ArrowLeft'],
  MoveRight: ['KeyD', 'ArrowRight'],
  Jump: ['Space'],
  // Not Ctrl: Ctrl+W would close the tab mid-match.
  Crouch: ['KeyC'],
  Sprint: ['ShiftLeft'],
  Interact: ['KeyE'],
  // Hold RMB to raise the chalk (ROADMAP vertical slice).
  Draw: ['Mouse2'],
  Attack: ['Mouse0'],
  // Hold to read the Codex (SPEC §6.4: glanceable in-match). Bound while
  // pointer-locked, so Tab never reaches the browser's focus ring.
  Codex: ['Tab'],
};

export function mouseButtonCode(button: number): InputCode {
  return `Mouse${button}`;
}

/** Reverse lookup from input code to the actions it triggers. */
export function buildCodeLookup(bindings: Bindings): ReadonlyMap<InputCode, readonly Action[]> {
  const lookup = new Map<InputCode, Action[]>();
  for (const [action, codes] of Object.entries(bindings) as [Action, readonly InputCode[]][]) {
    for (const code of codes) {
      const actions = lookup.get(code);
      if (actions) actions.push(action);
      else lookup.set(code, [action]);
    }
  }
  return lookup;
}
