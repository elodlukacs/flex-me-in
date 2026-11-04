import type {
  AppState,
  Action,
  Job,
  Source,
  FetchSourceStatus,
  FilterState,
  SourceFilter,
} from './types.js';
import { ALL_SOURCES } from './types.js';
import { getActiveThemeId, themeIds } from '../utils/theme.js';

const EMPTY_FILTERS: FilterState = {
  status: '',
  workType: '',
  title: '',
  company: '',
  country: '',
};

/**
 * Pure: no DB reads, no filesystem writes. AI results are loaded by
 * `useHydrate` and delivered via HYDRATE; the theme file write happens at the
 * dispatch site, not here.
 */
export function createInitialState(): AppState {
  const fetchStatus = {} as Record<Source, FetchSourceStatus>;
  for (const source of ALL_SOURCES) {
    fetchStatus[source] = { source, status: 'idle', count: 0 };
  }

  return {
    jobs: [],
    selectedIndex: 0,
    page: 0,
    pageSize: 20,
    filters: { ...EMPTY_FILTERS },
    sourceFilter: 'all' as SourceFilter,
    inputMode: 'none',
    inputValue: '',
    fetchStatus,
    fetchRunSources: [],
    isFetching: false,
    statusMessage: 'Press f to fetch jobs, ? for help',
    statusType: 'info',
    showHelp: false,
    showThemePicker: false,
    themePickerIndex: Math.max(0, themeIds.indexOf(getActiveThemeId())),
    themeId: getActiveThemeId(),
    aiJobs: [],
    aiRemoteMap: new Map(),
    aiSubmittedJobs: [],
    aiFilterStatus: 'idle',
    aiError: '',
    aiPanelFocused: false,
    aiSelectedIndex: 0,
    aiPage: 0,
    mainVisibleRows: 20,
    aiVisibleRows: 10,
    terminalWidth: 80,
    terminalHeight: 24,
    jobCounts: { total: 0, new: 0, saved: 0, applied: 0, ignored: 0 },
    snackbar: { message: '', visible: false },
    showJobPopup: false,
    popupJobId: null,
    popupDescription: '',
    popupScroll: 0,
    popupMaxScroll: 0,
    pendingClearAll: false,
    pendingAiFilter: null,
  };
}

/** Rows per page; `pageSize` mirrors it for components that still read that. */
function mainPageSize(state: AppState): number {
  return Math.max(1, state.mainVisibleRows);
}

function aiPageSize(state: AppState): number {
  return Math.max(1, state.aiVisibleRows);
}

function clampInt(value: number, max: number): number {
  return Math.max(0, Math.min(value, max));
}

/**
 * Keeps page and selection pointing into the real page slice. Each action used
 * to clamp on its own terms — SET_JOBS against the whole list, a resize
 * against the row count, aiPage never — so a shrinking list or a taller AI
 * panel could leave the cursor past the last row, where `a`/`i`/`o` did
 * nothing. Running after every change makes it one invariant.
 */
export function clampView(state: AppState): AppState {
  const size = mainPageSize(state);
  const page = clampInt(state.page, Math.ceil(state.jobs.length / size) - 1);
  const sliceLen = Math.min(size, state.jobs.length - page * size);
  const selectedIndex = clampInt(state.selectedIndex, sliceLen - 1);

  const aiSize = aiPageSize(state);
  const aiPage = clampInt(state.aiPage, Math.ceil(state.aiJobs.length / aiSize) - 1);
  const aiSliceLen = Math.min(aiSize, state.aiJobs.length - aiPage * aiSize);
  const aiSelectedIndex = clampInt(state.aiSelectedIndex, aiSliceLen - 1);
  // Focus must not stay in an empty panel: navigation there is a dead end.
  const aiPanelFocused = state.aiPanelFocused && state.aiJobs.length > 0;

  if (
    page === state.page &&
    selectedIndex === state.selectedIndex &&
    aiPage === state.aiPage &&
    aiSelectedIndex === state.aiSelectedIndex &&
    aiPanelFocused === state.aiPanelFocused
  ) {
    return state;
  }
  return { ...state, page, selectedIndex, aiPage, aiSelectedIndex, aiPanelFocused };
}

