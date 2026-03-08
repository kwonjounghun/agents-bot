/**
 * App Component
 *
 * Root application component with TeamsProvider and MainLayout.
 * New multi-team architecture replacing floating widgets.
 */

import React from 'react';
import { TeamsProvider } from './contexts/TeamsContext';
import { MainLayout } from './layouts/MainLayout';

function App() {
  return (
    <TeamsProvider>
      <MainLayout />
    </TeamsProvider>
  );
}

export default App;
