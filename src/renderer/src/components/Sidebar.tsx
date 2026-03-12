/**
 * Sidebar Component
 *
 * Displays team list and provides team creation via "팀장 호출" button.
 */

import { useState } from 'react';
import { useTeams } from '../contexts/TeamsContext';
import type { Team } from '../contexts/TeamsContext';

function getProjectName(workingDirectory: string): string {
  return workingDirectory.split('/').filter(Boolean).pop() || workingDirectory;
}

function TeamStatusDot({ status }: { status: Team['status'] }) {
  if (status === 'active') {
    return <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse flex-shrink-0" />;
  }
  if (status === 'complete') {
    return <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />;
  }
  return <span className="w-2 h-2 rounded-full bg-slate-500 flex-shrink-0" />;
}

function TeamItem({
  team,
  isActive,
  onSelect,
  onDelete,
}: {
  team: Team;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className={`
        group relative flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer
        transition-all duration-150
        ${isActive
          ? 'bg-slate-700 border border-slate-600'
          : 'hover:bg-slate-700/50 border border-transparent'
        }
      `}
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Active indicator bar */}
      {isActive && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-blue-400 rounded-r" />
      )}

      <TeamStatusDot status={team.status} />

      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium truncate ${isActive ? 'text-white' : 'text-slate-300'}`}>
          {getProjectName(team.workingDirectory)}
        </div>
        {team.agents.length > 0 && (
          <div className="text-xs text-slate-500">
            {team.agents.length} agent{team.agents.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Delete button */}
      {hovered && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-slate-500 hover:text-red-400 hover:bg-slate-600 transition-colors"
          title="팀 삭제"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

export function Sidebar() {
  const { state, activeTeam, createTeam, deleteTeam, setActiveTeam } = useTeams();
  const [isCreating, setIsCreating] = useState(false);

  const teams = Array.from(state.teams.values()).sort((a, b) => a.createdAt - b.createdAt);

  const handleCallLeader = async () => {
    setIsCreating(true);
    try {
      const directory = await window.teamAPI?.selectDirectory();
      if (directory) {
        await createTeam(directory);
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteTeam = async (teamId: string) => {
    await deleteTeam(teamId);
  };

  return (
    <div className="flex flex-col w-52 flex-shrink-0 bg-slate-800 border-r border-slate-700 h-full">
      {/* Header */}
      <div className="px-4 py-4 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <span className="text-lg">🤖</span>
          <span className="text-white font-semibold text-sm">Agent Teams</span>
        </div>
      </div>

      {/* Team List */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        {teams.length === 0 ? (
          <div className="px-2 py-3 text-xs text-slate-500 text-center">
            팀이 없습니다
          </div>
        ) : (
          teams.map((team) => (
            <TeamItem
              key={team.id}
              team={team}
              isActive={team.id === activeTeam?.id}
              onSelect={() => setActiveTeam(team.id)}
              onDelete={() => handleDeleteTeam(team.id)}
            />
          ))
        )}
      </div>

      {/* Call Leader Button */}
      <div className="px-3 py-3 border-t border-slate-700">
        <button
          onClick={handleCallLeader}
          disabled={isCreating}
          className={`
            w-full flex items-center justify-center gap-2
            px-3 py-2.5 rounded-lg text-sm font-medium
            bg-gradient-to-r from-blue-500 to-purple-500 text-white
            hover:from-blue-600 hover:to-purple-600
            transition-all shadow-lg shadow-blue-500/20
            ${isCreating ? 'opacity-60 cursor-wait' : ''}
          `}
        >
          {isCreating ? (
            <>
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span>불러오는 중...</span>
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>팀장 호출</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
