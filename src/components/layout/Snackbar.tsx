import React, { useEffect } from 'react';
import { Box, Text } from 'ink';
import { useAppState } from '../../state/context.js';
import { colors } from '../../utils/theme.js';

export function Snackbar() {
  const { state, dispatch } = useAppState();

  useEffect(() => {
    if (state.snackbar.visible) {
      const timer = setTimeout(() => {
        dispatch({ type: 'HIDE_SNACKBAR' });
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [state.snackbar.visible, dispatch]);

  if (!state.snackbar.visible) return null;

  return (
    <Box
      justifyContent="center"
      borderStyle="round"
      borderColor={colors.success}
      paddingX={1}
      paddingY={0}
    >
      <Text>{state.snackbar.message}</Text>
    </Box>
  );
}
