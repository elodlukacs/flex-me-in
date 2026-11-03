import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../../utils/theme.js';
import { useStore, shallowEqual } from '../../state/store.js';

export function Pagination() {
  // mainVisibleRows is the page size (SET_VISIBLE_ROWS keeps them equal).
  const { page, pageSize, jobsLen } = useStore(
    (s) => ({ page: s.page, pageSize: Math.max(1, s.mainVisibleRows), jobsLen: s.jobs.length }),
    shallowEqual
  );

  const totalPages = Math.max(1, Math.ceil(jobsLen / pageSize));

  return (
    <Box flexShrink={0}>
      <Text dimColor wrap="truncate-end">
        Page <Text color={colors.primary}>{page + 1}</Text> of {totalPages} — {jobsLen} jobs
      </Text>
    </Box>
  );
}
