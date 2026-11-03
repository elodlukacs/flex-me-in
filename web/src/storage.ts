/** localStorage that never throws (private mode, blocked storage, quota). */
export const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // best effort
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      // best effort
    }
  },
  getJson<T>(key: string): Partial<T> | null {
    const raw = storage.get(key);
    if (!raw) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? (parsed as Partial<T>) : null;
    } catch {
      return null;
    }
  },
  setJson(key: string, value: unknown): void {
    storage.set(key, JSON.stringify(value));
  },
};
