import type { InputState } from '../input/InputState';

/** Shows a "click to play" prompt whenever the pointer is not locked. */
export function createClickToPlay(parent: HTMLElement, input: InputState): () => void {
  const doc = parent.ownerDocument;
  const el = doc.createElement('button');
  el.className = 'click-to-play';
  el.type = 'button';
  el.textContent = 'Click to play';
  parent.appendChild(el);

  const sync = (): void => {
    el.hidden = input.pointerLocked;
  };
  const onClick = (): void => input.requestPointerLock();

  el.addEventListener('click', onClick);
  doc.addEventListener('pointerlockchange', sync);
  sync();

  return () => {
    el.removeEventListener('click', onClick);
    doc.removeEventListener('pointerlockchange', sync);
    el.remove();
  };
}
