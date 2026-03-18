export type JobStatus = 'new' | 'applied' | 'ignored';

export type Source = 'remoteok' | 'weworkremotely' | 'himalayas' | 'remotive' | 'arbeitnow' | 'linkedin' | 'indeed' | 'hackernews';

export type SourceFilter = Source | 'all';

export const ALL_SOURCES: Source[] = ['remoteok', 'weworkremotely', 'himalayas', 'remotive', 'arbeitnow', 'linkedin', 'indeed', 'hackernews'];

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
}

export type FetchStatus = 'idle' | 'fetching' | 'done' | 'error' | 'cancelled';

export interface FetchSourceStatus {
  source: Source;
  status: FetchStatus;
  count: number;
  error?: string;
}

export type FilterKey = 'status' | 'source' | 'workType' | 'title' | 'company' | 'country';

export interface FilterState {
  status: string;
  source: string;
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

export interface AppState {
  jobs: Job[];
  selectedIndex: number;
  page: number;
  pageSize: number;
  filters: FilterState;
  sourceFilter: SourceFilter;
  inputMode: InputMode;
  inputValue: string;
  fetchStatus: Record<Source, FetchSourceStatus>;
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
  aiFilteredJobIds: Set<string>;
  aiRemoteMap: Map<string, RemoteStatus>;
  aiFilterStatus: AiFilterStatus;
  aiError: string;
  aiPanelFocused: boolean;
  aiSelectedIndex: number;
  aiPage: number;
  mainVisibleRows: number;
  aiVisibleRows: number;
  jobCounts: { total: number; new: number; applied: number; ignored: number };
  snackbar: { message: string; visible: boolean };
  showJobPopup: boolean;
  popupJob: Job | null;
}

export type Action =
  | { type: 'NAVIGATE'; direction: 'up' | 'down' }
  | { type: 'PAGE'; direction: 'next' | 'prev' }
  | { type: 'SET_JOBS'; jobs: Job[] }
  | { type: 'SET_STATUS'; message: string; statusType?: 'info' | 'success' | 'warning' | 'error' }
  | { type: 'SET_FILTER'; key: FilterKey; value: string }
  | { type: 'CYCLE_FILTER'; key: 'status' | 'workType' | 'source'; values: string[] }
  | { type: 'CLEAR_FILTERS' }
  | { type: 'START_INPUT'; mode: InputMode }
  | { type: 'SET_INPUT_VALUE'; value: string }
  | { type: 'SUBMIT_INPUT' }
  | { type: 'CANCEL_INPUT' }
  | { type: 'FETCH_START'; sources: Source[] }
  | { type: 'FETCH_PROGRESS'; source: Source; count: number }
  | { type: 'FETCH_DONE'; source: Source; count: number }
  | { type: 'FETCH_ERROR'; source: Source; error: string }
  | { type: 'FETCH_CANCELLED'; source?: Source }
  | { type: 'FETCH_ALL_DONE' }
  | { type: 'UPDATE_JOB_STATUS'; id: string; status: JobStatus }
  | { type: 'TOGGLE_HELP' }
  | { type: 'SET_TERMINAL_SIZE'; width: number; height: number }
  | { type: 'SET_PAGE_SIZE'; size: number }
  | { type: 'CLEAR_AI_FILTER' }
  | { type: 'AI_FILTER_START' }
  | { type: 'AI_FILTER_DONE'; results: AiJobResult[] }
  | { type: 'AI_FILTER_ERROR'; error: string }
  | { type: 'AI_NAVIGATE'; direction: 'up' | 'down' }
  | { type: 'AI_PAGE'; direction: 'next' | 'prev' }
  | { type: 'TOGGLE_PANEL_FOCUS' }
  | { type: 'SET_VISIBLE_ROWS'; main: number; ai: number }
  | { type: 'TOGGLE_THEME_PICKER' }
  | { type: 'SET_THEME'; id: string }
  | { type: 'THEME_NAVIGATE'; direction: 'up' | 'down' }
  | { type: 'SET_THEME_FROM_PICKER' }
  | { type: 'SET_SOURCE_FILTER'; source: SourceFilter }
  | { type: 'SET_JOB_COUNTS'; counts: { total: number; new: number; applied: number; ignored: number } }
  | { type: 'SHOW_SNACKBAR'; message: string }
  | { type: 'HIDE_SNACKBAR' }
  | { type: 'OPEN_JOB_POPUP'; job: Job }
  | { type: 'CLOSE_JOB_POPUP' };
