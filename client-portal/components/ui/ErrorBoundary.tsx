'use client';

import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown): State {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred.';
    return { hasError: true, message };
  }

  override componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    // Log to console in development — swap for error reporting service in production
    if (process.env['NODE_ENV'] === 'development') {
      console.error('[ErrorBoundary]', error, info.componentStack);
    }
  }

  reset = () => {
    this.setState({ hasError: false, message: '' });
  };

  override render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mb-4">
            <AlertTriangle className="w-7 h-7 text-red-500" />
          </div>
          <h2 className="text-gray-900 font-semibold text-base mb-1">Something went wrong</h2>
          <p className="text-gray-500 text-sm max-w-sm mb-6">{this.state.message}</p>
          <button
            onClick={this.reset}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition"
          >
            <RefreshCw className="w-4 h-4" />
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
