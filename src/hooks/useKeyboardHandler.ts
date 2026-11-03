import { useInput, useApp } from 'ink';
import type { AppState, Source, Job, JobStatus, SourceFilter } from '../state/types.js';
import { selectCurrentJob, selectCurrentAiJob, selectPopupJob } from '../state/selectors.js';
import {
  updateJobStatus,
  clearAllJobs,
  getDistinctValues,
  getJobDescription,
  saveAiFilteredJobs,
} from '../db/repository.js';
import { openUrl } from '../utils/open.js';
import { useStoreInstance } from '../state/store.js';
import { beginAiFilter } from '../state/epochs.js';
import { setTheme } from '../utils/theme.js';
import { reloadJobs } from './useJobLoader.js';

// Keys 1-9 pick the visible source tab. Per-source fetch is `F`, which fetches
// whatever tab is active — the old 1-5 fetch bindings were dead code, shadowed
// by these tab bindings.
const TAB_KEYS: Record<string, SourceFilter> = {
  '1': 'all',
  '2': 'remoteok',
  '3': 'weworkremotely',
  '4': 'remotive',
  '5': 'linkedin',
  '6': 'justjoinit',
  '7': 'workable',
  '8': 'jobicy',
  '9': 'himalayas',
};

const TAB_ORDER: SourceFilter[] = Object.values(TAB_KEYS);

/**
 * `cancelAiFilter` should be `useAiFilter().cancelFilter`. The fallback only
 * invalidates the run (its results are dropped) without aborting the request.
 */
