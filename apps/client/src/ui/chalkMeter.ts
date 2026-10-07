/** Text and bar fill for a chalk value. `undefined` means no snapshot yet. */
export function describeChalkMeter(
  chalk: number | undefined,
  max: number,
): { text: string; fraction: number } {
  if (chalk === undefined) return { text: `Chalk — / ${max}`, fraction: 0 };
  return { text: `Chalk ${chalk} / ${max}`, fraction: Math.min(1, Math.max(0, chalk / max)) };
}

export interface ChalkMeter {
  /** Shows a value. Callers pass only the authoritative value from the newest snapshot. */
  update(chalk: number | undefined): void;
  dispose(): void;
}

/** HUD chalk meter (SPEC §15: the meter is always on screen). A label above a bar. */
export function createChalkMeter(parent: HTMLElement, max: number): ChalkMeter {
  const doc = parent.ownerDocument;
  const root = doc.createElement('div');
  root.className = 'chalk-meter';
  const label = doc.createElement('div');
  label.className = 'chalk-meter__label';
  const track = doc.createElement('div');
  track.className = 'chalk-meter__track';
  const fill = doc.createElement('div');
  fill.className = 'chalk-meter__fill';
  track.appendChild(fill);
  root.append(label, track);
  parent.appendChild(root);

  let shown: number | undefined | null = null; // null: nothing rendered yet
  return {
    update(chalk) {
      if (chalk === shown) return;
      shown = chalk;
      const { text, fraction } = describeChalkMeter(chalk, max);
      label.textContent = text;
      fill.style.transform = `scaleX(${fraction})`;
    },
    dispose() {
      root.remove();
    },
  };
}
