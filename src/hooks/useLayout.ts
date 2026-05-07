import { useEffect } from 'react';
import { useStore, useDispatch, shallowEqual } from '../state/store.js';

const FIXED_CHROME = 6;
const AI_PANEL_CHROME = 4;

export function useLayout() {
  const dispatch = useDispatch();
  const { height, aiActive } = useStore(
    (s) => ({ height: s.terminalHeight, aiActive: s.aiFilterStatus !== 'idle' }),
    shallowEqual
  );

  const mainHeaderRow = 1;
  const availableRows = Math.max(6, height - FIXED_CHROME);

  let mainTableRows: number;
  let aiContentRows: number;

  if (aiActive) {
    const aiPanelRows = Math.max(5, Math.floor(availableRows * 0.5));
    mainTableRows = Math.max(1, availableRows - aiPanelRows - mainHeaderRow);
    aiContentRows = Math.max(1, aiPanelRows - AI_PANEL_CHROME - 1);
  } else {
    mainTableRows = Math.max(1, availableRows - mainHeaderRow);
    aiContentRows = 0;
  }

  useEffect(() => {
    dispatch({ type: 'SET_VISIBLE_ROWS', main: mainTableRows, ai: aiContentRows });
  }, [mainTableRows, aiContentRows, dispatch]);
}
