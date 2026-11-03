# Agent Guidelines for fe-hunt

This is a Terminal User Interface (TUI) application built with React, Ink, and TypeScript. It aggregates job listings from multiple remote job boards for senior frontend developer roles.

## Project Overview

- **Framework**: React + Ink (terminal UI)
- **Language**: TypeScript (strict mode)
- **Module System**: ESM (NodeNext)
- **Build Tool**: tsup
- **Runtime**: Node.js 20+

## Commands

### Development
```bash
npm run dev    # Run app in development mode with tsx
```

### Building
```bash
npm run build  # Build for production with tsup
npm run start  # Run the built application
```

### Testing
Vitest is configured (`vitest.config.ts`); tests live next to the code as `*.test.ts(x)`.
```bash
npm test                                         # vitest run, all tests
npx vitest run src/utils                         # one directory
npx vitest run --testNamePattern="test name"     # single test
```
- Layout is tested by rendering `AppContent` with Ink's `renderToString` at fixed sizes
  (`src/app/layout.test.tsx`): the frame must be exactly the terminal height with the
  StatusBar on the last line. Extend it when adding a row or an overlay.

### Type Checking
```bash
npm run typecheck   # tsc --noEmit
```

### Linting
**No ESLint or Prettier is configured.** If adding:
- Run ESLint: `npx eslint src/`
- Run Prettier check: `npx prettier --check src/`

## Code Style Guidelines

### Imports
- Use `.js` extension for local imports (ESM requirement): `import { x } from './utils.js';`
- Use `import type` for type-only imports to improve performance
- Group imports in order: external libraries, internal modules, local components/utils
- Example:
  ```typescript
  import React from 'react';
  import { Box, Text } from 'ink';
  import type { Job } from '../state/types.js';
  import { formatDate } from '../utils/format.js';
  ```

### TypeScript
- Enable strict mode in tsconfig (already enabled)
- Prefer `type` for unions, intersections, and type aliases
- Use `interface` for component props and object shapes with methods
- Use `as` assertions sparingly; prefer proper type narrowing
- Never use `any`; use `unknown` if type is truly unknown

### Naming Conventions
- **Files**: camelCase for utilities/hooks (e.g., `useJobLoader.ts`), PascalCase for components (e.g., `JobTable.tsx`)
- **Variables/Functions**: camelCase
- **Constants**: UPPER_SNAKE_CASE for compile-time constants, camelCase for object constants
- **Types/Interfaces**: PascalCase
- **React Components**: PascalCase, export as named export
- **Enums**: PascalCase with PascalCase members

### React/Component Patterns
- Use functional components with arrow functions or function declarations
- Destructure props in the function signature
- Define prop interfaces explicitly (not inline)
- Use memoization (`React.memo`) for expensive renders
- Keep components focused and small (< 100 lines preferred)

### State Management
- Global state is a small external store, `src/state/store.ts`: a `Store` instance
  (created in `src/app/App.tsx`) runs the pure `reducer` in `src/state/reducer.ts`
  and is provided through `StoreContext`.
- Read with `useStore(selector, isEqual?)` (a `useSyncExternalStore` wrapper) so a
  component re-renders only when its slice changes; pass `shallowEqual` when the
  selector returns a fresh object. Dispatch with `useDispatch()`; use
  `useStoreInstance().getState()` inside input handlers to avoid stale closures.
- Derived reads go in `src/state/selectors.ts`; side effects (DB, network, files)
  live in hooks (`src/hooks/`), never in the reducer.

### Error Handling
- Ink owns stdout/stderr: never `console.*` from app code. Diagnostics go to
  `~/.flex-me-in/error.log` via `logError()` (`src/utils/log.ts`, redacts keys);
  the user sees a status message.
- Use try/catch for async operations
- Always catch errors and provide user feedback via status messages
- Use specific error types when possible
- Handle abort signals for cancellable operations
- Example:
  ```typescript
  try {
    const result = await fetchJobs();
  } catch (err) {
    dispatch({ type: 'FETCH_ERROR', source, error: err.message });
  }
  ```

