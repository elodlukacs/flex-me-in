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
  const cacheRef = useRef<{ state: AppState; selector: (s: AppState) => T; value: T } | null>(
    null
  );

  // Rebuilt whenever the selector changes. Memoising on `[store]` alone kept
  // the first render's selector forever, so a selector closing over a prop
  // kept reading the prop's first value. The cache is keyed by selector too,
  // and `isEqual` keeps the returned value stable for inline selectors that
  // are new on every render.
  const getSnapshot = useCallback((): T => {
    const state = store.getState();
    const cached = cacheRef.current;
    if (cached && cached.state === state && cached.selector === selector) return cached.value;

    const next = selector(state);
    if (cached && isEqual(cached.value, next)) {
      cacheRef.current = { state, selector, value: cached.value };
      return cached.value;
    }
    cacheRef.current = { state, selector, value: next };
    return next;
  }, [store, selector, isEqual]);

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