export function reducer(state: AppState, action: Action): AppState {
  const next = baseReducer(state, action);
  return next === state ? state : clampView(next);
}

function baseReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'HYDRATE': {
      // Decide from the joined rows, not the raw result ids: results whose job
      // is gone would otherwise mark the panel "done" with nothing in it.
      if (action.aiJobs.length === 0) return state;
      const listed = new Set(action.aiJobs.map((j) => j.id));
      return {
        ...state,
        aiJobs: action.aiJobs,
        aiRemoteMap: new Map(
          action.aiResults.filter((r) => listed.has(r.id)).map((r) => [r.id, r.remote])
        ),
        aiFilterStatus: 'done',
      };
    }

    case 'NAVIGATE': {
      const size = mainPageSize(state);
      const start = state.page * size;
      const end = Math.min(start + size, state.jobs.length);
      const maxIdx = end - start - 1;
      if (maxIdx < 0) return state;

      let newIndex = state.selectedIndex;
      if (action.direction === 'down') {
        newIndex = Math.min(state.selectedIndex + 1, maxIdx);
      } else {
        newIndex = Math.max(state.selectedIndex - 1, 0);
      }
      return { ...state, selectedIndex: newIndex };
    }

    case 'PAGE': {
      const totalPages = Math.max(1, Math.ceil(state.jobs.length / mainPageSize(state)));
      let newPage = state.page;
      if (action.direction === 'next') {
        newPage = Math.min(state.page + 1, totalPages - 1);
      } else {
        newPage = Math.max(state.page - 1, 0);
      }
      return { ...state, page: newPage, selectedIndex: 0 };
    }

    case 'SET_JOBS':
      // Page and selection are clamped against the new slice by clampView.
      return { ...state, jobs: action.jobs };

    case 'SET_STATUS':
      return {
        ...state,
        statusMessage: action.message,
        statusType: action.statusType ?? 'info',
      };

    case 'CYCLE_FILTER': {
      const currentVal = state.filters[action.key];
      const values = ['', ...action.values];
      const currentIdx = values.indexOf(currentVal);
      const nextIdx = (currentIdx + 1) % values.length;
      return {
        ...state,
        filters: { ...state.filters, [action.key]: values[nextIdx]! },
        page: 0,
        selectedIndex: 0,
      };
    }

    case 'CLEAR_FILTERS':
      return {
        ...state,
        filters: { ...EMPTY_FILTERS },
        page: 0,
        selectedIndex: 0,
      };

    case 'START_INPUT': {
      const currentFilterVal = action.mode !== 'none' ? (state.filters[action.mode as keyof typeof state.filters] ?? '') : '';
      return {
        ...state,
        inputMode: action.mode,
        inputValue: currentFilterVal,
      };
    }

    case 'SET_INPUT_VALUE':
      return { ...state, inputValue: action.value };

    case 'SUBMIT_INPUT': {
      if (state.inputMode === 'none') return state;
      return {
        ...state,
        filters: { ...state.filters, [state.inputMode]: state.inputValue },
        inputMode: 'none',
        inputValue: '',
        page: 0,
        selectedIndex: 0,
      };
    }

    case 'CANCEL_INPUT':
      return { ...state, inputMode: 'none', inputValue: '' };

    case 'FETCH_START': {
      const fetchStatus = { ...state.fetchStatus };
      for (const source of action.sources) {
        fetchStatus[source] = { source, status: 'fetching', count: 0 };
      }
      return {
        ...state,
        fetchStatus,
        fetchRunSources: action.sources,
        isFetching: true,
        statusMessage: 'Fetching senior frontend roles...',
        statusType: 'info',
      };
    }

    case 'FETCH_PROGRESS': {
      const fetchStatus = { ...state.fetchStatus };
      fetchStatus[action.source] = {
        ...fetchStatus[action.source],
        count: action.count,
      };
      return { ...state, fetchStatus };
    }

    case 'FETCH_DONE': {
      const fetchStatus = { ...state.fetchStatus };
      fetchStatus[action.source] = {
        source: action.source,
        status: 'done',
        count: action.count,
        partial: action.complete === false,
      };
      return { ...state, fetchStatus, isFetching: stillFetching(fetchStatus) };
    }

    case 'FETCH_ERROR': {
      const fetchStatus = { ...state.fetchStatus };
      fetchStatus[action.source] = {
        source: action.source,
        status: 'error',
        count: 0,
        error: action.error,
      };
      return { ...state, fetchStatus, isFetching: stillFetching(fetchStatus) };
    }

    case 'FETCH_CANCELLED': {
      const fetchStatus = { ...state.fetchStatus };
      if (action.source) {
        fetchStatus[action.source] = {
          ...fetchStatus[action.source],
          status: 'cancelled',
        };
      } else {
        for (const key of ALL_SOURCES) {
          if (fetchStatus[key].status === 'fetching') {
            fetchStatus[key] = { ...fetchStatus[key], status: 'cancelled' };
          }
        }
      }
      // One source being cancelled does not mean the run is over — clearing
      // isFetching here re-enabled `f` while other sources were still in
      // flight.
      const busy = stillFetching(fetchStatus);
      return {
        ...state,
        fetchStatus,
        isFetching: busy,
        ...(busy
          ? {}
          : { statusMessage: 'Fetch cancelled', statusType: 'warning' as const }),
      };
    }

    case 'FETCH_ALL_DONE': {
      // Report partial failure instead of an unconditional "Fetch complete".
      // Only this run's sources count: a single-source fetch used to repeat
      // errors left over from the previous full run.
      const statuses = state.fetchRunSources.map((s) => state.fetchStatus[s]);
      const errors = statuses.filter((s) => s.status === 'error');
      const cancelled = statuses.filter((s) => s.status === 'cancelled');
      const partial = statuses.filter((s) => s.status === 'done' && s.partial);
      const added = statuses
        .filter((s) => s.status === 'done')
        .reduce((sum, s) => sum + s.count, 0);

      const problems: string[] = [];
      if (errors.length > 0) {
        problems.push(
          `${errors.length} source${errors.length > 1 ? 's' : ''} failed: ${errors
            .map((e) => e.source)
            .join(', ')}`
        );
      }
      if (partial.length > 0) {
        problems.push(`stopped early: ${partial.map((p) => p.source).join(', ')}`);
      }
      if (cancelled.length > 0) {
        problems.push(`${cancelled.length} cancelled`);
      }

      const statusMessage =
        problems.length > 0
          ? `Fetched ${added} roles — ${problems.join('; ')}`
          : `Fetch complete — ${added} senior frontend roles`;
      const statusType: AppState['statusType'] = problems.length > 0 ? 'warning' : 'success';

      return { ...state, isFetching: false, statusMessage, statusType };
    }

    case 'UPDATE_JOB_STATUS': {
      const jobs = state.jobs.map((j) =>
        j.id === action.id ? { ...j, status: action.status } : j
      );
      const aiJobs = state.aiJobs.map((j) =>
        j.id === action.id ? { ...j, status: action.status } : j
      );
      return { ...state, jobs, aiJobs };
    }

    case 'TOGGLE_HELP':
      return { ...state, showHelp: !state.showHelp };

    case 'SET_TERMINAL_SIZE':
      return { ...state, terminalWidth: action.width, terminalHeight: action.height };

    case 'CLEAR_AI_FILTER':
      return {
        ...state,
        aiJobs: [],
        aiRemoteMap: new Map(),
        aiSubmittedJobs: [],
        aiFilterStatus: 'idle',
        aiError: '',
        aiPanelFocused: false,
        aiSelectedIndex: 0,
        aiPage: 0,
        pendingAiFilter: null,
      };

    case 'REQUEST_AI_FILTER':
      return {
        ...state,
        pendingAiFilter: { jobs: action.jobs, batches: action.batches },
        statusMessage: `Send ${action.jobs.length} jobs to the AI filter in ${action.batches} batches? y to confirm, any other key to cancel`,
        statusType: 'warning',
      };

    case 'CANCEL_AI_FILTER_REQUEST':
      if (!state.pendingAiFilter) return state;
      // `silent` on confirm: AI_FILTER_START is about to set its own status.
      return action.silent
        ? { ...state, pendingAiFilter: null }
        : { ...state, pendingAiFilter: null, statusMessage: 'Cancelled', statusType: 'info' };

    case 'AI_FILTER_START':
      return {
        ...state,
        aiFilterStatus: 'filtering',
        aiError: '',
        aiSubmittedJobs: action.submitted,
        // Focus must not stay in a panel that is about to be empty.
        aiPanelFocused: false,
        aiSelectedIndex: 0,
        aiPage: 0,
        statusMessage: `AI filtering ${action.submitted.length} jobs...`,
        statusType: 'info',
      };

    case 'AI_FILTER_PROGRESS':
      return {
        ...state,
        statusMessage: `AI filtering — batch ${action.batch}/${action.total}`,
        statusType: 'info',
      };

    case 'AI_FILTER_DONE': {
      // Match against what was submitted, not against the currently filtered
      // list: changing a filter mid-flight used to discard every result.
      const submitted = new Map(state.aiSubmittedJobs.map((j) => [j.id, j]));
      const validResults = action.results.filter((r) => submitted.has(r.id));
      const validIds = new Set(validResults.map((r) => r.id));
      const remoteMap = new Map(validResults.map((r) => [r.id, r.remote]));
      // Prefer the live row (current status) when it is still listed.
      const liveById = new Map(state.jobs.map((j) => [j.id, j]));
      const aiJobs = validResults.map((r) => liveById.get(r.id) ?? submitted.get(r.id)!);
      const dropped = action.results.length - validResults.length;

      return {
        ...state,
        aiJobs,
        aiRemoteMap: remoteMap,
        aiFilterStatus: 'done',
        aiSelectedIndex: 0,
        aiPage: 0,
        statusMessage:
          dropped > 0
            ? `AI found ${validIds.size} matching roles (${dropped} no longer listed)`
            : `AI found ${validIds.size} matching roles`,
        statusType: 'success',
      };
    }

    case 'AI_FILTER_ERROR':
      return {
        ...state,
        aiFilterStatus: 'error',
        aiError: action.error,
        aiPanelFocused: false,
        statusMessage: `AI filter: ${action.error}`,
        statusType: 'error',
      };

    case 'AI_NAVIGATE': {
      const size = aiPageSize(state);
      const aiStart = state.aiPage * size;
      const aiEnd = Math.min(aiStart + size, state.aiJobs.length);
      const maxIdx = aiEnd - aiStart - 1;
      if (maxIdx < 0) return state;

      let newIdx = state.aiSelectedIndex;
      if (action.direction === 'down') {
        newIdx = Math.min(state.aiSelectedIndex + 1, maxIdx);
      } else {
        newIdx = Math.max(state.aiSelectedIndex - 1, 0);
      }
      return { ...state, aiSelectedIndex: newIdx };
    }

    case 'AI_PAGE': {
      const aiTotalPages = Math.max(1, Math.ceil(state.aiJobs.length / aiPageSize(state)));
      let newPage = state.aiPage;
      if (action.direction === 'next') {
        newPage = Math.min(state.aiPage + 1, aiTotalPages - 1);
      } else {
        newPage = Math.max(state.aiPage - 1, 0);
      }
      return { ...state, aiPage: newPage, aiSelectedIndex: 0 };
    }

    case 'TOGGLE_PANEL_FOCUS':
      // Tabbing into an empty panel trapped navigation with no way back.
      if (!state.aiPanelFocused && state.aiJobs.length === 0) return state;
      return { ...state, aiPanelFocused: !state.aiPanelFocused };

    case 'SET_VISIBLE_ROWS':
      // One source of truth for how many rows fit: the page size IS the number
      // of visible rows. When they were computed separately, the last row of
      // every page was unreachable. clampView re-fits page and selection.
      if (state.mainVisibleRows === action.main && state.aiVisibleRows === action.ai) {
        return state;
      }
      return {
        ...state,
        mainVisibleRows: action.main,
        aiVisibleRows: action.ai,
        pageSize: action.main,
      };

    case 'TOGGLE_THEME_PICKER':
      return {
        ...state,
        showThemePicker: !state.showThemePicker,
        themePickerIndex: Math.max(0, themeIds.indexOf(state.themeId)),
      };

    case 'THEME_NAVIGATE': {
      const maxIdx = themeIds.length - 1;
      let newIdx = state.themePickerIndex;
      if (action.direction === 'down') {
        newIdx = Math.min(newIdx + 1, maxIdx);
      } else {
        newIdx = Math.max(newIdx - 1, 0);
      }
      return { ...state, themePickerIndex: newIdx };
    }

    case 'SET_THEME_FROM_PICKER': {
      // The `setTheme()` file write lives at the dispatch site.
      const id = themeIds[state.themePickerIndex]!;
      return { ...state, themeId: id, showThemePicker: false };
    }

    case 'SET_JOB_COUNTS':
      return { ...state, jobCounts: action.counts };

    case 'SET_LAST_REFRESH':
      return state.lastRefreshAt === action.at ? state : { ...state, lastRefreshAt: action.at };

    case 'MARK_JOB_SEEN': {
      const mark = (j: Job): Job => (j.id === action.id && !j.seen ? { ...j, seen: true } : j);
      return { ...state, jobs: state.jobs.map(mark), aiJobs: state.aiJobs.map(mark) };
    }

    case 'SHOW_SNACKBAR':
      return { ...state, snackbar: { message: action.message, visible: true } };

    case 'HIDE_SNACKBAR':
      return { ...state, snackbar: { message: '', visible: false } };

    case 'SET_SOURCE_FILTER':
      return { ...state, sourceFilter: action.source, page: 0, selectedIndex: 0 };

    case 'OPEN_JOB_POPUP':
      return {
        ...state,
        showJobPopup: true,
        popupJobId: action.id,
        popupDescription: action.description,
        popupScroll: 0,
        popupMaxScroll: 0,
      };

    case 'CLOSE_JOB_POPUP':
      return {
        ...state,
        showJobPopup: false,
        popupJobId: null,
        popupDescription: '',
        popupScroll: 0,
        popupMaxScroll: 0,
      };

    case 'POPUP_SCROLL': {
      const next = Math.max(0, Math.min(state.popupScroll + action.delta, state.popupMaxScroll));
      if (next === state.popupScroll) return state;
      return { ...state, popupScroll: next };
    }

    case 'SET_POPUP_MAX_SCROLL': {
      if (action.max === state.popupMaxScroll) return state;
      return {
        ...state,
        popupMaxScroll: action.max,
        popupScroll: Math.min(state.popupScroll, action.max),
      };
    }

    case 'REQUEST_CLEAR_ALL':
      return {
        ...state,
        pendingClearAll: true,
        statusMessage: 'Delete ALL jobs including applied/ignored? y to confirm, any other key to cancel',
        statusType: 'warning',
      };

    case 'CANCEL_CLEAR_ALL':
      if (!state.pendingClearAll) return state;
      return { ...state, pendingClearAll: false, statusMessage: 'Cancelled', statusType: 'info' };

    default:
      return state;
  }
}

function stillFetching(fetchStatus: Record<Source, FetchSourceStatus>): boolean {
  return Object.values(fetchStatus).some((s) => s.status === 'fetching');
}
