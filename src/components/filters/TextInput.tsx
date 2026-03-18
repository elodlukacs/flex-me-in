import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { colors } from '../../utils/theme.js';
import { useAppState } from '../../state/context.js';

const modeLabels: Record<string, string> = {
  title: 'Filter by title',
  company: 'Filter by company',
  country: 'Filter by country',
};

export function TextInput() {
  const { state, dispatch } = useAppState();
  const [cursorVisible, setCursorVisible] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => setCursorVisible((v) => !v), 500);
    return () => clearInterval(timer);
  }, []);

  useInput((input, key) => {
    if (state.inputMode === 'none') return;
    if (key.return || key.escape) return;

    if (key.backspace || key.delete) {
      dispatch({ type: 'SET_INPUT_VALUE', value: state.inputValue.slice(0, -1) });
      return;
    }

    if (input && !key.ctrl && !key.meta) {
      dispatch({ type: 'SET_INPUT_VALUE', value: state.inputValue + input });
    }
  });

  if (state.inputMode === 'none') return null;

  return (
    <Box>
      <Text color={colors.accent} bold>{modeLabels[state.inputMode] ?? state.inputMode}: </Text>
      <Text>{state.inputValue}</Text>
      <Text color={colors.primary}>{cursorVisible ? '█' : ' '}</Text>
      <Text dimColor> (Enter to apply, Esc to cancel)</Text>
    </Box>
  );
}
