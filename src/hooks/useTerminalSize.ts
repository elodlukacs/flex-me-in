import { useEffect } from 'react';
import { useScreenSize } from 'fullscreen-ink';
import { useDispatch } from '../state/store.js';

const FIXED_CHROME = 6;

export function useTerminalSize() {
  const dispatch = useDispatch();
  const { width, height } = useScreenSize();

  useEffect(() => {
    dispatch({ type: 'SET_TERMINAL_SIZE', width, height });
    const pageSize = Math.max(5, height - FIXED_CHROME);
    dispatch({ type: 'SET_PAGE_SIZE', size: pageSize });
  }, [width, height, dispatch]);
}
