import React from 'react';
import { Box, Text } from 'ink';
import { useAppState } from '../../state/context.js';
import { themes, themeIds } from '../../utils/theme.js';

export function ThemePicker() {
  const { state } = useAppState();

  if (!state.showThemePicker) return null;

  const currentTheme = themes[state.themeId]!;

  return (
    <Box justifyContent="center" alignItems="center" flexGrow={1}>
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={currentTheme.primary}
        paddingX={3}
        paddingY={1}
        minWidth={30}
      >
        <Box justifyContent="space-between" marginBottom={1}>
          <Text bold>Select Theme</Text>
          <Text dimColor>(Esc/y to close)</Text>
        </Box>
        {themeIds.map((id, i) => {
          const theme = themes[id]!;
          const isActive = id === state.themeId;
          const isSelected = i === state.themePickerIndex;

          return (
            <Box key={id}>
              <Text color={isActive ? currentTheme.success : undefined}>
                {isSelected ? '▶ ' : isActive ? '● ' : '  '}
              </Text>
              <Text bold={isSelected}>
                {theme.name}
              </Text>
            </Box>
          );
        })}
        <Box marginTop={1}>
          <Text dimColor>j/k: navigate | Enter: select</Text>
        </Box>
      </Box>
    </Box>
  );
}
