import React, { useEffect, useMemo } from 'react';
import { Box, Text } from 'ink';
import type { Job } from '../../state/types.js';
import { colors, sourceLabels } from '../../utils/theme.js';
import { truncate, wrapText, formatPosted } from '../../utils/format.js';
import { useStore, useDispatch, shallowEqual } from '../../state/store.js';

interface JobPopupProps {
  job: Job;
  /** Terminal width; the popup leaves a two-column margin on each side. */
  width: number;
  /** Rows available between the chrome above and below (useLayout's bodyRows). */
  height: number;
}

/** Outer border (2) + header divider (1) + footer divider and hint (2). */
const FRAME_ROWS = 5;

export function JobPopup({ job, width, height }: JobPopupProps) {
  const dispatch = useDispatch();
  const { description, scrollOffset } = useStore(
    (s) => ({ description: s.popupDescription, scrollOffset: s.popupScroll }),
    shallowEqual
  );

  const boxWidth = Math.max(24, width - 4);
  // Inside the round border and one column of padding on each side.
  const lineWidth = boxWidth - 4;
  const headerLines = [
    truncate(job.title, lineWidth),
    truncate(
      [job.company, sourceLabels[job.source] ?? job.source, job.datePosted && formatPosted(job.datePosted), job.status]
        .filter(Boolean)
        .join(' • '),
      lineWidth
    ),
    ...(job.country ? [truncate(job.country, lineWidth)] : []),
  ];
  const maxContentHeight = Math.max(1, height - FRAME_ROWS - headerLines.length);

  // Measured exactly as the terminal will draw it, so Ink never re-wraps a
  // line and the scroll range below matches what is on screen.
  const wrappedLines = useMemo(
    () => wrapText(description || 'No description available.', lineWidth),
    [description, lineWidth]
  );

  // The scroll clamp lives in the reducer, which cannot know the wrapped line
  // count — report it once it is known.
  const maxScroll = Math.max(0, wrappedLines.length - maxContentHeight);
  useEffect(() => {
    dispatch({ type: 'SET_POPUP_MAX_SCROLL', max: maxScroll });
  }, [maxScroll, dispatch]);

  const offset = Math.min(scrollOffset, maxScroll);
  const visibleLines = wrappedLines.slice(offset, offset + maxContentHeight);
  const hasMoreUp = offset > 0;
  const hasMoreDown = offset < maxScroll;

  // `height`, not `minHeight`: the popup used to be sized from the whole
  // terminal and overdrew the title, tabs, help and status rows.
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={colors.accent}
      width={boxWidth}
      height={height}
      flexShrink={0}
      overflow="hidden"
    >
      <Box
        flexDirection="column"
        paddingX={1}
        borderStyle="single"
        borderTop={false}
        borderLeft={false}
        borderRight={false}
        borderColor={colors.textDim}
        flexShrink={0}
      >
        {headerLines.map((line, i) => (
          <Text key={i} bold={i === 0} color={i === 0 ? colors.accent : undefined} dimColor={i > 0} wrap="truncate-end">
            {line}
          </Text>
        ))}
      </Box>

      <Box flexDirection="column" paddingX={1} height={maxContentHeight} flexShrink={0} overflow="hidden">
        {visibleLines.map((line, i) => (
          // An empty <Text> measures zero rows; blank lines must still take one.
          <Text key={i} wrap="truncate-end">{line || ' '}</Text>
        ))}
      </Box>

      <Box
        paddingX={1}
        borderStyle="single"
        borderBottom={false}
        borderLeft={false}
        borderRight={false}
        borderColor={colors.textDim}
        flexShrink={0}
      >
        <Text dimColor wrap="truncate-end">
          {hasMoreUp ? '▲' : ' '} j/k scroll {hasMoreDown ? '▼' : ' '} | o open | Esc/q close
        </Text>
      </Box>
    </Box>
  );
}
