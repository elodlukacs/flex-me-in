import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { ALL_SOURCES } from '../../state/types.js';
import type { FetchSourceStatus } from '../../state/types.js';
import { colors, sourceColors, sourceLabels } from '../../utils/theme.js';
import { useAppState } from '../../state/context.js';

const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function SourceChip({ status, isLast }: { status: FetchSourceStatus; isLast: boolean }) {
  const [frame, setFrame] = useState(0);
  const color = sourceColors[status.source] ?? colors.textDim;
  const label = sourceLabels[status.source] ?? status.source;

  useEffect(() => {
    if (status.status !== 'fetching') return;
    const timer = setInterval(() => setFrame((f) => (f + 1) % spinnerFrames.length), 80);
    return () => clearInterval(timer);
  }, [status.status]);

  let icon: string;
  switch (status.status) {
    case 'fetching':
      icon = spinnerFrames[frame]!;
      break;
    case 'done':
      icon = '✓';
      break;
    case 'error':
      icon = '✗';
      break;
    case 'cancelled':
      icon = '⊘';
      break;
    default:
      icon = '○';
  }

  const countText = status.count > 0 ? `(${status.count})` : '';

  return (
    <Text color={color}>
      {icon} {label}{countText}{!isLast && <Text dimColor> |</Text>}
    </Text>
  );
}

export function ProgressBar() {
  const { state } = useAppState();

  return (
    <Box gap={0}>
      {ALL_SOURCES.map((source, idx) => (
        <SourceChip 
          key={source} 
          status={state.fetchStatus[source]} 
          isLast={idx === ALL_SOURCES.length - 1}
        />
      ))}
    </Box>
  );
}
