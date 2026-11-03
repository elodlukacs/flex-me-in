import React from 'react';
import { Box, Text } from 'ink';
import { useStore, shallowEqual } from '../../state/store.js';
import { ALL_SOURCES, type SourceFilter } from '../../state/types.js';
import { sourceColors, sourceLabels, sourceShortLabels, colors } from '../../utils/theme.js';
import { textWidth } from '../../utils/format.js';

const SEPARATOR = ' | ';
const ids: SourceFilter[] = ['all', ...ALL_SOURCES];

/** Full labels first, then short codes; the first tier that fits is used. */
const tiers: string[][] = [
  ids.map((id) => (id === 'all' ? 'All' : sourceLabels[id] || id)),
  ids.map((id) => (id === 'all' ? 'All' : sourceShortLabels[id] || id)),
];

function tierWidth(labels: string[]): number {
  // +2 for the brackets around the active tab.
  return labels.reduce((sum, l) => sum + textWidth(l), 0) + SEPARATOR.length * (labels.length - 1) + 2;
}

/**
 * Exactly one row at any width: useLayout budgets it as one, and with all
 * seven full labels it wrapped onto a second row at 80 columns, which let the
 * cursor move onto rows hidden below the fold.
 */
export function TabBar() {
  const { sourceFilter, width } = useStore(
    (s) => ({ sourceFilter: s.sourceFilter, width: s.terminalWidth }),
    shallowEqual
  );
  const labels = tiers.find((t) => tierWidth(t) <= width) ?? tiers[tiers.length - 1]!;

  return (
    <Box width={width} flexShrink={0}>
      <Text wrap="truncate-end">
        {ids.map((id, idx) => {
          const isActive = id === sourceFilter;
          const sourceColor = id === 'all' ? colors.accent : sourceColors[id] || colors.textDim;
          return (
            <React.Fragment key={'tab-' + id}>
              {idx > 0 && <Text dimColor>{SEPARATOR}</Text>}
              {isActive ? (
                <Text bold color={sourceColor}>[{labels[idx]}]</Text>
              ) : (
                <Text dimColor>{labels[idx]}</Text>
              )}
            </React.Fragment>
          );
        })}
      </Text>
    </Box>
  );
}
