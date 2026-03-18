# Agent Guidelines for fe-hunt

This is a Terminal User Interface (TUI) application built with React, Ink, and TypeScript. It aggregates job listings from multiple remote job boards for senior frontend developer roles.

## Project Overview

- **Framework**: React + Ink (terminal UI)
- **Language**: TypeScript (strict mode)
- **Module System**: ESM (NodeNext)
- **Build Tool**: tsup
- **Runtime**: Node.js

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
**No test framework is currently configured.** If adding tests:
- Use Vitest for unit tests
- Use React Testing Library for component tests
- Run single test: `npx vitest run --testNamePattern="test name"`

### Type Checking
```bash
npx tsc --noEmit    # Run TypeScript type checker
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
- Use React Context for global app state (see `src/state/context.ts`)
- Use `useReducer` for complex state logic (see `src/state/reducer.ts`)
- Use custom hooks for reusable stateful logic (`src/hooks/`)

### Error Handling
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
- API client code goes in `src/api/`
- Define response types in `src/api/types.ts`
- Handle rate limiting gracefully
- Support abort signals for cancellation

### CSS/Styling
- Use Ink's built-in components (`Box`, `Text`, `Spacer`)
- Define colors and themes in `src/utils/theme.ts`
- Use theme constants rather than hardcoded colors

### Git Conventions
- Write concise commit messages: `feat: add job filtering`, `fix: resolve fetch timeout`
- Use present tense imperative mood
- Reference issues when applicable

## File Organization

```
src/
├── api/           # External API clients (ArbeitNow, Remotive, etc.)
├── components/   # React components organized by feature
│   ├── filters/  # Filter UI components
│   ├── jobs/     # Job listing components
│   ├── fetch/    # Fetch progress components
│   └── layout/   # Layout components (StatusBar, TitleBar, etc.)
├── db/           # Database operations and helpers
├── hooks/        # Custom React hooks
├── state/        # State management (reducer, context, types)
├── utils/        # Utility functions
└── app/          # Main app components
```

## Common Patterns

### Adding a New Job Source
1. Create API client in `src/api/` (e.g., `newsource.ts`)
2. Implement fetch function returning `Job[]`
3. Add source to `Source` type in `src/state/types.ts`
4. Add to `ALL_SOURCES` array in `src/state/types.ts`

### Adding New State
1. Define type in `src/state/types.ts`
2. Add action type to `Action` union
3. Implement reducer case in `src/state/reducer.ts`
4. Use in components via `useContext(AppContext)`

### Working with Themes
- Theme definitions in `src/utils/theme.ts`
- Apply via `useApp()` hook which provides `state.themeId`
- Colors accessed via `colors` object from theme utilities
