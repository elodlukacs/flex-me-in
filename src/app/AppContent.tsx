import React from 'react';
import { Box } from 'ink';
import { useStore, shallowEqual } from '../state/store.js';
import { selectPopupJob } from '../state/selectors.js';
import { selectLayout } from '../hooks/useLayout.js';
import { TitleBar } from '../components/layout/TitleBar.js';
import { TabBar } from '../components/layout/TabBar.js';
import { HelpText } from '../components/layout/HelpText.js';
import { HelpOverlay } from '../components/layout/HelpOverlay.js';
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
  const { showJobPopup, showThemePicker, showHelp, terminalWidth, terminalHeight } = useStore(
    (s) => ({
      showJobPopup: s.showJobPopup,
      showThemePicker: s.showThemePicker,
      showHelp: s.showHelp,
      terminalWidth: s.terminalWidth,
      terminalHeight: s.terminalHeight,
    }),
    shallowEqual
  );
  // The same budget useLayout publishes to the reducer: every chrome row is
  // exactly one line, so pinning the body and the AI panel to these heights
  // makes the frame add up to the terminal height.
  const { bodyRows, aiPanelRows } = useStore(selectLayout, shallowEqual);
  // Resolved by id, so status edits made while the popup is open show up.
  const popupJob = useStore(selectPopupJob);
  // An overlay also takes the AI panel's rows: beside the panel, the popup at
  // 80×24 had about two lines left for the description.
  const overlayOpen = (showJobPopup && !!popupJob) || showThemePicker || showHelp;
  const contentRows = overlayOpen ? bodyRows + aiPanelRows : bodyRows;

  return (
    <Box flexDirection="column" height={terminalHeight} width={terminalWidth}>
      <TitleBar />
      <TabBar />
      <FilterBar />
      <TextInput />
      <Box height={contentRows} flexShrink={0} flexDirection="column" overflow="hidden">
        {showJobPopup && popupJob ? (
          <Box justifyContent="center" flexGrow={1}>
            <JobPopup job={popupJob} width={terminalWidth} height={contentRows} />
          </Box>
        ) : showThemePicker ? (
          <Box justifyContent="center" alignItems="center" flexGrow={1}>
            <ThemePicker height={contentRows} />
          </Box>
        ) : showHelp ? (
          <Box justifyContent="center" alignItems="center" flexGrow={1}>
            <HelpOverlay width={terminalWidth} height={contentRows} />
          </Box>
        ) : (
          <MainJobTable />
        )}
      </Box>
      <Pagination />
      <ProgressBar />
      {/* Rendered only when there is something to show: when idle it still cost
          4 rows, which the row budget did not account for. */}
      {aiPanelRows > 0 && !overlayOpen && <AiPanel height={aiPanelRows} />}
      <Snackbar />
      <HelpText />
      <StatusBar />
    </Box>
  );
}
