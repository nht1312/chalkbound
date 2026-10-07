/** Per-player preferences. Stored in the browser only; nothing here is gameplay state. */
export interface Settings {
  /** Radians of rotation per pixel of mouse movement. */
  readonly mouseSensitivity: number;
}

export interface SensitivityLimits {
  readonly min: number;
  readonly max: number;
}

/** The subset of `Storage` used here, so tests can supply a fake. */
export interface SettingsStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_KEY = 'chalkbound.settings';

/**
 * Loads settings, falling back to `defaults` for anything missing, corrupt,
 * or unreadable (private windows and blocked storage throw on access).
 */
export function loadSettings(
  store: SettingsStore | undefined,
  defaults: Settings,
  limits: SensitivityLimits,
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
  const sensitivity =
    typeof parsed === 'object' && parsed !== null && 'mouseSensitivity' in parsed
      ? parsed.mouseSensitivity
      : undefined;
  if (typeof sensitivity !== 'number' || !Number.isFinite(sensitivity)) return defaults;
  return { mouseSensitivity: clampSensitivity(sensitivity, limits) };
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
