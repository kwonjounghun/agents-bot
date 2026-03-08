/**
 * App Component
 *
 * Root application component with TeamsProvider and MainLayout.
 * New multi-team architecture replacing floating widgets.
 */

import React from 'react';
import { TeamsProvider } from './contexts/TeamsContext';
import { MainLayout } from './layouts/MainLayout';
import { ErrorBoundary } from './components/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
      <TeamsProvider>
        <MainLayout />
      </TeamsProvider>
    </ErrorBoundary>
  );
}

export default App;
