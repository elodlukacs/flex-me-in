import React, { useEffect } from 'react';
import { Box, Text } from 'ink';
import { useStore, useDispatch, shallowEqual } from '../../state/store.js';
import { colors } from '../../utils/theme.js';

export function Snackbar() {
  const dispatch = useDispatch();
  const { visible, message } = useStore((s) => s.snackbar, shallowEqual);

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
    <Box
      justifyContent="center"
      borderStyle="round"
      borderColor={colors.success}
      paddingX={1}
      paddingY={0}
    >
      <Text>{message}</Text>
    </Box>
  );
}
