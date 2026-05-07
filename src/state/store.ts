import { createContext, useCallback, useContext, useRef, useSyncExternalStore } from 'react';
import type { AppState, Action } from './types.js';
import { reducer } from './reducer.js';

type Listener = () => void;

export class Store {
  private state: AppState;
  private listeners = new Set<Listener>();

  constructor(initial: AppState) {
    this.state = initial;
  }

  getState = (): AppState => this.state;

  dispatch = (action: Action): void => {
    const next = reducer(this.state, action);
    if (next !== this.state) {
      this.state = next;
      this.listeners.forEach((l) => l());
    }
  };

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
}

export const StoreContext = createContext<Store | null>(null);

export function useStoreInstance(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStoreInstance must be used within StoreProvider');
  return store;
}

export function useDispatch(): Store['dispatch'] {
  return useStoreInstance().dispatch;
}

export function useStore<T>(
  selector: (state: AppState) => T,
  isEqual: (a: T, b: T) => boolean = Object.is
): T {
  const store = useStoreInstance();
  const cacheRef = useRef<{ state: AppState; value: T } | null>(null);

  const getSnapshot = useCallback((): T => {
    const state = store.getState();
    const cached = cacheRef.current;
    if (cached && cached.state === state) return cached.value;

    const next = selector(state);
    if (cached && isEqual(cached.value, next)) {
      cacheRef.current = { state, value: cached.value };
      return cached.value;
    }
    cacheRef.current = { state, value: next };
    return next;
    // selector / isEqual are intentionally captured per-render; cache handles stability.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  return useSyncExternalStore(store.subscribe, getSnapshot);
}

export function shallowEqual<T extends Record<string, unknown> | unknown[]>(
  a: T,
  b: T
): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false;

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!Object.is(a[i], b[i])) return false;
    }
    return true;
  }

  const keysA = Object.keys(a);
  const keysB = Object.keys(b as Record<string, unknown>);
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) {
    if (!Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  }
  return true;
}
