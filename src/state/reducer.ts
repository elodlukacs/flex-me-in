import type { AppState, Action, Source, FetchSourceStatus, SourceFilter } from './types.js';
import { ALL_SOURCES } from './types.js';
import { getActiveThemeId, setTheme, themeIds } from '../utils/theme.js';
import { getAiFilteredResults, getAiFilteredJobs } from '../db/repository.js';

export function createInitialState(): AppState {
  const fetchStatus = {} as Record<Source, FetchSourceStatus>;
  for (const source of ALL_SOURCES) {
    fetchStatus[source] = { source, status: 'idle', count: 0 };
  }

  const aiResults = getAiFilteredResults();

  return {
    jobs: [],
    selectedIndex: 0,
    page: 0,
    pageSize: 20,
    filters: {
      status: '',
      source: '',
      workType: '',
      title: '',
      company: '',
      country: '',
    },
    sourceFilter: 'all' as SourceFilter,
    inputMode: 'none',
    inputValue: '',
    fetchStatus,
    isFetching: false,
    statusMessage: 'Press f to fetch jobs, ? for help',
    statusType: 'info',
    showHelp: false,
    showThemePicker: false,
    themePickerIndex: Math.max(0, themeIds.indexOf(getActiveThemeId())),
    themeId: getActiveThemeId(),
    aiJobs: getAiFilteredJobs(),
    aiFilteredJobIds: new Set(aiResults.map((r) => r.id)),
    aiRemoteMap: new Map(aiResults.map((r) => [r.id, r.remote])),
    aiFilterStatus: aiResults.length > 0 ? 'done' : 'idle',
    aiError: '',
    aiPanelFocused: false,
    aiSelectedIndex: 0,
    aiPage: 0,
    mainVisibleRows: 20,
    aiVisibleRows: 10,
    terminalWidth: 80,
    terminalHeight: 24,
    jobCounts: { total: 0, new: 0, applied: 0, ignored: 0 },
    snackbar: { message: '', visible: false },
    showJobPopup: false,
    popupJob: null,
  };
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'NAVIGATE': {
      const start = state.page * state.pageSize;
      const end = Math.min(start + state.pageSize, state.jobs.length);
      const pageJobCount = end - start;
      const maxIdx = Math.min(pageJobCount, state.mainVisibleRows) - 1;
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
      const totalPages = Math.max(1, Math.ceil(state.jobs.length / state.pageSize));
      let newPage = state.page;
      if (action.direction === 'next') {
        newPage = Math.min(state.page + 1, totalPages - 1);
      } else {
        newPage = Math.max(state.page - 1, 0);
      }
      return { ...state, page: newPage, selectedIndex: 0 };
    }

    case 'SET_JOBS':
      return {
        ...state,
        jobs: action.jobs,
        selectedIndex: Math.min(state.selectedIndex, Math.max(0, action.jobs.length - 1)),
        page: Math.min(state.page, Math.max(0, Math.ceil(action.jobs.length / state.pageSize) - 1)),
      };

    case 'SET_STATUS':
      return {
        ...state,
        statusMessage: action.message,
        statusType: action.statusType ?? 'info',
      };

    case 'SET_FILTER':
      return {
        ...state,
        filters: { ...state.filters, [action.key]: action.value },
        page: 0,
        selectedIndex: 0,
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
        filters: { status: '', source: '', workType: '', title: '', company: '', country: '' },
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
        isFetching: true,
        statusMessage: 'Fetching jobs...',
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
      };
      const allDone = Object.values(fetchStatus).every(
        (s) => s.status !== 'fetching'
      );
      return {
        ...state,
        fetchStatus,
        isFetching: !allDone,
        ...(allDone
          ? {
              statusMessage: 'Fetch complete',
              statusType: 'success' as const,
            }
          : {}),
      };
    }

    case 'FETCH_ERROR': {
      const fetchStatus = { ...state.fetchStatus };
      fetchStatus[action.source] = {
        source: action.source,
        status: 'error',
        count: 0,
        error: action.error,
      };
      const allDone = Object.values(fetchStatus).every(
        (s) => s.status !== 'fetching'
      );
      return {
        ...state,
        fetchStatus,
        isFetching: !allDone,
      };
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
      return {
        ...state,
        fetchStatus,
        isFetching: false,
        statusMessage: 'Fetch cancelled',
        statusType: 'warning',
      };
    }

    case 'FETCH_ALL_DONE':
      return {
        ...state,
        isFetching: false,
        statusMessage: 'Fetch complete',
        statusType: 'success',
      };

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

    case 'SET_PAGE_SIZE':
      return { ...state, pageSize: action.size, page: 0, selectedIndex: 0 };

    case 'CLEAR_AI_FILTER':
      return {
        ...state,
        aiJobs: [],
        aiFilteredJobIds: new Set<string>(),
        aiRemoteMap: new Map(),
        aiFilterStatus: 'idle',
        aiError: '',
        aiPanelFocused: false,
        aiSelectedIndex: 0,
        aiPage: 0,
      };

    case 'AI_FILTER_START':
      return {
        ...state,
        aiFilterStatus: 'filtering',
        aiError: '',
        statusMessage: 'AI filtering jobs...',
        statusType: 'info',
      };

    case 'AI_FILTER_DONE': {
      const validResults = action.results.filter((r) => state.jobs.some((j) => j.id === r.id));
      const validIds = new Set(validResults.map((r) => r.id));
      const remoteMap = new Map(validResults.map((r) => [r.id, r.remote]));
      const aiJobs = state.jobs.filter((j) => validIds.has(j.id));
      return {
        ...state,
        aiJobs,
        aiFilteredJobIds: validIds,
        aiRemoteMap: remoteMap,
        aiFilterStatus: 'done',
        aiSelectedIndex: 0,
        aiPage: 0,
        statusMessage: `AI found ${validIds.size} matching roles`,
        statusType: 'success',
      };
    }

    case 'AI_FILTER_ERROR':
      return {
        ...state,
        aiFilterStatus: 'error',
        aiError: action.error,
        statusMessage: `AI filter: ${action.error}`,
        statusType: 'error',
      };

    case 'AI_NAVIGATE': {
      const aiPageSize = state.aiVisibleRows;
      const aiStart = state.aiPage * aiPageSize;
      const aiEnd = Math.min(aiStart + aiPageSize, state.aiJobs.length);
      const aiPageCount = aiEnd - aiStart;
      const maxIdx = aiPageCount - 1;
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
      const aiTotalPages = Math.max(1, Math.ceil(state.aiJobs.length / state.aiVisibleRows));
      let newPage = state.aiPage;
      if (action.direction === 'next') {
        newPage = Math.min(state.aiPage + 1, aiTotalPages - 1);
      } else {
        newPage = Math.max(state.aiPage - 1, 0);
      }
      return { ...state, aiPage: newPage, aiSelectedIndex: 0 };
    }

    case 'TOGGLE_PANEL_FOCUS':
      return { ...state, aiPanelFocused: !state.aiPanelFocused };

    case 'SET_VISIBLE_ROWS':
      return {
        ...state,
        mainVisibleRows: action.main,
        aiVisibleRows: action.ai,
        selectedIndex: Math.min(state.selectedIndex, Math.max(0, action.main - 1)),
        aiSelectedIndex: Math.min(state.aiSelectedIndex, Math.max(0, action.ai - 1)),
      };

    case 'TOGGLE_THEME_PICKER':
      return {
        ...state,
        showThemePicker: !state.showThemePicker,
        themePickerIndex: Math.max(0, themeIds.indexOf(state.themeId)),
      };

    case 'SET_THEME':
      return { ...state, themeId: action.id };

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
      const id = themeIds[state.themePickerIndex]!;
      setTheme(id);
      return { ...state, themeId: id, showThemePicker: false };
    }

    case 'SET_JOB_COUNTS':
      return { ...state, jobCounts: action.counts };

    case 'SHOW_SNACKBAR':
      return { ...state, snackbar: { message: action.message, visible: true } };

    case 'HIDE_SNACKBAR':
      return { ...state, snackbar: { message: '', visible: false } };

    case 'SET_SOURCE_FILTER':
      return { ...state, sourceFilter: action.source, page: 0, selectedIndex: 0 };

    case 'OPEN_JOB_POPUP':
      return { ...state, showJobPopup: true, popupJob: action.job };

    case 'CLOSE_JOB_POPUP':
      return { ...state, showJobPopup: false, popupJob: null };

    default:
      return state;
  }
}
