import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../../utils/theme.js';
import { useStore, shallowEqual } from '../../state/store.js';

const filterLabels: Record<string, string> = {
  status: 'Status',
  workType: 'Work',
  title: 'Title',
  company: 'Company',
  country: 'Country',
};

/** One row (useLayout budgets it as one): long filter values are cut, not wrapped. */
export function FilterBar() {
  const { filters, width } = useStore(
    (s) => ({ filters: s.filters, width: s.terminalWidth }),
    shallowEqual
  );
  const activeFilters = Object.entries(filters).filter(([_, v]) => v !== '');

  if (activeFilters.length === 0) return null;

  return (
    <Box width={width} flexShrink={0}>
      <Text wrap="truncate-end">
        <Text dimColor>Filters:</Text>
        {activeFilters.map(([key, value]) => (
          <Text key={key} color={colors.accent}>
            {' '}{filterLabels[key] ?? key}:{value}
          </Text>
        ))}
      </Text>
    </Box>
  );
}
