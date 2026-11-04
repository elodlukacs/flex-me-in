import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MetaResponse } from '../../../src/server/contract.js';
import { api, jobsUrl } from '../api.js';
import { useBackgroundRuns } from '../hooks/useBackgroundRuns.js';
import { useJobs } from '../hooks/useJobs.js';
import { useNow } from '../hooks/useNow.js';
import { useStatusActions } from '../hooks/useStatusActions.js';
import { useUiState } from '../hooks/useUiState.js';
import { storage } from '../storage.js';
import { formatRomaniaTime, formatSince, latestIso } from '../time.js';
import { showToast } from '../toasts.js';
import { ConfirmSheet } from './ConfirmSheet.js';
import { Header } from './Header.js';
import { JobList } from './JobList.js';
import { ListEmpty } from './ListEmpty.js';
import { OfflineBanner } from './OfflineBanner.js';
import { OverflowMenu } from './OverflowMenu.js';
import { RunProgress } from './RunProgress.js';
import { SearchBar } from './SearchBar.js';
import { SourceChips } from './SourceChips.js';
import { StatusTabs } from './StatusTabs.js';

const META_KEY = 'fe-hunt.meta';

interface MainScreenProps {
  /** False until auth is settled: show cached data, make no requests. */
  enabled: boolean;
  onChangeToken?: () => void;
}

export function MainScreen({ enabled, onChangeToken }: MainScreenProps) {
  const [ui, setUi] = useUiState();
  const [meta, setMeta] = useState<MetaResponse | null>(() => {
    const m = storage.getJson<MetaResponse>(META_KEY);
    return m && Array.isArray(m.sources) ? (m as MetaResponse) : null;
  });
  const now = useNow();

  const loadMeta = useCallback(() => {
    api
      .meta()
      .then((m) => {
        setMeta(m);
        storage.setJson(META_KEY, m);
      })
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (enabled) loadMeta();
  }, [enabled, loadMeta]);

  // A remembered source that the server no longer has.
  useEffect(() => {
    if (meta && ui.source !== 'all' && !meta.sources.some((s) => s.id === ui.source)) setUi({ source: 'all' });
  }, [meta, ui.source, setUi]);

  const aiConfigured = meta?.aiConfigured ?? false;
  const aiOn = ui.ai && aiConfigured;
  const query = useMemo(
    () => ({ source: ui.source, status: ui.status, q: ui.q, ai: aiOn }),
    [ui.source, ui.status, ui.q, aiOn],
  );
  const url = jobsUrl(query);
  const jobs = useJobs(query, enabled);
  const actions = useStatusActions(jobs, ui.status, url);

  const { reload } = jobs;
  const refetch = useCallback(() => {
    reload();
    loadMeta();
  }, [reload, loadMeta]);
  const runs = useBackgroundRuns({
    enabled,
    aiConfigured,
    onDataChanged: refetch,
    aiShown: aiOn,
    onShowAi: () => setUi({ ai: true }),
  });

  const labels = useMemo(() => new Map(meta?.sources.map((s) => [s.id, s.label]) ?? []), [meta]);
  const labelOf = useCallback((id: string) => labels.get(id as never) ?? id, [labels]);

  const finishedAt = runs.refresh.status?.state === 'running' ? undefined : runs.refresh.status?.finishedAt;
  const last = latestIso(meta?.lastRefreshAt, finishedAt);
  const freshCount = jobs.data?.freshCount ?? 0;
  const updatedLine = runs.refresh.running
    ? 'Fetching the job boards…'
    : last
      ? `Refreshed ${formatRomaniaTime(last) || formatSince(last, now)}`
      : meta
        ? 'Never refreshed — tap Refresh'
        : 'Loading…';
  const freshLine = !runs.refresh.running && freshCount > 0 ? `${freshCount} just in` : null;

  const [confirmAi, setConfirmAi] = useState(false);
  const newCount = jobs.data?.counts.new ?? 0;
  const requestAi = () => {
    if (runs.ai.running) runs.startAi();
    else if (jobs.data && newCount === 0) showToast('No new jobs to classify');
    else setConfirmAi(true);
  };
  const cancelAi = useCallback(() => setConfirmAi(false), []);

  const list = jobs.data ? actions.visible(jobs.data.jobs) : jobs.error ? [] : null;

  return (
    <div className="app">
      <Header
        updatedLine={updatedLine}
        freshLine={freshLine}
        refreshing={runs.refresh.running}
        onRefresh={runs.startRefresh}
        menu={
          <OverflowMenu
            aiConfigured={aiConfigured}
            aiRunning={runs.ai.running}
            onRunAi={requestAi}
            onChangeToken={onChangeToken}
          />
        }
      >
        <SearchBar
          query={ui.q}
          onQuery={(q) => setUi({ q })}
          showAi={aiConfigured}
          ai={aiOn}
          onAi={(ai) => setUi({ ai })}
        />
        <SourceChips
          sources={meta?.sources ?? []}
          newBySource={jobs.data?.newBySource ?? {}}
          selected={ui.source}
          onSelect={(source) => setUi({ source })}
        />
        <RunProgress
          refresh={runs.refresh.status}
          showRefresh={runs.showRefreshPanel}
          ai={runs.ai.status}
          sources={meta?.sources ?? []}
          onDismiss={runs.dismissRefreshPanel}
        />
        <OfflineBanner onRetry={refetch} />
        {jobs.loading && jobs.data && <div className="loading-bar" aria-hidden="true" />}
      </Header>
      <main className="main">
        <JobList
          jobs={list}
          resetKey={url}
          leaving={actions.leaving}
          labelOf={labelOf}
          now={now}
          onRefresh={runs.startRefresh}
          onToggleApplied={actions.toggleApplied}
          onToggleSaved={actions.toggleSaved}
          onToggleHidden={actions.toggleHidden}
          onSeen={actions.markSeen}
          empty={
            <ListEmpty
              ui={ui}
              aiOn={aiOn}
              sourceLabel={ui.source === 'all' ? null : labelOf(ui.source)}
              error={jobs.data ? null : jobs.error}
              onRetry={reload}
              onRefresh={runs.startRefresh}
              onClearSearch={() => setUi({ q: '' })}
              onRunAi={requestAi}
            />
          }
        />
      </main>
      {confirmAi && (
        <ConfirmSheet
          title={jobs.data ? `Classify ${newCount} new job${newCount === 1 ? '' : 's'} with AI?` : 'Classify the new jobs with AI?'}
          body="Every new job across all boards is sent to the AI (DeepSeek, a paid API) to judge whether it is really remote. Takes a minute or so."
          confirmLabel="Run AI filter"
          onCancel={cancelAi}
          onConfirm={() => {
            setConfirmAi(false);
            runs.startAi();
          }}
        />
      )}
      <StatusTabs
        selected={ui.status}
        counts={jobs.data?.counts ?? null}
        onSelect={(status) => {
          setUi({ status });
          window.scrollTo({ top: 0 });
        }}
      />
    </div>
  );
}
