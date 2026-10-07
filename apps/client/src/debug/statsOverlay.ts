export interface FrameTiming {
  readonly fps: number;
  readonly frameMs: number;
  /** Seconds since the previous refresh. */
  readonly elapsed: number;
}

export interface StatsOverlay {
  /** Call once per rendered frame, after rendering. */
  update(frameDelta: number): void;
  dispose(): void;
}

/**
 * Text overlay refreshed at a fixed interval. What it shows comes from
 * `describe`, so the overlay itself knows nothing about game systems.
 */
export function createStatsOverlay(
  parent: HTMLElement,
  refreshInterval: number,
  describe: (timing: FrameTiming) => readonly string[],
): StatsOverlay {
  const el = parent.ownerDocument.createElement('div');
  el.className = 'stats-overlay';
  parent.appendChild(el);

  let elapsed = 0;
  let frames = 0;

  return {
    update(frameDelta) {
      elapsed += frameDelta;
      frames++;
      if (elapsed < refreshInterval) return;

      el.textContent = describe({
        fps: frames / elapsed,
        frameMs: (elapsed / frames) * 1000,
        elapsed,
      }).join('\n');
      elapsed = 0;
      frames = 0;
    },
    dispose() {
      el.remove();
    },
  };
}
