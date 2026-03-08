/**
 * TeamList Component
 *
 * Displays list of all teams in the sidebar.
 */

import React from 'react';
import { useTeams } from '../../contexts/TeamsContext';
import { TeamListItem } from './TeamListItem';

export function TeamList() {
  const { state } = useTeams();
  const teams = Array.from(state.teams.values());

  if (teams.length === 0) {
    return (
      <div className="p-4 text-center">
        <div className="text-slate-500 text-sm">No teams yet</div>
        <div className="text-slate-600 text-xs mt-1">
          Click "팀장 호출" to create a team
        </div>
      </div>
    );
  }

  return (
    <div className="p-2 space-y-1">
      {teams.map(team => (
        <TeamListItem key={team.id} team={team} />
      ))}
    </div>
  );
}
