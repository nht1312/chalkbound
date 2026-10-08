import { describe, expect, it } from 'vitest';
import { loadSettings, saveSettings, type SettingsStore } from './settings';

const limits = {
  mouseSensitivity: { min: 0.0005, max: 0.006 },
  cursorSensitivity: { min: 0.0003, max: 0.004 },
};
const defaults = { mouseSensitivity: 0.0022, cursorSensitivity: 0.0012 };

function memoryStore(
  initial: Record<string, string> = {},
): SettingsStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

const throwingStore: SettingsStore = {
  getItem: () => {
    throw new Error('SecurityError: storage disabled');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

describe('settings', () => {
  it('uses defaults when nothing is stored', () => {
    expect(loadSettings(memoryStore(), defaults, limits)).toEqual(defaults);
  });

  it('uses defaults when there is no storage at all', () => {
    expect(loadSettings(undefined, defaults, limits)).toEqual(defaults);
  });

  it('round-trips both saved sensitivities', () => {
    const store = memoryStore();
    saveSettings(store, { mouseSensitivity: 0.004, cursorSensitivity: 0.002 });
    expect(loadSettings(store, defaults, limits)).toEqual({
      mouseSensitivity: 0.004,
      cursorSensitivity: 0.002,
    });
  });

  it('clamps each value to its own range', () => {
    const store = memoryStore();
    saveSettings(store, { mouseSensitivity: 99, cursorSensitivity: 99 });
    const loaded = loadSettings(store, defaults, limits);
    expect(loaded.mouseSensitivity).toBe(limits.mouseSensitivity.max);
    expect(loaded.cursorSensitivity).toBe(limits.cursorSensitivity.max);
  });

  it('keeps the good half when only one value is unusable', () => {
    const store = memoryStore({
      'chalkbound.settings': '{"mouseSensitivity":0.004,"cursorSensitivity":"fast"}',
    });
    expect(loadSettings(store, defaults, limits)).toEqual({
      mouseSensitivity: 0.004,
      cursorSensitivity: defaults.cursorSensitivity,
    });
  });

  it('reads settings saved before the cursor setting existed', () => {
    const store = memoryStore({ 'chalkbound.settings': '{"mouseSensitivity":0.004}' });
    expect(loadSettings(store, defaults, limits)).toEqual({
      mouseSensitivity: 0.004,
      cursorSensitivity: defaults.cursorSensitivity,
    });
  });

  it('ignores corrupt or wrongly typed data', () => {
    for (const raw of ['{not json', '"text"', '{"mouseSensitivity":"fast"}', 'null']) {
      const store = memoryStore({ 'chalkbound.settings': raw });
      expect(loadSettings(store, defaults, limits)).toEqual(defaults);
    }
  });

  it('survives storage that throws on read and write', () => {
    expect(loadSettings(throwingStore, defaults, limits)).toEqual(defaults);
    expect(() => saveSettings(throwingStore, defaults)).not.toThrow();
  });
});
