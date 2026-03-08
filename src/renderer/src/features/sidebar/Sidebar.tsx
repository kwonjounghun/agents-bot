/**
 * Sidebar Component
 *
 * Left sidebar containing team list and create team button.
 */

import React from 'react';
import { TeamList } from './TeamList';
import { CreateTeamButton } from './CreateTeamButton';

export function Sidebar() {
  return (
    <div className="w-64 bg-slate-800 border-r border-slate-700 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <span className="text-xl">🤖</span>
          <h1 className="text-white font-semibold">Agent Teams</h1>
        </div>
      </div>

      {/* Team List */}
      <div className="flex-1 overflow-y-auto">
        <TeamList />
      </div>

      {/* Create Team Button */}
      <div className="p-3 border-t border-slate-700">
        <CreateTeamButton />
      </div>
    </div>
  );
}
