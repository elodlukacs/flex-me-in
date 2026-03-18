import React from 'react';
import { useAppState } from '../../state/context.js';
import { selectPagedJobs } from '../../state/selectors.js';
import { JobTable } from './JobTable.js';

export function MainJobTable() {
  const { state } = useAppState();
  const pagedJobs = selectPagedJobs(state);

  return (
    <JobTable
      jobs={pagedJobs}
      selectedIndex={state.aiPanelFocused ? -1 : state.selectedIndex}
      width={state.terminalWidth}
      maxRows={state.mainVisibleRows}
    />
  );
}
