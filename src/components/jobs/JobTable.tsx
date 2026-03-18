import React from 'react';
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

export function JobTable({ jobs, selectedIndex, width, maxRows, remoteMap }: JobTableProps) {
  const showRemote = !!remoteMap;
  const available = Math.max(40, width);
  
  // Balanced column widths
  const statusW = 2;
  const titleW = Math.floor(available * 0.32);
  const companyW = Math.floor(available * 0.18);
  const countryW = Math.floor(available * 0.14);
  const sourceW = Math.floor(available * 0.12);
  const remoteW = showRemote ? 6 : 0;
  const dateW = 10;

  const headerRow = (
    <Box key="header">
      <Text bold dimColor>
        {padRight(' ', statusW)}
        {padRight('Title', titleW)}
        {padRight('Company', companyW)}
        {padRight('Country', countryW)}
        {padRight('Source', sourceW)}
        {showRemote ? padRight('Remote', remoteW) : ''}
        {padRight('Date', dateW)}
      </Text>
    </Box>
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
      {visibleJobs.map((job, i) => {
        const isSelected = i === selectedIndex;
        const isApplied = job.status === 'applied';
        const st = statusSymbols[job.status] ?? statusSymbols.new!;
        const remote = remoteMap?.get(job.id);
        const rd = remote ? remoteDisplay[remote] : undefined;
        const bg = isSelected ? colors.surface : isApplied ? '#2a3325' : undefined;

        return (
          <Box key={job.id} backgroundColor={bg}>
            <Text color={st.color}>{padRight(st.symbol, statusW)}</Text>
            <Text color={isSelected ? colors.accent : undefined} bold={isSelected}>
              {padRight(truncate(job.title, titleW - 1), titleW)}
            </Text>
            <Text color={isSelected ? colors.text : colors.textDim}>
              {padRight(truncate(job.company, companyW - 1), companyW)}
            </Text>
            <Text dimColor>
              {padRight(truncate(job.country || '-', countryW - 1), countryW)}
            </Text>
            <Text color={sourceColors[job.source] ?? colors.textDim}>
              {padRight(truncate(job.source, sourceW - 1), sourceW)}
            </Text>
            {showRemote && (
              <Text color={rd?.color ?? colors.textDim}>
                {padRight(rd?.label ?? '-', remoteW)}
              </Text>
            )}
            <Text dimColor>
              {padRight(job.datePosted || '-', dateW)}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
