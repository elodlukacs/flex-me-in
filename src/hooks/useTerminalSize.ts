import { useEffect } from 'react';
import { useScreenSize } from 'fullscreen-ink';
import { useAppState } from '../state/context.js';

const FIXED_CHROME = 6;

export function useTerminalSize() {
  const { dispatch } = useAppState();
  const { width, height } = useScreenSize();

  useEffect(() => {
    dispatch({ type: 'SET_TERMINAL_SIZE', width, height });
    const pageSize = Math.max(5, height - FIXED_CHROME);
    dispatch({ type: 'SET_PAGE_SIZE', size: pageSize });
  }, [width, height, dispatch]);
}
