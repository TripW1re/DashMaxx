import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getDefaultState, getLocalState, loadFromStorage, saveToStorage, resetLocalState, deepMerge, subscribeToState,
} from '../src/services/localDb';

beforeEach(async () => {
  await AsyncStorage.clear();
  await resetLocalState();
});

describe('getDefaultState', () => {
  it('returns independent deep copies', () => {
    const a = getDefaultState();
    const b = getDefaultState();
    expect(a).not.toBe(b);
    a.settings.isPro = true;
    expect(b.settings.isPro).toBe(false);
  });
});

describe('deepMerge', () => {
  it('merges nested objects without losing defaults', () => {
    const defaults = { settings: { isPro: false, theme: 'dark' }, shifts: [] };
    const overrides = { settings: { isPro: true } };
    const out = deepMerge(defaults, overrides);
    expect(out.settings.isPro).toBe(true);
    expect(out.settings.theme).toBe('dark');
    expect(out.shifts).toEqual([]);
  });

  it('replaces arrays instead of merging them', () => {
    const out = deepMerge({ shifts: [1, 2] }, { shifts: [3] });
    expect(out.shifts).toEqual([3]);
  });

  it('ignores null/undefined overrides', () => {
    const out = deepMerge({ a: 1, b: 2 }, null);
    expect(out.a).toBe(1);
    const out2 = deepMerge({ a: 1 }, { a: undefined });
    expect(out2.a).toBe(1);
  });
});

describe('loadFromStorage', () => {
  it('loads defaults when storage is empty', async () => {
    const state = await loadFromStorage();
    expect(state.shifts).toEqual([]);
    expect(state.settings.isPro).toBe(false);
  });

  it('restores saved state and backfills shift IDs', async () => {
    await AsyncStorage.setItem('dashmaxx_state', JSON.stringify({
      shifts: [{ date: '2026-06-01', earnings: 50, hours: 2 }],
      settings: { isPro: true },
    }));
    const state = await loadFromStorage();
    expect(state.shifts).toHaveLength(1);
    expect(state.shifts[0].earnings).toBe(50);
    expect(typeof state.shifts[0].id).toBe('string');
    expect(state.settings.isPro).toBe(true);
    // Defaults preserved for missing branches
    expect(state.platinum.acceptanceRate).toBe(50);
  });

  it('recovers from corrupted storage', async () => {
    await AsyncStorage.setItem('dashmaxx_state', '{not valid json');
    const state = await loadFromStorage();
    expect(state.shifts).toEqual([]);
  });
});

describe('saveToStorage / getLocalState', () => {
  it('persists and notifies subscribers', async () => {
    const listener = jest.fn();
    const unsub = subscribeToState(listener);
    const state = getLocalState();
    state.settings.isPro = true;
    await saveToStorage(state);
    expect(listener).toHaveBeenCalledTimes(1);
    const stored = JSON.parse(await AsyncStorage.getItem('dashmaxx_state'));
    expect(stored.settings.isPro).toBe(true);
    unsub();
  });
});
