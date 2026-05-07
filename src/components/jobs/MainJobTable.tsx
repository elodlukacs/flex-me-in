import React, { useMemo } from 'react';
import { useStore, shallowEqual } from '../../state/store.js';
import { JobTable } from './JobTable.js';

export function MainJobTable() {
  const { jobs, page, pageSize, selectedIndex, terminalWidth, mainVisibleRows, aiPanelFocused } =
    useStore(
      (s) => ({
        jobs: s.jobs,
        page: s.page,
        pageSize: s.pageSize,
        selectedIndex: s.selectedIndex,
        terminalWidth: s.terminalWidth,
        mainVisibleRows: s.mainVisibleRows,
        aiPanelFocused: s.aiPanelFocused,
      }),
      shallowEqual
    );

  const pagedJobs = useMemo(() => {
    const start = page * pageSize;
    return jobs.slice(start, start + pageSize);
  }, [jobs, page, pageSize]);

  return (
    <JobTable
      jobs={pagedJobs}
      selectedIndex={aiPanelFocused ? -1 : selectedIndex}
      width={terminalWidth}
      maxRows={mainVisibleRows}
    />
  );
}
