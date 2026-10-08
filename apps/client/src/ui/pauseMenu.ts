import type { InputState } from '../input/InputState';
import type { SensitivityLimits, Settings, SettingsLimits } from './settings';

export interface PauseMenuOptions {
  readonly settings: Settings;
  readonly limits: SettingsLimits;
  /** Called as the player drags a slider, with the whole updated set. */
  onSettingsChange(settings: Settings): void;
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

  let settings = options.settings;

  /** One labelled slider, reporting its value back through `onChange`. */
  const addSlider = (
    name: string,
    limits: SensitivityLimits,
    initial: number,
    onChange: (value: number) => void,
  ): (() => void) => {
    const label = doc.createElement('label');
    label.className = 'pause-menu__setting';
    const labelText = doc.createElement('span');
    const slider = doc.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = String(SLIDER_STEPS);
    label.append(labelText, slider);
    root.appendChild(label);

    const { min, max } = limits;
    const show = (value: number): void => {
      labelText.textContent = `${name} ${(value * 1000).toFixed(2)}`;
    };
    slider.value = String(Math.round(((initial - min) / (max - min)) * SLIDER_STEPS));
    show(initial);

    const onSlide = (): void => {
      const value = min + ((max - min) * Number(slider.value)) / SLIDER_STEPS;
      show(value);
      onChange(value);
    };
    slider.addEventListener('input', onSlide);
    return () => slider.removeEventListener('input', onSlide);
  };

  root.append(title, resume, hint);
  parent.appendChild(root);

  const apply = (next: Settings): void => {
    settings = next;
    options.onSettingsChange(settings);
  };
  const detachMouse = addSlider(
    'Mouse sensitivity',
    options.limits.mouseSensitivity,
    settings.mouseSensitivity,
    (mouseSensitivity) => apply({ ...settings, mouseSensitivity }),
  );
  const detachCursor = addSlider(
    'Chalk cursor speed',
    options.limits.cursorSensitivity,
    settings.cursorSensitivity,
    (cursorSensitivity) => apply({ ...settings, cursorSensitivity }),
  );

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
  resume.addEventListener('click', onResume);
  doc.addEventListener('pointerlockchange', sync);
  sync();

  return () => {
    resume.removeEventListener('click', onResume);
    detachMouse();
    detachCursor();
    doc.removeEventListener('pointerlockchange', sync);
    root.remove();
  };
}
