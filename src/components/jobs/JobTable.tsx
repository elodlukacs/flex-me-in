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

/** Widest status cell content ("SAVE" / "APPL"). */
const STATUS_LABEL_W = 4;

/**
 * One compact status cell per row: a ● for New (latest fetch, never opened),
 * filled SAVE / APPL badges, a dim IGN, nothing for an untriaged older job.
 * A job is never both New and triaged, so the dot and the badges share the
 * cell. Read from the active theme at render time: module-level constants
 * would not follow a theme change.
 */
function statusBadge(job: Job): Badge {
  switch (job.status) {
    case 'saved':
      return { label: 'SAVE', bg: colors.statusSaved, color: colors.background, bold: true };
    case 'applied':
      return { label: 'APPL', bg: colors.statusApplied, color: colors.background, bold: true };
    case 'ignored':
      return { label: 'IGN', color: colors.statusIgnored };
    default:
      return job.fresh && !job.seen
        ? { label: '●', color: colors.statusNew, bold: true }
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
    const badge = statusBadge(job);
    const ignored = job.status === 'ignored';
    // Never opened: bright, bold title. Opened: muted but readable, regular weight.
    const opened = !!job.seen;
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
            : opened
              ? colors.textOpened
              : colors.text;
    // Filled badges are padded to the cell so SAVE and APPL line up.
    const badgeText = badge.bg ? padRight(badge.label, STATUS_LABEL_W) : badge.label;

    return (
      <Box backgroundColor={bg}>
        <Text color={active ? colors.accent : colors.textDim} bold={active}>
          {padRight(isSelected ? '▶' : ' ', cols.cursorW)}
        </Text>
        <Text backgroundColor={badge.bg} color={badge.color} bold={badge.bold}>
          {badgeText}
        </Text>
        <Text>{' '.repeat(Math.max(0, cols.statusW - textWidth(badgeText)))}</Text>
        <Text color={titleColor} bold={active || !opened} strikethrough={ignored}>
          {padRight(truncate(job.title, cols.titleW - 1), cols.titleW)}
        </Text>
        <Text color={active || !opened ? colors.text : colors.textOpened}>
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
    // "▶" plus a gap.
    const cursorW = 2;
    const statusW = STATUS_LABEL_W + 1;
    // 'Remote' plus a gap: at exactly its length the header read "RemoteDate".
    const remoteW = showRemote ? 7 : 0;
    const dateW = 10;
    // Full source names only where they cost nothing; otherwise the whole
    // column uses codes rather than mixing names and codes row by row.
    const widest = (labels: Record<string, string>) => Math.max(...Object.values(labels).map(textWidth));
    const fullNames = available >= 140;
    const sourceNames = fullNames ? sourceLabels : sourceShortLabels;
    // At least the header's width: codes are only 2-3 wide.
    const sourceW = Math.max(widest(sourceNames), textWidth('Source')) + 2;
    // Country and company are capped (their values are short); the title,
    // the column worth reading, takes everything else.
    const flex = available - cursorW - statusW - sourceW - remoteW - dateW;
    const countryW = Math.min(22, Math.floor(flex * 0.22));
    const companyW = Math.min(28, Math.floor(flex * 0.28));
    const titleW = flex - countryW - companyW;
    const used = cursorW + statusW + titleW + companyW + countryW + sourceW + remoteW + dateW;
    const tailW = Math.max(0, available - used);
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
