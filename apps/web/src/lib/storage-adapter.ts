/**
 * Minimal application storage boundary. Domain code never imports this module;
 * web uses localStorage while a native client can provide its own adapter.
 */
export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const browserStorageAdapter: StorageAdapter = {
  getItem(key) {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  },
  setItem(key, value) {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, value);
  },
  removeItem(key) {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(key);
  }
};
