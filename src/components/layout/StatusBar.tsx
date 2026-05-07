import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../../utils/theme.js';
import { useStore, shallowEqual } from '../../state/store.js';

const typeColors: Record<string, string> = {
  info: colors.info,
  success: colors.success,
  warning: colors.warning,
  error: colors.danger,
};

export function StatusBar() {
  const { counts, statusMessage, statusType, terminalWidth } = useStore(
    (s) => ({
      counts: s.jobCounts,
      statusMessage: s.statusMessage,
      statusType: s.statusType,
      terminalWidth: s.terminalWidth,
    }),
    shallowEqual
  );

  const left = `${counts.total} jobs | ${counts.new} new | ${counts.applied} applied | ${counts.ignored} ignored`;

  return (
    <Box justifyContent="space-between" width={terminalWidth}>
      <Text dimColor>{left}</Text>
      <Text color={typeColors[statusType] ?? colors.info}>{statusMessage}</Text>
    </Box>
  );
}
