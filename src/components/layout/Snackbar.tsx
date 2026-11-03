import React, { useEffect } from 'react';
import { Box, Text } from 'ink';
import { useStore, useDispatch, shallowEqual } from '../../state/store.js';
import { colors } from '../../utils/theme.js';
import { truncate } from '../../utils/format.js';

/**
 * One unbordered row: useLayout budgets the snackbar as a single row, and the
 * old rounded border made it three, pushing the status bar off screen.
 */
export function Snackbar() {
  const dispatch = useDispatch();
  const { visible, message, width } = useStore(
    (s) => ({ visible: s.snackbar.visible, message: s.snackbar.message, width: s.terminalWidth }),
    shallowEqual
  );

  useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => {
        dispatch({ type: 'HIDE_SNACKBAR' });
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [visible, dispatch]);

  if (!visible) return null;

  return (
    <Box justifyContent="center" width={width} flexShrink={0}>
      <Text color={colors.success} wrap="truncate-end">
        {truncate(`» ${message}`, width)}
      </Text>
    </Box>
  );
}
