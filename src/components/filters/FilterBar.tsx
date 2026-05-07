import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../../utils/theme.js';
import { useStore } from '../../state/store.js';

const filterLabels: Record<string, string> = {
  status: 'Status',
  source: 'Source',
  workType: 'Work',
  title: 'Title',
  company: 'Company',
  country: 'Country',
};

export function FilterBar() {
  const filters = useStore((s) => s.filters);
  const activeFilters = Object.entries(filters).filter(([_, v]) => v !== '');

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
