import { describe, expect, it } from 'vitest';
import { loadSettings, saveSettings, type SettingsStore } from './settings';

const limits = { min: 0.0005, max: 0.006 };
const defaults = { mouseSensitivity: 0.0022 };

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

  it('round-trips a saved sensitivity', () => {
    const store = memoryStore();
    saveSettings(store, { mouseSensitivity: 0.004 });
    expect(loadSettings(store, defaults, limits).mouseSensitivity).toBe(0.004);
  });

  it('clamps an out-of-range stored value', () => {
    const store = memoryStore();
    saveSettings(store, { mouseSensitivity: 99 });
    expect(loadSettings(store, defaults, limits).mouseSensitivity).toBe(limits.max);
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
