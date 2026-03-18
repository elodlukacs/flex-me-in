import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../../utils/theme.js';
import { useAppState } from '../../state/context.js';

const filterLabels: Record<string, string> = {
  status: 'Status',
  source: 'Source',
  workType: 'Work',
  title: 'Title',
  company: 'Company',
  country: 'Country',
};

export function FilterBar() {
  const { state } = useAppState();
  const activeFilters = Object.entries(state.filters).filter(([_, v]) => v !== '');

  if (activeFilters.length === 0) return null;

  return (
    <Box gap={1} flexWrap="wrap">
      <Text dimColor>Filters:</Text>
      {activeFilters.map(([key, value]) => (
        <Text key={key} color={colors.accent}>
          {filterLabels[key] ?? key}:{value}
        </Text>
      ))}
    </Box>
  );
}
