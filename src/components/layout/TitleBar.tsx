import React from 'react';
import { Box, Text } from 'ink';
import { colors, sourceLabels } from '../../utils/theme.js';
import { formatRomaniaTime, textWidth } from '../../utils/format.js';
import { useStore, shallowEqual } from '../../state/store.js';

export function TitleBar() {
  const { width, sourceFilter, lastRefreshAt } = useStore(
    (s) => ({ width: s.terminalWidth, sourceFilter: s.sourceFilter, lastRefreshAt: s.lastRefreshAt }),
    shallowEqual
  );

  const title = ' flex-me-in ';
  const sourceLabel = sourceFilter === 'all' ? 'All Sources' : (sourceLabels[sourceFilter] || sourceFilter);
  const subtitle = ` [${sourceLabel}]`;
  const fullWidth = textWidth(title + subtitle);
  const padding = Math.max(0, Math.floor((width - fullWidth) / 2));

  // Right-aligned refresh stamp, in Romania time; shortened, then dropped,
  // rather than ever wrapping the row.
  const time = lastRefreshAt ? formatRomaniaTime(lastRefreshAt) : '';
  const stamp =
    [time ? `Refreshed ${time} ` : 'Never refreshed ', time ? `${time} ` : '', ''].find(
      (c) => padding + fullWidth + 1 + textWidth(c) <= width
    ) ?? '';
  const fill = Math.max(0, width - padding - fullWidth - textWidth(stamp));

  return (
    <Box width={width} flexShrink={0}>
      <Text backgroundColor={colors.primary} color={colors.background} bold wrap="truncate-end">
        {' '.repeat(padding)}{title}<Text color={colors.warning}>{subtitle}</Text>{' '.repeat(fill)}{stamp}
      </Text>
    </Box>
  );
}
