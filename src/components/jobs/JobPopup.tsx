import React, { useState } from 'react';
import { Box, Text } from 'ink';
import type { Job } from '../../state/types.js';
import { colors } from '../../utils/theme.js';
import { truncate } from '../../utils/format.js';

interface JobPopupProps {
  job: Job;
  width: number;
  height: number;
}

export function JobPopup({ job, width, height }: JobPopupProps) {
  const [scrollOffset, setScrollOffset] = useState(0);

  const headerHeight = 5;
  const maxContentHeight = height - headerHeight - 3;
  
  const description = job.description || 'No description available.';
  const lines = description.split('\n');
  const wrappedLines: string[] = [];
  const maxLineWidth = width - 8;

  for (const line of lines) {
    if (line.length <= maxLineWidth) {
      wrappedLines.push(line);
    } else {
      const words = line.split(' ');
      let currentLine = '';
      for (const word of words) {
        if ((currentLine + ' ' + word).trim().length <= maxLineWidth) {
          currentLine = (currentLine + ' ' + word).trim();
        } else {
          if (currentLine) wrappedLines.push(currentLine);
          currentLine = word;
        }
      }
      if (currentLine) wrappedLines.push(currentLine);
    }
  }

  const visibleLines = wrappedLines.slice(scrollOffset, scrollOffset + maxContentHeight);
  const hasMoreUp = scrollOffset > 0;
  const hasMoreDown = scrollOffset + maxContentHeight < wrappedLines.length;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={colors.accent} width={width - 4} minHeight={height - 4}>
      <Box flexDirection="column" paddingX={1} borderBottom>
        <Text bold color={colors.accent}>
          {truncate(job.title, width - 12)}
        </Text>
        <Text dimColor>
          {job.company} • {job.source} • {job.datePosted}
        </Text>
        {job.country && <Text dimColor>{job.country}</Text>}
      </Box>

      <Box flexDirection="column" paddingX={1} paddingY={0} minHeight={maxContentHeight}>
        {visibleLines.map((line, i) => (
          <Text key={i}>{line}</Text>
        ))}
      </Box>

      <Box paddingX={1} borderTop>
        <Text dimColor>
          {hasMoreUp ? '▲' : ' '} j/k scroll {hasMoreDown ? '▼' : ' '} | Esc/q close
        </Text>
      </Box>
    </Box>
  );
}
