'use client';

import type { CSSProperties, ReactNode } from 'react';
import { ErrorBoundary } from '../ui/ErrorBoundary';

interface ServiceShellLayoutProps {
  sidebar: ReactNode;
  sidebarOpen: boolean;
  topBar: ReactNode;
  children: ReactNode;
  mainClassName?: string;
  /** Optional root styles (e.g. tenant --cloud-accent CSS variables). */
  style?: CSSProperties;
}

export function ServiceShellLayout({
  sidebar,
  sidebarOpen,
  topBar,
  children,
  mainClassName = 'p-6 lg:p-8',
  style,
}: ServiceShellLayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50" style={style}>
      {sidebar}

      <div
        className={`min-h-screen transition-all duration-300 ${
          sidebarOpen ? 'lg:ml-60' : 'lg:ml-0'
        }`}
      >
        {topBar}
        <main className={mainClassName}>
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
