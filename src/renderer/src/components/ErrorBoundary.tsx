/**
 * Error Boundary Component
 * Catches JavaScript errors in child component tree and displays fallback UI
 */

import { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          className="p-4 m-4 bg-red-900/30 border border-red-500/50 rounded-lg text-red-200"
          role="alert"
          aria-live="assertive"
        >
          <h2 className="text-sm font-medium mb-2 flex items-center gap-2">
            <span aria-hidden="true">⚠️</span>
            Something went wrong
          </h2>
          <p className="text-xs opacity-80 mb-3">
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button
            onClick={this.handleRetry}
            className="px-3 py-1.5 text-xs bg-red-500/30 hover:bg-red-500/50 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-red-500/50"
            aria-label="Try again"
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
