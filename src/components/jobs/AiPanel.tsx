import React, { useMemo, useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { JobTable } from './JobTable.js';
import { colors } from '../../utils/theme.js';
import { useStore, shallowEqual } from '../../state/store.js';

const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export function AiPanel() {
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

  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (status !== 'filtering') return;
    const t = setInterval(() => setFrame((f) => (f + 1) % spinnerFrames.length), 80);
    return () => clearInterval(t);
  }, [status]);

  const pagedJobs = useMemo(() => {
    const start = aiPage * aiVisibleRows;
    return aiJobs.slice(start, start + aiVisibleRows);
  }, [aiJobs, aiPage, aiVisibleRows]);

  const totalFiltered = aiJobs.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / aiVisibleRows));
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
            Page <Text color={colors.primary}>{aiPage + 1}</Text> of {totalPages} — {totalFiltered} jobs
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
          <Text dimColor>Sending jobs to Groq for analysis...</Text>
        </Box>
      )}
      {status === 'error' && (
        <Box paddingX={1}>
          <Text color={colors.danger}>Error: {error}</Text>
        </Box>
      )}
      {status === 'done' && pagedJobs.length === 0 && (
        <Box paddingX={1}>
          <Text dimColor>No matching Senior Frontend roles found</Text>
        </Box>
      )}
      {status === 'done' && pagedJobs.length > 0 && (
        <JobTable
          jobs={pagedJobs}
          selectedIndex={isFocused ? aiSelectedIndex : -1}
          width={width - 2}
          maxRows={aiVisibleRows}
          remoteMap={aiRemoteMap}
        />
      )}
    </Box>
  );
}
