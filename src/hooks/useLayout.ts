import { useEffect } from 'react';
import { useAppState } from '../state/context.js';

const FIXED_CHROME = 6;
const AI_PANEL_CHROME = 4;

export function useLayout() {
  const { state, dispatch } = useAppState();
  const height = state.terminalHeight;
  const aiActive = state.aiFilterStatus !== 'idle';

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
