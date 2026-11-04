/** `saved`: kept for later (say, a long application form), not yet applied. */
export type JobStatus = 'new' | 'saved' | 'applied' | 'ignored';

export type Source =
  | 'remoteok'
  | 'weworkremotely'
  | 'remotive'
  | 'linkedin'
  | 'justjoinit'
  | 'workable'
  | 'jobicy'
  | 'himalayas';

export type SourceFilter = Source | 'all';

export const ALL_SOURCES: Source[] = [
  'remoteok',
  'weworkremotely',
  'remotive',
  'linkedin',
  'justjoinit',
  'workable',
  'jobicy',
  'himalayas',
];

export interface Job {
  id: string;
  title: string;
  company: string;
  url: string;
  source: Source;
  datePosted: string;
  status: JobStatus;
  country: string;
  workType: string;
  description?: string;
  /**
   * First stored by its source's latest fetch. With status 'new' and not
   * `seen`, the UI calls it New; any other untriaged job shows no status.
   * Absent otherwise.
   */
  fresh?: true;
  /** Opened (link or details) at least once. Absent otherwise. */
  seen?: true;
}

export type FetchStatus = 'idle' | 'fetching' | 'done' | 'error' | 'cancelled';

export interface FetchSourceStatus {
  source: Source;
  status: FetchStatus;
  count: number;
  error?: string;
  /** Done, but the fetcher stopped early: rows were upserted, nothing purged. */
  partial?: boolean;
}

/**
 * The source is not a filter here: it is the tab (`sourceFilter`). Having
 * both meant tab A plus filter B silently showed an empty list.
 */
export interface FilterState {
  status: string;
  workType: string;
  title: string;
  company: string;
  country: string;
}

export type InputMode = 'none' | 'title' | 'company' | 'country';

export type AiFilterStatus = 'idle' | 'filtering' | 'done' | 'error';

export type RemoteStatus = 'yes' | 'no' | 'possible';

export interface AiJobResult {
  id: string;
  remote: RemoteStatus;
}

export interface JobCounts {
  total: number;
  /** Untriaged, from the latest fetch and never opened; other untriaged jobs are only in `total`. */
  new: number;
  saved: number;
  applied: number;
  ignored: number;
}

export interface AppState {
  jobs: Job[];
  selectedIndex: number;
  page: number;
  /**
   * Always equal to `mainVisibleRows` (set together by SET_VISIBLE_ROWS). Kept
   * only because components still read it; prefer `mainVisibleRows`.
   */
  pageSize: number;
  filters: FilterState;
  sourceFilter: SourceFilter;
  inputMode: InputMode;
  inputValue: string;
  fetchStatus: Record<Source, FetchSourceStatus>;
  /** Sources of the latest fetch run; FETCH_ALL_DONE summarises only these. */
  fetchRunSources: Source[];
  isFetching: boolean;
  statusMessage: string;
  statusType: 'info' | 'success' | 'warning' | 'error';
  showHelp: boolean;
  showThemePicker: boolean;
  themePickerIndex: number;
  themeId: string;
  terminalWidth: number;
  terminalHeight: number;
  aiJobs: Job[];
  aiRemoteMap: Map<string, RemoteStatus>;
  /**
   * The jobs actually sent to the classifier. Results are matched against this
   * snapshot, so changing a filter mid-flight no longer silently discards them.
   */
  aiSubmittedJobs: Job[];
  aiFilterStatus: AiFilterStatus;
  aiError: string;
  aiPanelFocused: boolean;
  aiSelectedIndex: number;
  aiPage: number;
  mainVisibleRows: number;
  aiVisibleRows: number;
  jobCounts: JobCounts;
  /** ISO end of the last fetch run stored in this DB; undefined before the first. */
  lastRefreshAt?: string;
  snackbar: { message: string; visible: boolean };
  showJobPopup: boolean;
  /**
   * Referenced by id, not by value: a snapshotted Job object went stale the
   * moment the user pressed `a`/`i` while the popup was open.
   */
  popupJobId: string | null;
  popupDescription: string;
  popupScroll: number;
  /** Reported by JobPopup once it knows how many wrapped lines it has. */
  popupMaxScroll: number;
  /** Ctrl+D arms the wipe; `y` confirms it. */
  pendingClearAll: boolean;
  /**
   * A large AI run waiting for `y`. Holds the exact candidates the prompt
   * described, so confirming sends what the user agreed to.
   */
  pendingAiFilter: { jobs: Job[]; batches: number } | null;
}

