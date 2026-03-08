/**
 * MainLayout Component
 *
 * Main application layout with single team view.
 */

import React from 'react';
import { TeamView } from '../features/team/TeamView';

export function MainLayout() {
  return (
    <div className="flex h-screen bg-slate-900 overflow-hidden">
      {/* Main Content - Full width without sidebar */}
      <TeamView />
    </div>
  );
}
