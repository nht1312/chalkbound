/** Per-player preferences. Stored in the browser only; nothing here is gameplay state. */
export interface Settings {
  /** Radians of camera rotation per pixel of mouse movement. */
  readonly mouseSensitivity: number;
  /**
   * Plane metres the chalk cursor travels per pixel. Deliberately its own
   * setting: aiming and drawing want different speeds from the same hand.
   */
  readonly cursorSensitivity: number;
}

export interface SensitivityLimits {
  readonly min: number;
  readonly max: number;
}

/** The allowed range of each setting. */
export type SettingsLimits = Readonly<Record<keyof Settings, SensitivityLimits>>;

/** The subset of `Storage` used here, so tests can supply a fake. */
export interface SettingsStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_KEY = 'chalkbound.settings';
const KEYS: readonly (keyof Settings)[] = ['mouseSensitivity', 'cursorSensitivity'];

/**
 * Loads settings, falling back to `defaults` per key for anything missing,
 * corrupt, or unreadable (private windows and blocked storage throw on
 * access). One bad value never costs the player their other settings.
 */
export function loadSettings(
  store: SettingsStore | undefined,
  defaults: Settings,
  limits: SettingsLimits,
): Settings {
  let raw: string | null;
  try {
    raw = store?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return defaults;
  }
  if (raw === null) return defaults;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaults;
  }
  if (typeof parsed !== 'object' || parsed === null) return defaults;

  const loaded = { ...defaults } as Record<keyof Settings, number>;
  for (const key of KEYS) {
    const value = (parsed as Record<string, unknown>)[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      loaded[key] = clampSensitivity(value, limits[key]);
    }
  }
  return loaded;
}

/** Persists settings if storage is available; failure only loses persistence. */
export function saveSettings(store: SettingsStore | undefined, settings: Settings): void {
  try {
    store?.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage blocked or full: the setting still applies for this session.
  }
}

export function clampSensitivity(value: number, limits: SensitivityLimits): number {
  return Math.min(limits.max, Math.max(limits.min, value));
}

/** `window.localStorage`, or undefined where even reading the property throws. */
export function browserSettingsStore(): SettingsStore | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
