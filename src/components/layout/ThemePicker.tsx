import React from 'react';
import { Box, Text } from 'ink';
import { useStore, shallowEqual } from '../../state/store.js';
import { themes, themeIds } from '../../utils/theme.js';

interface ThemePickerProps {
  /** Rows available for the picker (useLayout's bodyRows). */
  height: number;
}

/** Border (2) + vertical padding (2) + title and its margin (2) + hint and its margin (2). */
const FRAME_ROWS = 8;

export function ThemePicker({ height }: ThemePickerProps) {
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

  // Sixteen themes don't fit at 24 rows: show a window that follows the
  // selection instead of letting the list overflow the body.
  const visible = Math.max(1, Math.min(themeIds.length, height - FRAME_ROWS));
  const start = Math.min(
    Math.max(0, themePickerIndex - Math.floor(visible / 2)),
    themeIds.length - visible
  );
  const windowIds = themeIds.slice(start, start + visible);
  const more = `${start > 0 ? '▲ ' : ''}${start + visible < themeIds.length ? '▼ ' : ''}`;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={currentTheme.primary}
      paddingX={3}
      paddingY={1}
      minWidth={30}
      flexShrink={0}
    >
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold>Select Theme</Text>
        <Text dimColor>(Esc/y to close)</Text>
      </Box>
      {windowIds.map((id) => {
        const theme = themes[id]!;
        const isActive = id === themeId;
        const isSelected = themeIds.indexOf(id) === themePickerIndex;

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
        <Text dimColor>{more}j/k: navigate | Enter: select</Text>
      </Box>
    </Box>
  );
}
