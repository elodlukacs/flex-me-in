import React, { memo, useMemo } from 'react';
import { Box, Text } from 'ink';
import type { Job, RemoteStatus } from '../../state/types.js';
import { truncate, padRight } from '../../utils/format.js';
import { colors, sourceColors } from '../../utils/theme.js';

interface JobTableProps {
  jobs: Job[];
  selectedIndex: number;
  width: number;
  maxRows: number;
  remoteMap?: Map<string, RemoteStatus>;
}

const statusSymbols: Record<string, { symbol: string; color: string }> = {
  new: { symbol: '●', color: colors.statusNew },
  applied: { symbol: '★', color: colors.statusApplied },
  ignored: { symbol: '○', color: colors.statusIgnored },
};

const remoteDisplay: Record<RemoteStatus, { label: string; color: string }> = {
  yes: { label: 'Yes', color: colors.success },
  no: { label: 'No', color: colors.danger },
  possible: { label: '?', color: colors.warning },
};

interface ColumnWidths {
  statusW: number;
  titleW: number;
  companyW: number;
  countryW: number;
  sourceW: number;
  remoteW: number;
  dateW: number;
  tailW: number;
}

interface JobRowProps {
  job: Job;
  isSelected: boolean;
  remote: RemoteStatus | undefined;
  cols: ColumnWidths;
  showRemote: boolean;
}

const JobRow = memo(
  function JobRow({ job, isSelected, remote, cols, showRemote }: JobRowProps) {
    const isApplied = job.status === 'applied';
    const st = statusSymbols[job.status] ?? statusSymbols.new!;
    const rd = remote ? remoteDisplay[remote] : undefined;
    const bg = isSelected ? colors.surface : isApplied ? '#2a3325' : undefined;

    return (
      <Box backgroundColor={bg}>
        <Text color={st.color}>{padRight(st.symbol, cols.statusW)}</Text>
        <Text color={isSelected ? colors.accent : undefined} bold={isSelected}>
          {padRight(truncate(job.title, cols.titleW - 1), cols.titleW)}
        </Text>
        <Text color={isSelected ? colors.text : colors.textDim}>
          {padRight(truncate(job.company, cols.companyW - 1), cols.companyW)}
        </Text>
        <Text dimColor>
          {padRight(truncate(job.country || '-', cols.countryW - 1), cols.countryW)}
        </Text>
        <Text color={sourceColors[job.source] ?? colors.textDim}>
          {padRight(truncate(job.source, cols.sourceW - 1), cols.sourceW)}
        </Text>
        {showRemote && (
          <Text color={rd?.color ?? colors.textDim}>
            {padRight(rd?.label ?? '-', cols.remoteW)}
          </Text>
        )}
        <Text dimColor>
          {padRight(job.datePosted || '-', cols.dateW)}
        </Text>
        {cols.tailW > 0 && <Text>{' '.repeat(cols.tailW)}</Text>}
      </Box>
    );
  },
  (prev, next) =>
    prev.job === next.job &&
    prev.isSelected === next.isSelected &&
    prev.remote === next.remote &&
    prev.showRemote === next.showRemote &&
    prev.cols === next.cols
);

export function JobTable({ jobs, selectedIndex, width, maxRows, remoteMap }: JobTableProps) {
  const showRemote = !!remoteMap;
  const available = Math.max(40, width);

  const cols = useMemo<ColumnWidths>(() => {
    const statusW = 2;
    const titleW = Math.floor(available * 0.32);
    const companyW = Math.floor(available * 0.18);
    const countryW = Math.floor(available * 0.14);
    const sourceW = Math.floor(available * 0.12);
    const remoteW = showRemote ? 6 : 0;
    const dateW = 10;
    const used = statusW + titleW + companyW + countryW + sourceW + remoteW + dateW;
    const tailW = Math.max(0, available - used);
    return { statusW, titleW, companyW, countryW, sourceW, remoteW, dateW, tailW };
  }, [available, showRemote]);

  const headerRow = useMemo(
    () => (
      <Box key="header">
        <Text bold dimColor>
          {padRight(' ', cols.statusW)}
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
          remote={remoteMap?.get(job.id)}
          cols={cols}
          showRemote={showRemote}
        />
      ))}
    </Box>
  );
}
