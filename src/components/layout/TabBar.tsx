import React from 'react';
import { Box, Text } from 'ink';
import { useStore } from '../../state/store.js';
import { ALL_SOURCES, type SourceFilter } from '../../state/types.js';
import { sourceColors, sourceLabels, colors } from '../../utils/theme.js';

const tabs: { id: SourceFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  ...ALL_SOURCES.map((s) => ({ id: s as SourceFilter, label: sourceLabels[s] || s })),
];

export function TabBar() {
  const sourceFilter = useStore((s) => s.sourceFilter);

  return (
    <Box gap={1}>
      {tabs.map((tab, idx) => {
        const isActive = tab.id === sourceFilter;
        const sourceColor = tab.id === 'all' ? colors.accent : (sourceColors[tab.id] || colors.textDim);
        const prefix = idx === 0 ? '' : '|';

        return (
          <Text key={'tab-' + tab.id}>
            <Text dimColor>{prefix}</Text>
            {prefix && <Text> </Text>}
            {isActive ? (
              <Text bold color={sourceColor}>[{tab.label}]</Text>
            ) : (
              <Text dimColor>{tab.label}</Text>
            )}
          </Text>
        );
      })}
    </Box>
  );
}
