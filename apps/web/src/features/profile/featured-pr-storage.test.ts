import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getStoredFeaturedPrSelections,
  saveStoredFeaturedPrSelections,
  STORAGE_KEYS,
  switchStoredUserScope
} from '../../lib/storage.js';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

test('featured PR cache normalizes invalid and duplicate selections', () => {
  const previous = globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: new MemoryStorage() });
  try {
    const normalized = saveStoredFeaturedPrSelections([
      { slot: 1, exerciseId: 'bench', loadWeightKg: 100.004 },
      { slot: 1, exerciseId: 'row', loadWeightKg: 80 },
      { slot: 2, exerciseId: 'bench', loadWeightKg: 120 },
      { slot: 2, exerciseId: 'row', loadWeightKg: -1 },
      { slot: 3, exerciseId: 'curl', loadWeightKg: 20 }
    ]);
    assert.deepEqual(normalized, [
      { slot: 1, exerciseId: 'bench', loadWeightKg: 100 },
      { slot: 3, exerciseId: 'curl', loadWeightKg: 20 }
    ]);
    assert.deepEqual(getStoredFeaturedPrSelections(), normalized);
  } finally {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: previous });
  }
});

test('featured PR cache participates in anonymous/authenticated scope isolation', () => {
  const previous = globalThis.localStorage;
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  try {
    saveStoredFeaturedPrSelections([{ slot: 1, exerciseId: 'offline-bench', loadWeightKg: 100 }]);
    assert.equal(switchStoredUserScope('user-a'), true);
    saveStoredFeaturedPrSelections([{ slot: 1, exerciseId: 'a-bench', loadWeightKg: 80 }]);
    assert.equal(switchStoredUserScope('user-b'), true);
    assert.deepEqual(getStoredFeaturedPrSelections(), []);
    saveStoredFeaturedPrSelections([{ slot: 1, exerciseId: 'b-row', loadWeightKg: 70 }]);
    assert.equal(switchStoredUserScope('user-a'), true);
    assert.deepEqual(getStoredFeaturedPrSelections(), [{ slot: 1, exerciseId: 'a-bench', loadWeightKg: 80 }]);
    assert.ok(storage.getItem(STORAGE_KEYS.FEATURED_PRS));
  } finally {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: previous });
  }
});
