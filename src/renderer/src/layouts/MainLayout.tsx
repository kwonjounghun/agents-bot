/**
 * MainLayout Component
 *
 * Main application layout with single team view.
 */

import React from 'react';
import { TeamView } from '../features/team/TeamView';
import { Sidebar } from '../components/Sidebar';

export function MainLayout() {
  return (
    <div className="flex h-screen bg-slate-900 overflow-hidden">
      <Sidebar />
      <TeamView />
    </div>
  );
}
