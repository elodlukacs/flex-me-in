import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import { JobTable } from './JobTable.js';
import { colors } from '../../utils/theme.js';
import { useStore, shallowEqual } from '../../state/store.js';
import { useSpinner } from '../../hooks/useSpinner.js';

interface AiPanelProps {
  /** Total height including borders, from useLayout's row budget. */
  height: number;
}

export function AiPanel({ height }: AiPanelProps) {
  const {
    aiJobs,
    aiSelectedIndex,
    aiPage,
    aiVisibleRows,
    aiFilterStatus: status,
    aiError: error,
    aiPanelFocused: isFocused,
    aiRemoteMap,
    width,
  } = useStore(
    (s) => ({
      aiJobs: s.aiJobs,
      aiSelectedIndex: s.aiSelectedIndex,
      aiPage: s.aiPage,
      aiVisibleRows: s.aiVisibleRows,
      aiFilterStatus: s.aiFilterStatus,
      aiError: s.aiError,
      aiPanelFocused: s.aiPanelFocused,
      aiRemoteMap: s.aiRemoteMap,
      width: s.terminalWidth,
    }),
    shallowEqual
  );

  const spinner = useSpinner(status === 'filtering');

  const pagedJobs = useMemo(() => {
    const start = aiPage * aiVisibleRows;
    return aiJobs.slice(start, start + aiVisibleRows);
  }, [aiJobs, aiPage, aiVisibleRows]);

  const totalFiltered = aiJobs.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / aiVisibleRows));
  const borderColor = isFocused ? colors.accent : colors.textDim;

  // Pinned to the budgeted height whatever the status: a one-line message and
  // a full table must cost the same rows, or the main table above jumps.
  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={borderColor}
      height={height}
      flexShrink={0}
      overflow="hidden"
    >
      <Box justifyContent="space-between" paddingX={1}>
        <Text color={isFocused ? colors.accent : colors.primary} bold wrap="truncate-end">
          AI Curated{status === 'done' ? ` (${totalFiltered})` : ''}
        </Text>
        {status === 'filtering' && (
          <Text color={colors.accent} wrap="truncate-end">{spinner} Analyzing...</Text>
        )}
        {status === 'done' && totalFiltered > 0 && (
          <Text dimColor wrap="truncate-end">
            Page <Text color={colors.primary}>{aiPage + 1}</Text> of {totalPages} — {totalFiltered} jobs
          </Text>
        )}
      </Box>

      {status === 'idle' && (
        <Box paddingX={1}>
          <Text dimColor wrap="truncate-end">Press g to run AI filter</Text>
        </Box>
      )}
      {status === 'filtering' && (
        <Box paddingX={1}>
          <Text dimColor wrap="truncate-end">Sending jobs to DeepSeek for analysis...</Text>
        </Box>
      )}
      {status === 'error' && (
        <Box paddingX={1}>
          <Text color={colors.danger} wrap="truncate-end">Error: {error}</Text>
        </Box>
      )}
      {status === 'done' && pagedJobs.length === 0 && (
        <Box paddingX={1}>
          <Text dimColor wrap="truncate-end">No matching Senior Frontend roles found</Text>
        </Box>
      )}
      {status === 'done' && pagedJobs.length > 0 && (
        <JobTable
          jobs={pagedJobs}
          selectedIndex={aiSelectedIndex}
          focused={isFocused}
          width={width - 2}
          maxRows={aiVisibleRows}
          remoteMap={aiRemoteMap}
        />
      )}
    </Box>
  );
}
