import React from 'react';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { useJobLoader } from '../hooks/useJobLoader.js';
import { useHydrate } from '../hooks/useHydrate.js';
import { useLayout } from '../hooks/useLayout.js';
import { useFetcher } from '../hooks/useFetcher.js';
import { useAiFilter } from '../hooks/useAiFilter.js';
import { useKeyboardHandler } from '../hooks/useKeyboardHandler.js';
import { AppContent } from './AppContent.js';

export function AppShell() {
  useTerminalSize();
  useHydrate();
  useJobLoader();
  useLayout();

  const { fetchAll, fetchOne, cancelFetch } = useFetcher();
  const { runFilter, cancelFilter } = useAiFilter();
  // cancelFilter lets G / Ctrl+D abort an in-flight AI request.
  useKeyboardHandler(fetchAll, fetchOne, cancelFetch, runFilter, cancelFilter);

  return <AppContent />;
}