export type Action =
  | { type: 'NAVIGATE'; direction: 'up' | 'down' }
  | { type: 'PAGE'; direction: 'next' | 'prev' }
  | { type: 'SET_JOBS'; jobs: Job[] }
  | { type: 'SET_LAST_REFRESH'; at: string | undefined }
  | { type: 'MARK_JOB_SEEN'; id: string }
  | { type: 'SET_STATUS'; message: string; statusType?: 'info' | 'success' | 'warning' | 'error' }
  | { type: 'CYCLE_FILTER'; key: 'status' | 'workType'; values: string[] }
  | { type: 'CLEAR_FILTERS' }
  | { type: 'START_INPUT'; mode: InputMode }
  | { type: 'SET_INPUT_VALUE'; value: string }
  | { type: 'SUBMIT_INPUT' }
  | { type: 'CANCEL_INPUT' }
  | { type: 'FETCH_START'; sources: Source[] }
  | { type: 'FETCH_PROGRESS'; source: Source; count: number }
  | { type: 'FETCH_DONE'; source: Source; count: number; complete?: boolean }
  | { type: 'FETCH_ERROR'; source: Source; error: string }
  | { type: 'FETCH_CANCELLED'; source?: Source }
  | { type: 'FETCH_ALL_DONE' }
  | { type: 'UPDATE_JOB_STATUS'; id: string; status: JobStatus }
  | { type: 'TOGGLE_HELP' }
  | { type: 'SET_TERMINAL_SIZE'; width: number; height: number }
  | { type: 'HYDRATE'; aiJobs: Job[]; aiResults: AiJobResult[] }
  | { type: 'CLEAR_AI_FILTER' }
  | { type: 'REQUEST_AI_FILTER'; jobs: Job[]; batches: number }
  | { type: 'CANCEL_AI_FILTER_REQUEST'; silent?: boolean }
  | { type: 'AI_FILTER_START'; submitted: Job[] }
  | { type: 'AI_FILTER_PROGRESS'; batch: number; total: number }
  | { type: 'AI_FILTER_DONE'; results: AiJobResult[] }
  | { type: 'AI_FILTER_ERROR'; error: string }
  | { type: 'AI_NAVIGATE'; direction: 'up' | 'down' }
  | { type: 'AI_PAGE'; direction: 'next' | 'prev' }
  | { type: 'TOGGLE_PANEL_FOCUS' }
  | { type: 'SET_VISIBLE_ROWS'; main: number; ai: number }
  | { type: 'TOGGLE_THEME_PICKER' }
  | { type: 'THEME_NAVIGATE'; direction: 'up' | 'down' }
  | { type: 'SET_THEME_FROM_PICKER' }
  | { type: 'SET_SOURCE_FILTER'; source: SourceFilter }
  | { type: 'SET_JOB_COUNTS'; counts: JobCounts }
  | { type: 'SHOW_SNACKBAR'; message: string }
  | { type: 'HIDE_SNACKBAR' }
  | { type: 'OPEN_JOB_POPUP'; id: string; description: string }
  | { type: 'CLOSE_JOB_POPUP' }
  | { type: 'POPUP_SCROLL'; delta: number }
  | { type: 'SET_POPUP_MAX_SCROLL'; max: number }
  | { type: 'REQUEST_CLEAR_ALL' }
  | { type: 'CANCEL_CLEAR_ALL' };
