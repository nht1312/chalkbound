export interface InteractPrompt {
  /** Shows `text` under the crosshair, or hides the prompt when undefined. */
  show(text: string | undefined): void;
  dispose(): void;
}

/** Centre-screen hint for the object the player is aiming at, under a small crosshair. */
export function createInteractPrompt(parent: HTMLElement): InteractPrompt {
  const crosshair = parent.ownerDocument.createElement('div');
  crosshair.className = 'crosshair';
  parent.appendChild(crosshair);
  const el = parent.ownerDocument.createElement('div');
  el.className = 'interact-prompt';
  el.hidden = true;
  parent.appendChild(el);
  let shown: string | undefined;
  return {
    show(text) {
      if (text === shown) return;
      shown = text;
      el.hidden = text === undefined;
      el.textContent = text ?? '';
    },
    dispose() {
      crosshair.remove();
      el.remove();
    },
  };
}
