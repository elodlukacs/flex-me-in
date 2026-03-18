import React from 'react';
import { Box, Text } from 'ink';
import { colors, sourceLabels } from '../../utils/theme.js';
import { useAppState } from '../../state/context.js';

export function TitleBar() {
  const { state } = useAppState();
  const width = state.terminalWidth;
  const title = ' flex-me-in ';
  const sourceLabel = state.sourceFilter === 'all' ? 'All Sources' : (sourceLabels[state.sourceFilter] || state.sourceFilter);
  const subtitle = ` [${sourceLabel}]`;
  const fullTitle = title + subtitle;
  const padding = Math.max(0, Math.floor((width - fullTitle.length) / 2));

  return (
    <Box>
      <Text backgroundColor={colors.primary} color="#282C34" bold>
        {' '.repeat(padding)}{title}<Text color={colors.warning}>{subtitle}</Text>{' '.repeat(Math.max(0, width - padding - fullTitle.length))}
      </Text>
    </Box>
  );
}
