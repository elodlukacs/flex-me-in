import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../../utils/theme.js';
import { useStore, shallowEqual } from '../../state/store.js';

export function Pagination() {
  const { page, pageSize, jobsLen } = useStore(
    (s) => ({ page: s.page, pageSize: s.pageSize, jobsLen: s.jobs.length }),
    shallowEqual
  );

  const totalPages = Math.max(1, Math.ceil(jobsLen / pageSize));

  return (
    <Box>
      <Text dimColor>
        Page <Text color={colors.primary}>{page + 1}</Text> of {totalPages} — {jobsLen} jobs
      </Text>
    </Box>
  );
}
