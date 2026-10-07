import {
  buildCodeLookup,
  mouseButtonCode,
  type Action,
  type Bindings,
  type InputCode,
} from './bindings';

/**
 * Tracks held actions and accumulated mouse movement. Keys, buttons and mouse
 * movement only register while the pointer is locked to the game canvas.
 */
export class InputState {
  private readonly lookup: ReadonlyMap<InputCode, readonly Action[]>;
  private readonly heldCodes = new Set<InputCode>();
  private mouseDx = 0;
  private mouseDy = 0;
  private readonly abort = new AbortController();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    bindings: Bindings,
  ) {
    this.lookup = buildCodeLookup(bindings);
    const signal = this.abort.signal;
    const doc = canvas.ownerDocument;

    doc.addEventListener('keydown', (e) => this.onCodeDown(e.code, e), { signal });
    doc.addEventListener('keyup', (e) => this.heldCodes.delete(e.code), { signal });
    doc.addEventListener('mousedown', (e) => this.onCodeDown(mouseButtonCode(e.button), e), {
      signal,
    });
    doc.addEventListener('mouseup', (e) => this.heldCodes.delete(mouseButtonCode(e.button)), {
      signal,
    });
    doc.addEventListener('mousemove', (e) => this.onMouseMove(e), { signal });
    doc.addEventListener('pointerlockchange', () => this.clearIfUnlocked(), { signal });
    // RMB is a game button; suppress the context menu while playing.
    doc.addEventListener('contextmenu', (e) => this.pointerLocked && e.preventDefault(), {
      signal,
    });
    doc.defaultView?.addEventListener('blur', () => this.clear(), { signal });
  }

  get pointerLocked(): boolean {
    return this.canvas.ownerDocument.pointerLockElement === this.canvas;
  }

  requestPointerLock(): void {
    // Raw input skips OS mouse acceleration where supported; fall back if rejected.
    this.canvas.requestPointerLock({ unadjustedMovement: true }).catch(() => {
      this.canvas.requestPointerLock().catch((error: unknown) => {
        console.warn('Pointer lock was refused', error);
      });
    });
  }

  isDown(action: Action): boolean {
    for (const code of this.heldCodes) {
      if (this.lookup.get(code)?.includes(action)) return true;
    }
    return false;
  }

  /** Returns mouse movement since the last call, in pixels, and resets it. */
  consumeMouseDelta(): { dx: number; dy: number } {
    const delta = { dx: this.mouseDx, dy: this.mouseDy };
    this.mouseDx = 0;
    this.mouseDy = 0;
    return delta;
  }

  dispose(): void {
    this.abort.abort();
    this.clear();
  }

  private onCodeDown(code: InputCode, event: Event): void {
    if (!this.pointerLocked) return;
    if (this.lookup.has(code)) event.preventDefault();
    this.heldCodes.add(code);
  }

  private onMouseMove(event: MouseEvent): void {
    if (!this.pointerLocked) return;
    this.mouseDx += event.movementX;
    this.mouseDy += event.movementY;
  }

  private clearIfUnlocked(): void {
    if (!this.pointerLocked) this.clear();
  }

  private clear(): void {
    this.heldCodes.clear();
    this.mouseDx = 0;
    this.mouseDy = 0;
  }
}
