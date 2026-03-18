import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../../utils/theme.js';
import { useAppState } from '../../state/context.js';

const typeColors: Record<string, string> = {
  info: colors.info,
  success: colors.success,
  warning: colors.warning,
  error: colors.danger,
};

export function StatusBar() {
  const { state } = useAppState();
  const counts = state.jobCounts;
  const left = `${counts.total} jobs | ${counts.new} new | ${counts.applied} applied | ${counts.ignored} ignored`;

  return (
    <Box justifyContent="space-between" width={state.terminalWidth}>
      <Text dimColor>{left}</Text>
      <Text color={typeColors[state.statusType] ?? colors.info}>{state.statusMessage}</Text>
    </Box>
  );
}
