import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../../utils/theme.js';
import { useStore } from '../../state/store.js';

/** Ordered by usefulness: the tail is dropped first when the terminal is narrow. */
export const KEY_BINDINGS: Array<[key: string, desc: string, group: string]> = [
  ['j/k', 'move', 'Navigate'],
  ['←/→', 'page', 'Navigate'],
  ['Tab', 'panel', 'Navigate'],
  ['Enter', 'view', 'Job'],
  ['o', 'open', 'Job'],
  ['a', 'apply', 'Job'],
  ['l', 'save later', 'Job'],
  ['i', 'ignore', 'Job'],
  ['n', 'clear status', 'Job'],
  ['f/F', 'fetch all/tab', 'Fetch'],
  ['Ctrl+S', 'cancel fetch', 'Fetch'],
  ['g', 'AI filter', 'AI'],
  ['G', 'clear AI', 'AI'],
  ['1-9', 'source tab', 'Filter'],
  ['s', 'status', 'Filter'],
  ['w', 'work type', 'Filter'],
  ['u', 'next tab', 'Filter'],
  ['t', 'title', 'Filter'],
  ['c', 'company', 'Filter'],
  ['m', 'country', 'Filter'],
  ['x', 'clear filters', 'Filter'],
  ['y', 'theme', 'App'],
  ['?', 'help', 'App'],
  ['Ctrl+D', 'wipe DB', 'App'],
  ['q', 'quit', 'App'],
];

/**
 * One row, always. The full list is 25 bindings wide — far past any normal
 * terminal — so it is trimmed to fit and `?` opens the complete list.
 */
export function HelpText() {
  const terminalWidth = useStore((s) => s.terminalWidth);

  const shown: typeof KEY_BINDINGS = [];
  let used = 0;
  const suffix = ' | ?:help';

  for (const entry of KEY_BINDINGS) {
    if (entry[0] === '?') continue;
    // "key:desc" plus the " | " separator.
    const cost = entry[0].length + 1 + entry[1].length + (shown.length > 0 ? 3 : 0);
    if (used + cost + suffix.length > terminalWidth) break;
    shown.push(entry);
    used += cost;
  }

  return (
    <Box flexShrink={0}>
      <Text wrap="truncate-end">
        {shown.map(([k, desc], i) => (
          <React.Fragment key={'help-' + k}>
            {i > 0 ? <Text dimColor> | </Text> : null}
            <Text color={colors.accent} bold>{k}</Text>
            <Text dimColor>:{desc}</Text>
          </React.Fragment>
        ))}
        <Text dimColor> | </Text>
        <Text color={colors.accent} bold>?</Text>
        <Text dimColor>:help</Text>
      </Text>
    </Box>
  );
}
