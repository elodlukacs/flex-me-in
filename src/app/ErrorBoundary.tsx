import React, { Component, type ReactNode } from 'react';
import { Text } from 'ink';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Called once with the render/effect error; the app exits through it. */
  onError: (error: Error) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Without this, Ink's own boundary dumped a stack trace into the alternate
 * screen, which is discarded on exit. Here the error is handed to `exit()`, so
 * `waitUntilExit()` rejects and the entry point prints a readable message on
 * the normal screen.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error): void {
    this.props.onError(error);
  }

  override render(): ReactNode {
    if (this.state.error) {
      return <Text color="red">flex-me-in hit an error and is exiting: {this.state.error.message}</Text>;
    }
    return this.props.children;
  }
}
