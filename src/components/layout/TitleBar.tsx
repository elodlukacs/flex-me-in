import React from 'react';
import { Box, Text } from 'ink';
import { colors, sourceLabels } from '../../utils/theme.js';
import { textWidth } from '../../utils/format.js';
import { useStore, shallowEqual } from '../../state/store.js';

export function TitleBar() {
  const { width, sourceFilter } = useStore(
    (s) => ({ width: s.terminalWidth, sourceFilter: s.sourceFilter }),
    shallowEqual
  );

  const title = ' flex-me-in ';
  const sourceLabel = sourceFilter === 'all' ? 'All Sources' : (sourceLabels[sourceFilter] || sourceFilter);
  const subtitle = ` [${sourceLabel}]`;
  const fullWidth = textWidth(title + subtitle);
  const padding = Math.max(0, Math.floor((width - fullWidth) / 2));

  return (
    <Box width={width} flexShrink={0}>
      <Text backgroundColor={colors.primary} color={colors.background} bold wrap="truncate-end">
        {' '.repeat(padding)}{title}<Text color={colors.warning}>{subtitle}</Text>{' '.repeat(Math.max(0, width - padding - fullWidth))}
      </Text>
    </Box>
  );
}
