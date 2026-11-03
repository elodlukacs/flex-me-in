import React, { useState } from 'react';
import { useApp } from 'ink';
import { Store, StoreContext } from '../state/store.js';
import { createInitialState } from '../state/reducer.js';
import { AppShell } from './AppShell.js';
import { ErrorBoundary } from './ErrorBoundary.js';

function Root() {
  // Inside the boundary: building the initial state reads config and can throw.
  const [store] = useState(() => new Store(createInitialState()));

  return (
    <StoreContext.Provider value={store}>
      <AppShell />
    </StoreContext.Provider>
  );
}

export function App() {
  const { exit } = useApp();

  return (
    <ErrorBoundary onError={exit}>
      <Root />
    </ErrorBoundary>
  );
}
