import { useEffect } from 'react';
import { useScreenSize } from 'fullscreen-ink';
import { useDispatch } from '../state/store.js';

/**
 * Reports the terminal size only. Row budgeting lives entirely in `useLayout`
 * — two hooks deriving row counts from the same height with different formulas
 * is what made the bottom rows clip and the layout jump.
 */
export function useTerminalSize() {
  const dispatch = useDispatch();
  const { width, height } = useScreenSize();

  useEffect(() => {
    dispatch({ type: 'SET_TERMINAL_SIZE', width, height });
  }, [width, height, dispatch]);
}
