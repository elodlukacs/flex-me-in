import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../../utils/theme.js';
import { truncate, textWidth } from '../../utils/format.js';
import { useStore, shallowEqual } from '../../state/store.js';

// Resolved per render: as a module-level map these captured the theme loaded
// at import and never followed a theme change.
function typeColor(type: string): string {
  switch (type) {
    case 'success':
      return colors.success;
    case 'warning':
      return colors.warning;
    case 'error':
      return colors.danger;
    default:
      return colors.info;
  }
}

/**
 * One row, always the last on screen. The message wins over the counts: the
 * Ctrl+D confirm prompt must stay readable, so the counts shrink (and then
 * disappear) before the message is cut.
 */
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

  const messageW = textWidth(statusMessage);
  const candidates = [
    `${counts.total} jobs | ${counts.new} new | ${counts.applied} applied | ${counts.ignored} ignored`,
    `${counts.total} jobs | ${counts.new} new`,
    `${counts.total} jobs`,
    '',
  ];
  // One column of breathing room between the two halves.
  const left = candidates.find((c) => textWidth(c) + (c && messageW ? 1 : 0) + messageW <= terminalWidth) ?? '';
  const room = terminalWidth - textWidth(left) - (left ? 1 : 0);

  return (
    <Box justifyContent="space-between" width={terminalWidth} flexShrink={0}>
      <Text dimColor wrap="truncate-end">{left}</Text>
      <Text color={typeColor(statusType)} wrap="truncate-end">
        {truncate(statusMessage, room)}
      </Text>
    </Box>
  );
}
