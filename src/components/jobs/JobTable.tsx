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

interface Badge {
  label: string;
  /** Filled badge (status that needs attention); otherwise coloured text. */
  bg?: string;
  color: string;
  bold?: boolean;
}

/**
 * The status column. New (from the latest fetch), saved and applied are filled
 * badges; an untriaged job from an earlier fetch has none; ignored recedes.
 * `wide` picks full words, otherwise 4-letter codes. Read from the active
 * theme at render time: module-level constants would not follow a theme change.
 */
function statusBadge(job: Job, wide: boolean): Badge {
  switch (job.status) {
    case 'saved':
      return { label: wide ? 'SAVED' : 'SAVE', bg: colors.statusSaved, color: colors.background, bold: true };
    case 'applied':
      return { label: wide ? 'APPLIED' : 'APPL', bg: colors.statusApplied, color: colors.background, bold: true };
    case 'ignored':
      return { label: wide ? 'IGNORED' : 'IGN', color: colors.statusIgnored };
    default:
      return job.fresh
        ? { label: 'NEW', bg: colors.statusNew, color: colors.background, bold: true }
        : { label: '', color: colors.textDim };
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
  /** Full status words fit (see statusBadge). */
  wideStatus: boolean;
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
    const badge = statusBadge(job, cols.wideStatus);
    const ignored = job.status === 'ignored';
    // Inbox convention: an untriaged job you never opened is bold.
    const unread = job.status === 'new' && !job.seen;
    const rd = remote ? remoteInfo(remote) : undefined;
    // The ▶ glyph is the primary marker: a background colour alone vanishes on
    // themes whose surface is close to the terminal background.
    const active = isSelected && focused;
    const bg = active ? colors.surface : undefined;
    const titleColor = active
      ? colors.accent
      : job.status === 'applied'
        ? colors.statusApplied
        : job.status === 'saved'
          ? colors.statusSaved
          : ignored
            ? colors.statusIgnored
            : undefined;
    const badgeText = badge.label ? ` ${badge.label} ` : '';

    return (
      <Box backgroundColor={bg}>
        <Text color={active ? colors.accent : colors.textDim} bold={active}>
          {padRight(isSelected ? '▶' : ' ', cols.cursorW)}
        </Text>
        <Text backgroundColor={badge.bg} color={badge.color} bold={badge.bold}>
          {badgeText}
        </Text>
        <Text>{' '.repeat(Math.max(0, cols.statusW - textWidth(badgeText)))}</Text>
        <Text color={titleColor} bold={active || unread} strikethrough={ignored}>
          {padRight(truncate(job.title, cols.titleW - 1), cols.titleW)}
        </Text>
        <Text color={active || unread ? colors.text : colors.textDim}>
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
    // " APPLIED " / " APPL " plus a gap.
    const wideStatus = available >= 110;
    const statusW = wideStatus ? 10 : 7;
    // 'Remote' plus a gap: at exactly its length the header read "RemoteDate".
    const remoteW = showRemote ? 7 : 0;
    const dateW = 10;
    // Text columns share what the fixed-width ones leave.
    const flex = available - cursorW - statusW - remoteW - dateW;
    const titleW = Math.floor(flex * 0.38);
    const companyW = Math.floor(flex * 0.22);
    const countryW = Math.floor(flex * 0.16);
    const sourceW = Math.floor(flex * 0.15);
    const used = cursorW + statusW + titleW + companyW + countryW + sourceW + remoteW + dateW;
    const tailW = Math.max(0, available - used);
    // At 80 columns "WeWorkRemotely" was cut to "wewor..."; switch the whole
    // column to codes rather than mixing names and codes row by row.
    const fullFits = Object.values(sourceLabels).every((l) => textWidth(l) <= sourceW - 1);
    const sourceNames = fullFits ? sourceLabels : sourceShortLabels;
    return { cursorW, statusW, wideStatus, titleW, companyW, countryW, sourceW, remoteW, dateW, tailW, sourceNames };
  }, [available, showRemote]);

  const headerRow = useMemo(
    () => (
      <Box key="header">
        <Text bold dimColor>
          {padRight(' ', cols.cursorW)}
          {padRight('Status', cols.statusW)}
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