### Database
- Use better-sqlite3 for local SQLite database
- Keep DB operations in `src/db/` directory
- Use prepared statements for parameterized queries

### API Integration
- AI filtering uses DeepSeek (`src/api/deepseek.ts`): `DEEPSEEK_API_KEY` is required
  for it, `DEEPSEEK_MODEL` is optional (default `deepseek-flash`). Env is loaded by
  `src/utils/env.ts` from `~/.flex-me-in/.env`, then `./.env`.
- URLs from feeds are opened only through `openUrl()` (`src/utils/open.ts`), which
  rejects anything that isn't http(s).
- API client code goes in `src/api/`
- Define response types in `src/api/types.ts`
- Handle rate limiting gracefully
- Support abort signals for cancellation

### CSS/Styling
- Use Ink's built-in components (`Box`, `Text`, `Spacer`)
- Define colors and themes in `src/utils/theme.ts`
- Use theme constants rather than hardcoded colors
- Read `colors.*` at render time, never into module-level constants (they would
  not follow a theme change)

### Layout (row budget)
- `src/hooks/useLayout.ts` (`computeLayout`) owns the row budget. Every row outside
  the body (title, tabs, filters, input, pagination, progress, AI panel, snackbar,
  help, status) has a fixed height; `AppContent` pins the body and AI panel to it.
- A chrome row must be exactly one line at any width: use `wrap="truncate-end"`
  and/or shorter labels (`sourceShortLabels`), never let Ink wrap it.
- Measure text with `textWidth`/`truncate`/`wrapText` from `src/utils/format.ts`
  (grapheme- and `string-width`-aware), not `.length`.
- Overlays (popup, help, theme picker) get `bodyRows` as their height.

### Git Conventions
- Write concise commit messages: `feat: add job filtering`, `fix: resolve fetch timeout`
- Use present tense imperative mood
- Reference issues when applicable

## File Organization

```
src/
├── api/           # Job source clients (LinkedIn, Workable, ...) and DeepSeek
├── components/   # React components organized by feature
│   ├── filters/  # Filter UI components
│   ├── jobs/     # Job listing components
│   ├── fetch/    # Fetch progress components
│   └── layout/   # Layout components (StatusBar, TitleBar, etc.)
├── db/           # Database operations and helpers
├── hooks/        # Custom React hooks
├── state/        # Store, reducer, selectors, types
├── utils/        # Utility functions
└── app/          # Main app components
```

## Common Patterns

### Adding a New Job Source
1. Create the client in `src/api/` (e.g., `newsource.ts`) exporting a `FetchFn`
   (`src/api/types.ts`): it takes `(signal, onProgress)` and resolves to a
   `FetchResult` — `{ jobs, complete }`, with `complete: false` when paging stopped
   early so existing rows aren't purged. Run titles through the relevance gate
   (`src/api/relevance.ts`).
2. Add the source to the `Source` type and `ALL_SOURCES` in `src/state/types.ts`.
3. Register the fetcher in `fetcherMap` in `src/hooks/useFetcher.ts`.
4. In `src/utils/theme.ts`, add it to `sourceLabels`, `sourceShortLabels` (2–3
   letters; used when the tab and progress rows are narrow) and `updateSourceColors`.
5. Add a tab key to `TAB_KEYS` in `src/hooks/useKeyboardHandler.ts`, and update the
   `1-N source tab` entry in `KEY_BINDINGS` (`src/components/layout/HelpText.tsx`).
6. Update the README's source table, then check `npm test` (the layout test catches
   a tab or progress row that no longer fits on one line).

### Adding New State
1. Define type in `src/state/types.ts`
2. Add action type to `Action` union
3. Implement reducer case in `src/state/reducer.ts`
4. Read it in components with `useStore((s) => s.field)`; dispatch with `useDispatch()`

### Working with Themes
- Theme definitions in `src/utils/theme.ts`; the active id is `state.themeId`
- `applyTheme(id)` switches in memory; `setTheme(id)` also persists it to
  `~/.flex-me-in/config.json` (called from the keyboard handler, never on import)
- Colors accessed via the `colors` getters; source colors are contrast-adjusted
  against the theme background by `ensureContrast`
