import React, { useMemo } from 'react';
import { useStore, shallowEqual } from '../../state/store.js';
import { JobTable } from './JobTable.js';

export function MainJobTable() {
  const { jobs, page, selectedIndex, terminalWidth, mainVisibleRows, aiPanelFocused } =
    useStore(
      (s) => ({
        jobs: s.jobs,
        page: s.page,
        selectedIndex: s.selectedIndex,
        terminalWidth: s.terminalWidth,
        mainVisibleRows: s.mainVisibleRows,
        aiPanelFocused: s.aiPanelFocused,
      }),
      shallowEqual
    );

  // mainVisibleRows is the page size (SET_VISIBLE_ROWS keeps them equal).
  const pagedJobs = useMemo(() => {
    const start = page * mainVisibleRows;
    return jobs.slice(start, start + mainVisibleRows);
  }, [jobs, page, mainVisibleRows]);

  return (
    <JobTable
      jobs={pagedJobs}
      selectedIndex={selectedIndex}
      focused={!aiPanelFocused}
      width={terminalWidth}
      maxRows={mainVisibleRows}
    />
  );
}
