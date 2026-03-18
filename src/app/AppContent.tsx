import React from 'react';
import { Box } from 'ink';
import { useAppState } from '../state/context.js';
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
  const { state } = useAppState();

  return (
    <Box flexDirection="column" height={state.terminalHeight} width={state.terminalWidth}>
      <TitleBar />
      <TabBar />
      <FilterBar />
      <TextInput />
      <Box flexGrow={1} flexDirection="column">
        {state.showJobPopup && state.popupJob ? (
          <Box justifyContent="center" alignItems="center" flexGrow={1}>
            <JobPopup job={state.popupJob} width={state.terminalWidth} height={state.terminalHeight} />
          </Box>
        ) : state.showThemePicker ? (
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
