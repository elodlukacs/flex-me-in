import React from 'react';
import { Box, Text } from 'ink';
import { useStore, shallowEqual } from '../../state/store.js';
import { themes, themeIds } from '../../utils/theme.js';

export function ThemePicker() {
  const { showThemePicker, themeId, themePickerIndex } = useStore(
    (s) => ({
      showThemePicker: s.showThemePicker,
      themeId: s.themeId,
      themePickerIndex: s.themePickerIndex,
    }),
    shallowEqual
  );

  if (!showThemePicker) return null;

  const currentTheme = themes[themeId]!;

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
          const isActive = id === themeId;
          const isSelected = i === themePickerIndex;

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
