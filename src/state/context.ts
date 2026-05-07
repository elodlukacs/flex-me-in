import type { AppState, Action } from './types.js';
import { useStore, useDispatch } from './store.js';

interface AppStateBundle {
  state: AppState;
  dispatch: (action: Action) => void;
}

// Backwards-compat: returns the entire state. Components that use this re-render
// on every dispatch. Prefer `useStore(selector)` for fine-grained subscriptions.
export function useAppState(): AppStateBundle {
  const state = useStore((s) => s);
  const dispatch = useDispatch();
  return { state, dispatch };
}
