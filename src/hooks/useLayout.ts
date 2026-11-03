import { useEffect } from 'react';
import { useStore, useDispatch, shallowEqual } from '../state/store.js';
import type { AppState } from '../state/types.js';

/** Rows that are always on screen: title, tabs, pagination, progress, help, status. */
const BASE_CHROME = 6;
/**
 * AiPanel: top border + title row + JobTable column header + bottom border.
 * The column header used to be left out, so the panel was a row taller than
 * budgeted and overprinted the main table's last (still selectable) row.
 */
export const AI_PANEL_CHROME = 4;
/** JobTable renders its own column header row. */
const TABLE_HEADER = 1;

export interface LayoutInput {
  height: number;
  aiActive: boolean;
  hasFilters: boolean;
  inputActive: boolean;
  snackbarVisible: boolean;
}

// A type alias, not an interface: `shallowEqual` needs an implicit index signature.
export type Layout = {
  /** Height of the middle area: the job table, or the overlay replacing it. */
  bodyRows: number;
  /** Total AiPanel height including its chrome; 0 when hidden. */
  aiPanelRows: number;
  mainTableRows: number;
  aiContentRows: number;
};

/**
 * The single owner of the row budget. Every component outside the body is
 * exactly one row (they truncate rather than wrap), so the body gets whatever
 * the chrome leaves, and AppContent pins each region to these heights.
 */
export function computeLayout({
  height,
  aiActive,
  hasFilters,
  inputActive,
  snackbarVisible,
}: LayoutInput): Layout {
  // These three components render nothing when inactive, so they only cost a
  // row when they are actually on screen.
  const chrome =
    BASE_CHROME + (hasFilters ? 1 : 0) + (inputActive ? 1 : 0) + (snackbarVisible ? 1 : 0);

  const availableRows = Math.max(TABLE_HEADER + 1, height - chrome);

  if (!aiActive) {
    return {
      bodyRows: availableRows,
      aiPanelRows: 0,
      mainTableRows: Math.max(1, availableRows - TABLE_HEADER),
      aiContentRows: 0,
    };
  }

  const aiPanelRows = Math.max(AI_PANEL_CHROME + 1, Math.floor(availableRows * 0.45));
  const bodyRows = Math.max(TABLE_HEADER + 1, availableRows - aiPanelRows);
  return {
    bodyRows,
    aiPanelRows,
    mainTableRows: bodyRows - TABLE_HEADER,
    aiContentRows: aiPanelRows - AI_PANEL_CHROME,
  };
}

export function selectLayout(s: AppState): Layout {
  return computeLayout({
    height: s.terminalHeight,
    aiActive: s.aiFilterStatus !== 'idle',
    hasFilters: Object.values(s.filters).some((v) => v !== ''),
    inputActive: s.inputMode !== 'none',
    snackbarVisible: s.snackbar.visible,
  });
}

/**
 * Publishes the row budget to the reducer. `mainVisibleRows` doubles as the
 * page size (see SET_VISIBLE_ROWS), so what is rendered and what is paged can
 * never disagree.
 */
export function useLayout() {
  const dispatch = useDispatch();
  const { mainTableRows, aiContentRows } = useStore(selectLayout, shallowEqual);

  useEffect(() => {
    dispatch({ type: 'SET_VISIBLE_ROWS', main: mainTableRows, ai: aiContentRows });
  }, [mainTableRows, aiContentRows, dispatch]);
}
