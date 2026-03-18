import { useInput, useApp } from 'ink';
import type { Source, Job, SourceFilter } from '../state/types.js';
import { ALL_SOURCES } from '../state/types.js';
import { selectCurrentJob, selectCurrentAiJob } from '../state/selectors.js';
import { updateJobStatus, clearAllJobs, getDistinctValues } from '../db/repository.js';
import { openUrl } from '../utils/open.js';
import { useAppState } from '../state/context.js';

const SOURCE_KEYS: Record<string, Source> = {
  '1': 'remoteok',
  '2': 'weworkremotely',
  '3': 'himalayas',
  '4': 'remotive',
  '5': 'arbeitnow',
  '6': 'linkedin',
  '7': 'indeed',
  '8': 'hackernews',
};

export function useKeyboardHandler(
  fetchAll: () => void,
  fetchOne: (source: Source) => void,
  cancelFetch: () => void,
  runAiFilter: (jobs: Job[]) => void
) {
  const { state, dispatch } = useAppState();
  const { exit } = useApp();

  useInput((input, key) => {
    // Text input mode
    if (state.inputMode !== 'none') {
      if (key.return) {
        dispatch({ type: 'SUBMIT_INPUT' });
        return;
      }
      if (key.escape) {
        dispatch({ type: 'CANCEL_INPUT' });
        return;
      }
      return;
    }

    // Quit
    if (input === 'q' || (input === 'c' && key.ctrl)) {
      exit();
      return;
    }

    // Close popup
    if (state.showJobPopup) {
      if (key.escape || input === 'q') {
        dispatch({ type: 'CLOSE_JOB_POPUP' });
        return;
      }
      return;
    }

    // Theme picker
    if (state.showThemePicker) {
      if (key.escape || input === 'y') {
        dispatch({ type: 'TOGGLE_THEME_PICKER' });
        return;
      }
      if (input === 'j' || key.downArrow) {
        dispatch({ type: 'THEME_NAVIGATE', direction: 'down' });
        return;
      }
      if (input === 'k' || key.upArrow) {
        dispatch({ type: 'THEME_NAVIGATE', direction: 'up' });
        return;
      }
      if (key.return) {
        dispatch({ type: 'SET_THEME_FROM_PICKER' });
        return;
      }
      return;
    }

    // Theme picker toggle
    if (input === 'y') {
      dispatch({ type: 'TOGGLE_THEME_PICKER' });
      return;
    }

    // Source filter tabs (1-9)
    const TAB_KEYS: Record<string, SourceFilter> = {
      '1': 'all',
      '2': 'remoteok',
      '3': 'weworkremotely',
      '4': 'himalayas',
      '5': 'remotive',
      '6': 'arbeitnow',
      '7': 'linkedin',
      '8': 'indeed',
      '9': 'hackernews',
    };
    if (TAB_KEYS[input]) {
      dispatch({ type: 'SET_SOURCE_FILTER', source: TAB_KEYS[input] });
      return;
    }

    // Tab: toggle panel focus
    if (key.tab) {
      if (state.aiFilterStatus !== 'idle') {
        dispatch({ type: 'TOGGLE_PANEL_FOCUS' });
      }
      return;
    }

    // Navigation — route to correct panel
    if (input === 'j' || key.downArrow) {
      dispatch({ type: state.aiPanelFocused ? 'AI_NAVIGATE' : 'NAVIGATE', direction: 'down' });
      return;
    }
    if (input === 'k' || key.upArrow) {
      dispatch({ type: state.aiPanelFocused ? 'AI_NAVIGATE' : 'NAVIGATE', direction: 'up' });
      return;
    }

    // Pagination — route to correct panel
    if (key.rightArrow || key.pageDown) {
      dispatch({ type: state.aiPanelFocused ? 'AI_PAGE' : 'PAGE', direction: 'next' });
      return;
    }
    if (key.leftArrow || key.pageUp) {
      dispatch({ type: state.aiPanelFocused ? 'AI_PAGE' : 'PAGE', direction: 'prev' });
      return;
    }

    // AI filter
    if (input === 'g' && state.aiFilterStatus !== 'filtering') {
      runAiFilter(state.jobs);
      return;
    }

    // Fetch
    if (input === 'f' && !state.isFetching) {
      fetchAll();
      return;
    }

    // Individual source fetch (1-5)
    if (SOURCE_KEYS[input] && !state.isFetching) {
      fetchOne(SOURCE_KEYS[input]);
      return;
    }

    // Cancel fetch
    if (input === 's' && key.ctrl) {
      cancelFetch();
      return;
    }

    // Filter: status cycle
    if (input === 's' && !key.ctrl) {
      const values = getDistinctValues('status');
      dispatch({ type: 'CYCLE_FILTER', key: 'status', values });
      return;
    }

    // Filter: work type cycle
    if (input === 'w') {
      const values = getDistinctValues('work_type');
      dispatch({ type: 'CYCLE_FILTER', key: 'workType', values });
      return;
    }

    // Filter: source cycle
    if (input === 'u') {
      const values = getDistinctValues('source');
      dispatch({ type: 'CYCLE_FILTER', key: 'source', values });
      return;
    }

    // Filter: text inputs
    if (input === 't') {
      dispatch({ type: 'START_INPUT', mode: 'title' });
      return;
    }
    if (input === 'c') {
      dispatch({ type: 'START_INPUT', mode: 'company' });
      return;
    }
    if (input === 'm') {
      dispatch({ type: 'START_INPUT', mode: 'country' });
      return;
    }

    // Clear all filters
    if (input === 'x') {
      dispatch({ type: 'CLEAR_FILTERS' });
      return;
    }

    // Job status actions — operate on focused panel's selected job
    const currentJob = state.aiPanelFocused
      ? selectCurrentAiJob(state)
      : selectCurrentJob(state);

    if (currentJob) {
      // Open job popup
      if (key.return) {
        dispatch({ type: 'OPEN_JOB_POPUP', job: currentJob });
        return;
      }

      // Toggle applied status
      if (input === 'a') {
        const newStatus = currentJob.status === 'applied' ? 'new' : 'applied';
        updateJobStatus(currentJob.id, newStatus);
        dispatch({ type: 'UPDATE_JOB_STATUS', id: currentJob.id, status: newStatus });
        const msg = newStatus === 'applied' 
          ? `Marked "${currentJob.title}" as applied`
          : `Removed applied status from "${currentJob.title}"`;
        dispatch({ type: 'SET_STATUS', message: msg, statusType: newStatus === 'applied' ? 'success' : 'info' });
        return;
      }
      // Toggle ignored status
      if (input === 'i') {
        const newStatus = currentJob.status === 'ignored' ? 'new' : 'ignored';
        updateJobStatus(currentJob.id, newStatus);
        dispatch({ type: 'UPDATE_JOB_STATUS', id: currentJob.id, status: newStatus });
        const msg = newStatus === 'ignored' 
          ? `Marked "${currentJob.title}" as ignored`
          : `Removed ignored status from "${currentJob.title}"`;
        dispatch({ type: 'SET_STATUS', message: msg, statusType: newStatus === 'ignored' ? 'warning' : 'info' });
        return;
      }
      // Set as new
      if (input === 'n') {
        updateJobStatus(currentJob.id, 'new');
        dispatch({ type: 'UPDATE_JOB_STATUS', id: currentJob.id, status: 'new' });
        dispatch({ type: 'SET_STATUS', message: `Marked "${currentJob.title}" as new`, statusType: 'info' });
        return;
      }

      // Open URL
      if (input === 'o' && currentJob.url) {
        openUrl(currentJob.url).catch(() => {});
        dispatch({ type: 'SHOW_SNACKBAR', message: `Opening ${currentJob.url}` });
        return;
      }
    }

    // Clear all jobs
    if (input === 'd' && key.ctrl) {
      clearAllJobs();
      dispatch({ type: 'SET_JOBS', jobs: [] });
      dispatch({ type: 'SET_STATUS', message: 'All jobs cleared', statusType: 'warning' });
      return;
    }
  });
}
