import React from 'react';
import { Box, Text } from 'ink';
import { ALL_SOURCES } from '../../state/types.js';
import type { FetchSourceStatus, Source } from '../../state/types.js';
import { colors, sourceColors, sourceLabels, sourceShortLabels } from '../../utils/theme.js';
import { textWidth } from '../../utils/format.js';
import { useStore, shallowEqual } from '../../state/store.js';
import { useSpinner } from '../../hooks/useSpinner.js';

const SEPARATOR = ' | ';

function icon(status: FetchSourceStatus, spinner: string): string {
  switch (status.status) {
    case 'fetching':
      return spinner;
    case 'done':
      // Stopped early: what was fetched is kept, but the list may be incomplete.
      return status.partial ? '⚠' : '✓';
    case 'error':
      return '✗';
    case 'cancelled':
      return '⊘';
    default:
      return '○';
  }
}

interface Tier {
  labels: Record<string, string>;
  counts: boolean;
}

/** Most to least verbose; the first that fits on one row wins. */
const TIERS: Tier[] = [
  { labels: sourceLabels, counts: true },
  { labels: sourceShortLabels, counts: true },
  { labels: sourceShortLabels, counts: false },
];

function chipText(status: FetchSourceStatus, tier: Tier, spinner: string): string {
  const label = tier.labels[status.source] ?? status.source;
  const count = tier.counts && status.count > 0 ? `(${status.count})` : '';
  return `${icon(status, spinner)} ${label}${count}`;
}

/**
 * Exactly one row, like every other chrome row useLayout budgets. Seven full
 * chips with counts run past 100 columns and used to wrap onto two rows.
 * Per-source error text lives in the `?` overlay; here a failure is only ✗
 * and a partial fetch only ⚠.
 */
export function ProgressBar() {
  const { fetchStatus, width } = useStore(
    (s) => ({ fetchStatus: s.fetchStatus, width: s.terminalWidth }),
    shallowEqual
  );
  const fetching = ALL_SOURCES.some((s) => fetchStatus[s].status === 'fetching');
  // One shared ticker for every chip instead of one interval per chip.
  const spinner = useSpinner(fetching);

  const render = (tier: Tier) => ALL_SOURCES.map((s: Source) => chipText(fetchStatus[s], tier, spinner));
  const fits = (chips: string[]) =>
    chips.reduce((sum, c) => sum + textWidth(c), 0) + SEPARATOR.length * (chips.length - 1) <= width;
  const chips = TIERS.map(render).find(fits) ?? render(TIERS[TIERS.length - 1]!);

  return (
    <Box width={width} flexShrink={0}>
      <Text wrap="truncate-end">
        {chips.map((chip, idx) => {
          const source = ALL_SOURCES[idx]!;
          return (
            <React.Fragment key={source}>
              {idx > 0 && <Text dimColor>{SEPARATOR}</Text>}
              <Text color={sourceColors[source] ?? colors.textDim}>{chip}</Text>
            </React.Fragment>
          );
        })}
      </Text>
    </Box>
  );
}
