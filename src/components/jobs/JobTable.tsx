import React, { memo, useMemo } from 'react';
import { Box, Text } from 'ink';
import type { Job, RemoteStatus } from '../../state/types.js';
import { truncate, padRight, textWidth, formatPosted } from '../../utils/format.js';
import { colors, sourceColors, sourceLabels, sourceShortLabels } from '../../utils/theme.js';
import { useStore } from '../../state/store.js';

interface JobTableProps {
  jobs: Job[];
  selectedIndex: number;
  /**
   * Whether this table has keyboard focus. The unfocused table keeps a dimmed
   * cursor, so switching panels with Tab never loses your place.
   */
  focused: boolean;
  width: number;
  maxRows: number;
  remoteMap?: Map<string, RemoteStatus>;
}

// Read from the active theme at render time. As module-level constants these
// captured whichever theme was loaded at import and never changed again.
function statusSymbol(status: string): { symbol: string; color: string } {
  switch (status) {
    case 'applied':
      return { symbol: '★', color: colors.statusApplied };
    case 'ignored':
      return { symbol: '○', color: colors.statusIgnored };
    default:
      return { symbol: '●', color: colors.statusNew };
  }
}

function remoteInfo(remote: RemoteStatus): { label: string; color: string } {
  switch (remote) {
    case 'yes':
      return { label: 'Yes', color: colors.success };
    case 'no':
      return { label: 'No', color: colors.danger };
    default:
      return { label: '?', color: colors.warning };
  }
}

interface ColumnWidths {
  cursorW: number;
  statusW: number;
  titleW: number;
  companyW: number;
  countryW: number;
  sourceW: number;
  remoteW: number;
  dateW: number;
  tailW: number;
  /** Full source names when every one fits the column, otherwise short codes. */
  sourceNames: Record<string, string>;
}

interface JobRowProps {
  job: Job;
  isSelected: boolean;
  focused: boolean;
  remote: RemoteStatus | undefined;
  cols: ColumnWidths;
  showRemote: boolean;
  /** Only used to invalidate the memo when the theme changes. */
  themeId: string;
}

const JobRow = memo(
  function JobRow({ job, isSelected, focused, remote, cols, showRemote }: JobRowProps) {
    const isApplied = job.status === 'applied';
    // "Just in": an untriaged row first stored by its source's latest fetch.
    const fresh = !!job.fresh && job.status === 'new';
    const st = fresh ? { symbol: '✦', color: colors.accent } : statusSymbol(job.status);
    const rd = remote ? remoteInfo(remote) : undefined;
    // The ▶ glyph is the primary marker: a background colour alone vanishes on
    // themes whose surface is close to the terminal background.
    const active = isSelected && focused;
    const bg = active ? colors.surface : undefined;
    const titleColor = active
      ? colors.accent
      : isApplied
        ? colors.success
        : undefined;

    return (
      <Box backgroundColor={bg}>
        <Text color={active ? colors.accent : colors.textDim} bold={active}>
          {padRight(isSelected ? '▶' : ' ', cols.cursorW)}
        </Text>
        <Text color={st.color}>{padRight(st.symbol, cols.statusW)}</Text>
        <Text color={titleColor} bold={active || fresh}>
          {padRight(truncate(job.title, cols.titleW - 1), cols.titleW)}
        </Text>
        <Text color={active ? colors.text : colors.textDim}>
          {padRight(truncate(job.company, cols.companyW - 1), cols.companyW)}
        </Text>
        <Text dimColor>
          {padRight(truncate(job.country || '-', cols.countryW - 1), cols.countryW)}
        </Text>
        <Text color={sourceColors[job.source] ?? colors.textDim}>
          {padRight(truncate(cols.sourceNames[job.source] ?? job.source, cols.sourceW - 1), cols.sourceW)}
        </Text>
        {showRemote && (
          <Text color={rd?.color ?? colors.textDim}>
            {padRight(rd?.label ?? '-', cols.remoteW)}
          </Text>
        )}
        <Text dimColor>
          {padRight(formatPosted(job.datePosted), cols.dateW)}
        </Text>
        {cols.tailW > 0 && <Text>{' '.repeat(cols.tailW)}</Text>}
      </Box>
    );
  },
  (prev, next) =>
    prev.job === next.job &&
    prev.isSelected === next.isSelected &&
    prev.focused === next.focused &&
    prev.remote === next.remote &&
    prev.showRemote === next.showRemote &&
    prev.cols === next.cols &&
    prev.themeId === next.themeId
);

export function JobTable({ jobs, selectedIndex, focused, width, maxRows, remoteMap }: JobTableProps) {
  const themeId = useStore((s) => s.themeId);
  const showRemote = !!remoteMap;
  const available = Math.max(40, width);

  const cols = useMemo<ColumnWidths>(() => {
    const cursorW = 2;
    const statusW = 2;
    const titleW = Math.floor(available * 0.31);
    const companyW = Math.floor(available * 0.18);
    const countryW = Math.floor(available * 0.13);
    const sourceW = Math.floor(available * 0.12);
    // 'Remote' plus a gap: at exactly its length the header read "RemoteDate".
    const remoteW = showRemote ? 7 : 0;
    const dateW = 10;
    const used = cursorW + statusW + titleW + companyW + countryW + sourceW + remoteW + dateW;
    const tailW = Math.max(0, available - used);
    // At 80 columns "WeWorkRemotely" was cut to "wewor..."; switch the whole
    // column to codes rather than mixing names and codes row by row.
    const fullFits = Object.values(sourceLabels).every((l) => textWidth(l) <= sourceW - 1);
    const sourceNames = fullFits ? sourceLabels : sourceShortLabels;
    return { cursorW, statusW, titleW, companyW, countryW, sourceW, remoteW, dateW, tailW, sourceNames };
  }, [available, showRemote]);

  const headerRow = useMemo(
    () => (
      <Box key="header">
        <Text bold dimColor>
          {padRight(' ', cols.cursorW + cols.statusW)}
          {padRight('Title', cols.titleW)}
          {padRight('Company', cols.companyW)}
          {padRight('Country', cols.countryW)}
          {padRight('Source', cols.sourceW)}
          {showRemote ? padRight('Remote', cols.remoteW) : ''}
          {padRight('Date', cols.dateW)}
        </Text>
      </Box>
    ),
    [cols, showRemote]
  );

  if (jobs.length === 0) {
    return (
      <Box flexDirection="column">
        {headerRow}
        <Box justifyContent="center" marginTop={1}>
          <Text dimColor>No jobs found. Press f to fetch or x to clear filters.</Text>
        </Box>
      </Box>
    );
  }

  const visibleJobs = jobs.slice(0, maxRows);

  return (
    <Box flexDirection="column">
      {headerRow}
      {visibleJobs.map((job, i) => (
        <JobRow
          key={job.id}
          job={job}
          isSelected={i === selectedIndex}
          focused={focused}
          remote={remoteMap?.get(job.id)}
          cols={cols}
          showRemote={showRemote}
          themeId={themeId}
        />
      ))}
    </Box>
  );
}
