import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { colors } from '../../utils/theme.js';
import { useStore, useDispatch, useStoreInstance, shallowEqual } from '../../state/store.js';

const modeLabels: Record<string, string> = {
  title: 'Filter by title',
  company: 'Filter by company',
  country: 'Filter by country',
};

export function TextInput() {
  const dispatch = useDispatch();
  const store = useStoreInstance();
  const { inputMode, inputValue, width } = useStore(
    (s) => ({ inputMode: s.inputMode, inputValue: s.inputValue, width: s.terminalWidth }),
    shallowEqual
  );
  const [cursorVisible, setCursorVisible] = useState(true);

  useEffect(() => {
    if (inputMode === 'none') return;
    const timer = setInterval(() => setCursorVisible((v) => !v), 500);
    return () => clearInterval(timer);
  }, [inputMode]);

  useInput((input, key) => {
    // Read latest input value directly from store to avoid stale closures.
    const current = store.getState();
    if (current.inputMode === 'none') return;
    if (key.return || key.escape) return;

    if (key.backspace || key.delete) {
      dispatch({ type: 'SET_INPUT_VALUE', value: current.inputValue.slice(0, -1) });
      return;
    }

    if (input && !key.ctrl && !key.meta) {
      dispatch({ type: 'SET_INPUT_VALUE', value: current.inputValue + input });
    }
  });

  if (inputMode === 'none') return null;

  // One row (useLayout budgets it as one); the cut eats the hint first.
  return (
    <Box width={width} flexShrink={0}>
      <Text wrap="truncate-end">
        <Text color={colors.accent} bold>{modeLabels[inputMode] ?? inputMode}: </Text>
        <Text>{inputValue}</Text>
        <Text color={colors.primary}>{cursorVisible ? '█' : ' '}</Text>
        <Text dimColor> (Enter to apply, Esc to cancel)</Text>
      </Text>
    </Box>
  );
}
