import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { JobTable } from './JobTable.js';
import { colors } from '../../utils/theme.js';
import { useAppState } from '../../state/context.js';
import { selectPagedAiJobs, selectAiTotalPages, selectAiFilteredJobs } from '../../state/selectors.js';

const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export function AiPanel() {
  const { state } = useAppState();
  const [frame, setFrame] = useState(0);

  const jobs = selectPagedAiJobs(state);
  const totalPages = selectAiTotalPages(state);
  const totalFiltered = selectAiFilteredJobs(state).length;
  const { aiFilterStatus: status, aiError: error, aiPanelFocused: isFocused, aiSelectedIndex: selectedIndex, aiPage: page, terminalWidth: width, aiVisibleRows: maxRows } = state;

  useEffect(() => {
    if (status !== 'filtering') return;
    const t = setInterval(() => setFrame((f) => (f + 1) % spinnerFrames.length), 80);
    return () => clearInterval(t);
  }, [status]);

  const borderColor = isFocused ? colors.accent : colors.textDim;

  return (
    <Box flexDirection="column" borderStyle="single" borderColor={borderColor}>
      <Box justifyContent="space-between" paddingX={1}>
        <Text color={isFocused ? colors.accent : colors.primary} bold>
          AI Curated{status === 'done' ? ` (${totalFiltered})` : ''}
        </Text>
        {status === 'filtering' && (
          <Text color={colors.accent}>{spinnerFrames[frame]} Analyzing...</Text>
        )}
        {status === 'done' && totalFiltered > 0 && (
          <Text dimColor>
            Page <Text color={colors.primary}>{page + 1}</Text> of {totalPages} — {totalFiltered} jobs
          </Text>
        )}
      </Box>

      {status === 'idle' && (
        <Box paddingX={1}>
          <Text dimColor>Press g to run AI filter</Text>
        </Box>
      )}
      {status === 'filtering' && (
        <Box paddingX={1}>
          <Text dimColor>Sending jobs to Claude for analysis...</Text>
        </Box>
      )}
      {status === 'error' && (
        <Box paddingX={1}>
          <Text color={colors.danger}>Error: {error}</Text>
        </Box>
      )}
      {status === 'done' && jobs.length === 0 && (
        <Box paddingX={1}>
          <Text dimColor>No matching Senior Frontend roles found</Text>
        </Box>
      )}
      {status === 'done' && jobs.length > 0 && (
        <JobTable
          jobs={jobs}
          selectedIndex={isFocused ? selectedIndex : -1}
          width={width - 2}
          maxRows={maxRows}
          remoteMap={state.aiRemoteMap}
        />
      )}
    </Box>
  );
}
