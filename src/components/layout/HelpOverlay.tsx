import React from 'react';
import { Box, Text } from 'ink';
import { ALL_SOURCES } from '../../state/types.js';
import { colors, sourceShortLabels } from '../../utils/theme.js';
import { truncate } from '../../utils/format.js';
import { useStore } from '../../state/store.js';
import { KEY_BINDINGS } from './HelpText.js';

const GROUPS = ['Navigate', 'Job', 'Fetch', 'AI', 'Filter', 'App'] as const;
const ERRORS_GROUP = 'Source errors';
const COL_GAP = 3;
/** Error text is worth a wider column when the width is there. */
const MAX_COL_WIDTH = 48;
/** Border (2) + title row (1) + the margin under it (1). */
const FRAME_ROWS = 4;
/** Border (2) + paddingX on both sides (4). */
const FRAME_COLS = 6;

interface Group {
  name: string;
  rows: Array<[key: string, desc: string]>;
}

const bindingGroups: Group[] = GROUPS.map((name) => ({
  name,
  rows: KEY_BINDINGS.filter(([, , g]) => g === name).map(([k, d]) => [k, d]),
}));
const keyColumn = Math.max(...KEY_BINDINGS.map(([k]) => k.length)) + 2;
const baseColWidth = keyColumn + Math.max(...KEY_BINDINGS.map(([, d]) => d.length));

/**
 * Fills columns top to bottom, starting a new column when the next group
 * would pass `maxRows`. Blank lines between groups are a luxury dropped first.
 */
function pack(groups: Group[], maxRows: number, gaps: boolean): Group[][] {
  const cols: Group[][] = [[]];
  let used = 0;
  for (const g of groups) {
    const col = cols[cols.length - 1]!;
    const need = 1 + g.rows.length + (gaps && col.length > 0 ? 1 : 0);
    if (col.length > 0 && used + need > maxRows) {
      cols.push([g]);
      used = 1 + g.rows.length;
    } else {
      col.push(g);
      used += need;
    }
  }
  return cols;
}

function columnHeight(col: Group[], gaps: boolean): number {
  return col.reduce((sum, g, i) => sum + 1 + g.rows.length + (gaps && i > 0 ? 1 : 0), 0);
}

interface HelpOverlayProps {
  width: number;
  /** Rows available for the overlay (useLayout's bodyRows). */
  height: number;
}

/**
 * The complete keybinding list, opened with `?`, plus the last error of each
 * source that failed (the progress row only has room for a ✗). As a single
 * column it was ~42 rows tall and overdrew everything at 80×24, so the groups
 * are laid out in as many columns as the width allows and the box is pinned
 * to the body height. Errors are packed as one more group, keyed by the
 * source's short code, so they fit even at 80×24.
 */
export function HelpOverlay({ width, height }: HelpOverlayProps) {
  const fetchStatus = useStore((s) => s.fetchStatus);

  const maxWidth = Math.max(20, width - 2);
  const maxInner = maxWidth - FRAME_COLS;
  const maxCols = Math.max(1, Math.floor((maxInner + COL_GAP) / (baseColWidth + COL_GAP)));

  const failed = ALL_SOURCES.filter((s) => fetchStatus[s].status === 'error');
  const groups: Group[] =
    failed.length > 0
      ? [
          ...bindingGroups,
          {
            name: ERRORS_GROUP,
            // One row each: a multi-line error body would break the row count.
            rows: failed.map((s) => [
              sourceShortLabels[s] ?? s,
              (fetchStatus[s].error || 'failed').replace(/\s+/g, ' '),
            ]),
          },
        ]
      : bindingGroups;

  const rowsForGroups = Math.max(1, height - FRAME_ROWS);
  let gaps = true;
  let columns = pack(groups, rowsForGroups, gaps);
  if (columns.length > maxCols) {
    gaps = false;
    columns = pack(groups, rowsForGroups, gaps);
  }
  const tallest = Math.max(...columns.map((c) => columnHeight(c, gaps)));
  // Anything still past the body height is clipped rather than overdrawn.
  const boxHeight = Math.min(height, FRAME_ROWS + tallest);

  // Spare width goes to the columns so error text is cut as late as possible.
  const n = columns.length;
  const colWidth =
    failed.length > 0
      ? Math.max(baseColWidth, Math.min(MAX_COL_WIDTH, Math.floor((maxInner - (n - 1) * COL_GAP) / n)))
      : baseColWidth;
  const columnsWidth = n * colWidth + (n - 1) * COL_GAP;
  const boxWidth = Math.min(maxWidth, Math.max(40, columnsWidth + FRAME_COLS));
  const descWidth = colWidth - keyColumn;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={colors.accent}
      paddingX={2}
      width={boxWidth}
      height={boxHeight}
      flexShrink={0}
      overflow="hidden"
    >
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color={colors.accent}>Keybindings</Text>
        <Text dimColor>Any key to close</Text>
      </Box>
      <Box gap={COL_GAP} flexShrink={0}>
        {columns.map((col, ci) => (
          <Box key={ci} flexDirection="column" width={colWidth} flexShrink={0}>
            {col.map((group, gi) => {
              const isErrors = group.name === ERRORS_GROUP;
              return (
                <Box key={group.name} flexDirection="column" marginTop={gaps && gi > 0 ? 1 : 0}>
                  <Text bold color={isErrors ? colors.danger : colors.primary}>{group.name}</Text>
                  {group.rows.map(([k, desc]) => (
                    <Text key={group.name + k} wrap="truncate-end">
                      <Text color={isErrors ? colors.danger : colors.accent}>{k.padEnd(keyColumn)}</Text>
                      <Text dimColor>{truncate(desc, descWidth)}</Text>
                    </Text>
                  ))}
                </Box>
              );
            })}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
