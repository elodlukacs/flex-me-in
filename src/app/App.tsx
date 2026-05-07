import React, { useState } from 'react';
import { Store, StoreContext } from '../state/store.js';
import { createInitialState } from '../state/reducer.js';
import { AppShell } from './AppShell.js';

export function App() {
  const [store] = useState(() => new Store(createInitialState()));

  return (
    <StoreContext.Provider value={store}>
      <AppShell />
    </StoreContext.Provider>
  );
}
