import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../../utils/theme.js';
import { useAppState } from '../../state/context.js';
import { selectTotalPages } from '../../state/selectors.js';

export function Pagination() {
  const { state } = useAppState();
  const totalPages = selectTotalPages(state);

  return (
    <Box>
      <Text dimColor>
        Page <Text color={colors.primary}>{state.page + 1}</Text> of {totalPages} — {state.jobs.length} jobs
      </Text>
    </Box>
  );
}
