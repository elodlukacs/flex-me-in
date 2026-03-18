import React, { useReducer } from 'react';
import { AppContext } from '../state/context.js';
import { reducer, createInitialState } from '../state/reducer.js';
import { AppShell } from './AppShell.js';

export function App() {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      <AppShell />
    </AppContext.Provider>
  );
}