export function useKeyboardHandler(
  fetchAll: () => void,
  fetchOne: (source: Source) => void,
  cancelFetch: (discard?: boolean) => void,
  runAiFilter: (jobs: Job[], confirmed?: boolean) => void,
  cancelAiFilter: () => void = beginAiFilter
) {
  const store = useStoreInstance();
  const { dispatch } = store;
  const { exit } = useApp();

  const open = (url: string) => {
    openUrl(url).then(
      () => dispatch({ type: 'SHOW_SNACKBAR', message: `Opening ${url}` }),
      (err: unknown) =>
        dispatch({
          type: 'SET_STATUS',
          message: `Could not open link: ${err instanceof Error ? err.message : String(err)}`,
          statusType: 'error',
        })
    );
  };

  const setJobStatus = (
    job: Job,
    status: JobStatus,
    message: string,
    statusType: AppState['statusType']
  ) => {
    try {
      updateJobStatus(job.id, status);
    } catch (err) {
      dispatch({
        type: 'SET_STATUS',
        message: `Could not update "${job.title}": ${err instanceof Error ? err.message : String(err)}`,
        statusType: 'error',
      });
      return;
    }
    // In-place first (AI panel, open popup), then a reload: the row may now
    // fall outside the status filter, and the counts have changed.
    dispatch({ type: 'UPDATE_JOB_STATUS', id: job.id, status });
    reloadJobs(store);
    dispatch({ type: 'SET_STATUS', message, statusType });
  };

  useInput((input, key) => {
    const state = store.getState();

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

    // Destructive-action confirmation swallows everything else.
    if (state.pendingClearAll) {
      if (input === 'y') {
        // Stop and invalidate everything in flight first, or a fetch or AI run
        // finishing a moment later writes rows straight back.
        cancelFetch(true);
        cancelAiFilter();
        dispatch({ type: 'CANCEL_CLEAR_ALL' });
        try {
          clearAllJobs();
        } catch (err) {
          dispatch({
            type: 'SET_STATUS',
            message: `Clear failed: ${err instanceof Error ? err.message : String(err)}`,
            statusType: 'error',
          });
          return;
        }
        dispatch({ type: 'CLEAR_AI_FILTER' });
        reloadJobs(store);
        dispatch({ type: 'SET_STATUS', message: 'All jobs cleared', statusType: 'warning' });
      } else {
        dispatch({ type: 'CANCEL_CLEAR_ALL' });
      }
      return;
    }

    // Large AI runs cost real requests, so they wait for an explicit `y`.
    if (state.pendingAiFilter) {
      if (input === 'y') {
        const { jobs } = state.pendingAiFilter;
        dispatch({ type: 'CANCEL_AI_FILTER_REQUEST', silent: true });
        runAiFilter(jobs, true);
      } else {
        dispatch({ type: 'CANCEL_AI_FILTER_REQUEST' });
      }
      return;
    }

    // Overlays first: `q` must close the overlay, not quit the app.
    if (state.showHelp) {
      dispatch({ type: 'TOGGLE_HELP' });
      return;
    }

    if (state.showJobPopup) {
      if (key.escape || input === 'q') {
        dispatch({ type: 'CLOSE_JOB_POPUP' });
        return;
      }
      if (input === 'j' || key.downArrow) {
        dispatch({ type: 'POPUP_SCROLL', delta: 1 });
        return;
      }
      if (input === 'k' || key.upArrow) {
        dispatch({ type: 'POPUP_SCROLL', delta: -1 });
        return;
      }
      if (key.pageDown) {
        dispatch({ type: 'POPUP_SCROLL', delta: 10 });
        return;
      }
      if (key.pageUp) {
        dispatch({ type: 'POPUP_SCROLL', delta: -10 });
        return;
      }
      if (input === 'o') {
        // Popups opened from the AI panel aren't necessarily in `jobs`.
        const job = selectPopupJob(state);
        if (job?.url) open(job.url);
        return;
      }
      return;
    }

    if (state.showThemePicker) {
      if (key.escape || input === 'y' || input === 'q') {
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
        // Persisting the theme writes a file, so it happens here rather than
        // inside the reducer.
        setTheme(store.getState().themeId);
        return;
      }
      return;
    }

    // Quit. Ctrl+C never reaches this handler: Ink's exitOnCtrlC consumes it.
    if (input === 'q') {
      exit();
      return;
    }

    // Full keybinding list
    if (input === '?') {
      dispatch({ type: 'TOGGLE_HELP' });
      return;
    }

    // Cancel fetch (checked before the bare `s` status filter)
    if (input === 's' && key.ctrl) {
      cancelFetch();
      return;
    }

    // Wipe the DB — arms a confirmation rather than deleting immediately.
    if (input === 'd' && key.ctrl) {
      dispatch({ type: 'REQUEST_CLEAR_ALL' });
      return;
    }

    // Theme picker toggle
    if (input === 'y') {
      dispatch({ type: 'TOGGLE_THEME_PICKER' });
      return;
    }

    // Source filter tabs (1-9)
    const tab = TAB_KEYS[input];
    if (tab) {
      dispatch({ type: 'SET_SOURCE_FILTER', source: tab });
      return;
    }

    // Tab: toggle panel focus
    if (key.tab) {
      dispatch({ type: 'TOGGLE_PANEL_FOCUS' });
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

    // Clear AI results and collapse the panel. This discards the stored
    // results — it is not a non-destructive hide — and stops a run in flight,
    // which would otherwise repopulate the panel when it lands.
    if (input === 'G' && state.aiFilterStatus !== 'idle') {
      cancelAiFilter();
      saveAiFilteredJobs([]);
      dispatch({ type: 'CLEAR_AI_FILTER' });
      dispatch({ type: 'SET_STATUS', message: 'AI results cleared', statusType: 'info' });
      return;
    }

    // Fetch everything
    if (input === 'f' && !state.isFetching) {
      fetchAll();
      return;
    }

    // Fetch just the active tab's source
    if (input === 'F' && !state.isFetching) {
      if (state.sourceFilter === 'all') {
        fetchAll();
      } else {
        fetchOne(state.sourceFilter);
      }
      return;
    }

    // Filter: status cycle
    if (input === 's') {
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

    // Source: steps through the tabs. It used to set a second, independent
    // source filter, so tab A plus filter B showed an empty list.
    if (input === 'u') {
      const idx = TAB_ORDER.indexOf(state.sourceFilter);
      const next = TAB_ORDER[(idx + 1) % TAB_ORDER.length]!;
      dispatch({ type: 'SET_SOURCE_FILTER', source: next });
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
      // Open job popup. Descriptions are not carried in the list query, so
      // fetch it on demand.
      if (key.return) {
        dispatch({
          type: 'OPEN_JOB_POPUP',
          id: currentJob.id,
          description: getJobDescription(currentJob.id) || currentJob.description || '',
        });
        return;
      }

      // Toggle applied status
      if (input === 'a') {
        const applied = currentJob.status !== 'applied';
        setJobStatus(
          currentJob,
          applied ? 'applied' : 'new',
          applied
            ? `Marked "${currentJob.title}" as applied`
            : `Removed applied status from "${currentJob.title}"`,
          applied ? 'success' : 'info'
        );
        return;
      }
      // Toggle ignored status
      if (input === 'i') {
        const ignored = currentJob.status !== 'ignored';
        setJobStatus(
          currentJob,
          ignored ? 'ignored' : 'new',
          ignored
            ? `Marked "${currentJob.title}" as ignored`
            : `Removed ignored status from "${currentJob.title}"`,
          ignored ? 'warning' : 'info'
        );
        return;
      }
      // Set as new
      if (input === 'n') {
        setJobStatus(currentJob, 'new', `Marked "${currentJob.title}" as new`, 'info');
        return;
      }

      // Open URL
      if (input === 'o' && currentJob.url) {
        open(currentJob.url);
        return;
      }
    }
  });
}
