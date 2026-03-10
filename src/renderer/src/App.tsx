/**
 * App Component
 *
 * Root application component with TeamsProvider and MainLayout.
 * New multi-team architecture replacing floating widgets.
 */

import React, { useEffect } from 'react';
import { TeamsProvider } from './contexts/TeamsContext';
import { MainLayout } from './layouts/MainLayout';
import { ErrorBoundary } from './components/ErrorBoundary';

function App() {
  useEffect(() => {
    window.claudeAPI?.notifyReady();
  }, []);

  return (
    <ErrorBoundary>
      <TeamsProvider>
        <MainLayout />
      </TeamsProvider>
    </ErrorBoundary>
  );
}

export default App;
