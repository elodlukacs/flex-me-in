import React from 'react';
import { Box } from 'ink';
import { useStore, shallowEqual } from '../state/store.js';
import { TitleBar } from '../components/layout/TitleBar.js';
import { TabBar } from '../components/layout/TabBar.js';
import { HelpText } from '../components/layout/HelpText.js';
import { StatusBar } from '../components/layout/StatusBar.js';
import { ThemePicker } from '../components/layout/ThemePicker.js';
import { Snackbar } from '../components/layout/Snackbar.js';
import { FilterBar } from '../components/filters/FilterBar.js';
import { TextInput } from '../components/filters/TextInput.js';
import { MainJobTable } from '../components/jobs/MainJobTable.js';
import { Pagination } from '../components/jobs/Pagination.js';
import { AiPanel } from '../components/jobs/AiPanel.js';
import { ProgressBar } from '../components/fetch/ProgressBar.js';
import { JobPopup } from '../components/jobs/JobPopup.js';

export function AppContent() {
  // Only re-render AppContent itself when overlay/layout switches occur.
  const { showJobPopup, popupJob, showThemePicker, terminalWidth, terminalHeight } = useStore(
    (s) => ({
      showJobPopup: s.showJobPopup,
      popupJob: s.popupJob,
      showThemePicker: s.showThemePicker,
      terminalWidth: s.terminalWidth,
      terminalHeight: s.terminalHeight,
    }),
    shallowEqual
  );

  return (
    <Box flexDirection="column" height={terminalHeight} width={terminalWidth}>
      <TitleBar />
      <TabBar />
      <FilterBar />
      <TextInput />
      <Box flexGrow={1} flexDirection="column">
        {showJobPopup && popupJob ? (
          <Box justifyContent="center" alignItems="center" flexGrow={1}>
            <JobPopup job={popupJob} width={terminalWidth} height={terminalHeight} />
          </Box>
        ) : showThemePicker ? (
          <Box justifyContent="center" alignItems="center" flexGrow={1}>
            <ThemePicker />
          </Box>
        ) : (
          <MainJobTable />
        )}
      </Box>
      <Pagination />
      <ProgressBar />
      <AiPanel />
      <Snackbar />
      <HelpText />
      <StatusBar />
    </Box>
  );
}
