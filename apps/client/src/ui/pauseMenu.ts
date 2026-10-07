import type { InputState } from '../input/InputState';
import type { SensitivityLimits } from './settings';

export interface PauseMenuOptions {
  readonly sensitivity: number;
  readonly limits: SensitivityLimits;
  /** Called as the player drags the sensitivity slider. */
  onSensitivityChange(sensitivity: number): void;
}

/** Number of discrete slider positions between min and max. */
const SLIDER_STEPS = 100;

/**
 * Overlay shown whenever the pointer is not locked: before the first click,
 * and after Esc or a focus loss. The match keeps running underneath, since it
 * is multiplayer and cannot pause; the overlay only stops input.
 */
export function createPauseMenu(
  parent: HTMLElement,
  input: InputState,
  options: PauseMenuOptions,
): () => void {
  const doc = parent.ownerDocument;
  const root = doc.createElement('div');
  root.className = 'pause-menu';

  const title = doc.createElement('h1');
  title.textContent = 'CHALKBOUND';

  const resume = doc.createElement('button');
  resume.type = 'button';
  resume.className = 'pause-menu__resume';
  resume.textContent = 'Click to play';

  const hint = doc.createElement('p');
  hint.className = 'pause-menu__hint';

  const label = doc.createElement('label');
  label.className = 'pause-menu__setting';
  const labelText = doc.createElement('span');
  const slider = doc.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = String(SLIDER_STEPS);
  label.append(labelText, slider);

  root.append(title, resume, hint, label);
  parent.appendChild(root);

  const { min, max } = options.limits;
  const toSensitivity = (step: number): number => min + ((max - min) * step) / SLIDER_STEPS;
  const showSensitivity = (sensitivity: number): void => {
    labelText.textContent = `Mouse sensitivity ${(sensitivity * 1000).toFixed(2)}`;
  };
  slider.value = String(Math.round(((options.sensitivity - min) / (max - min)) * SLIDER_STEPS));
  showSensitivity(options.sensitivity);

  let hasPlayed = false;
  const sync = (): void => {
    const locked = input.pointerLocked;
    root.hidden = locked;
    if (locked) {
      hasPlayed = true;
      hint.textContent = '';
    } else if (hasPlayed) {
      title.textContent = 'Paused';
      resume.textContent = 'Resume';
    }
  };

  const onResume = (): void => {
    void input.requestPointerLock().then((granted) => {
      hint.textContent = granted ? '' : 'The browser needs a moment after Esc — click again.';
    });
  };
  const onSlide = (): void => {
    const sensitivity = toSensitivity(Number(slider.value));
    showSensitivity(sensitivity);
    options.onSensitivityChange(sensitivity);
  };

  resume.addEventListener('click', onResume);
  slider.addEventListener('input', onSlide);
  doc.addEventListener('pointerlockchange', sync);
  sync();

  return () => {
    resume.removeEventListener('click', onResume);
    slider.removeEventListener('input', onSlide);
    doc.removeEventListener('pointerlockchange', sync);
    root.remove();
  };
}
