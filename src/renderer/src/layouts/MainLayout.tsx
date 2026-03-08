/**
 * MainLayout Component
 *
 * Main application layout with sidebar and content area.
 */

import React from 'react';
import { Sidebar } from '../features/sidebar/Sidebar';
import { TeamView } from '../features/team/TeamView';

export function MainLayout() {
  return (
    <div className="flex h-screen bg-slate-900 overflow-hidden">
      {/* Left Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <TeamView />
    </div>
  );
}
