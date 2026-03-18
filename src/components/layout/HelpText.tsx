import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../../utils/theme.js';

const keys = [
  ['j/k', 'nav'],
  ['←/→', 'page'],
  ['Tab', 'panel'],
  ['f', 'fetch'],
  ['g', 'AI filter'],
  ['o', 'open'],
  ['Enter', 'view'],
  ['a', 'apply'],
  ['i', 'ignore'],
  ['s', 'status'],
  ['t', 'title'],
  ['c', 'company'],
  ['x', 'clear'],
  ['y', 'theme'],
  ['1-9', 'source'],
  ['q', 'quit'],
];

export function HelpText() {
  return (
    <Box gap={1}>
      {keys.map(([k, desc], i) => (
        <React.Fragment key={'help-' + k}>
          {i > 0 ? <Text dimColor>|</Text> : null}
          <Text>
            <Text color={colors.accent} bold>{k}</Text>
            <Text dimColor>:{desc}</Text>
          </Text>
        </React.Fragment>
      ))}
    </Box>
  );
}
