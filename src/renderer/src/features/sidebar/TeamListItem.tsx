/**
 * TeamListItem Component
 *
 * Individual team item in the sidebar list.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { useTeams, Team } from '../../contexts/TeamsContext';

interface TeamListItemProps {
  team: Team;
}

export function TeamListItem({ team }: TeamListItemProps) {
  const { state, setActiveTeam, deleteTeam } = useTeams();
  const isActive = state.activeTeamId === team.id;

  const handleClick = () => {
    setActiveTeam(team.id);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    deleteTeam(team.id);
  };

  const getStatusColor = () => {
    switch (team.status) {
      case 'active': return 'bg-green-500';
      case 'complete': return 'bg-blue-500';
      default: return 'bg-slate-500';
    }
  };

  const agentCount = team.agents.length;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className={`
        group relative p-3 rounded-lg cursor-pointer transition-colors
        ${isActive
          ? 'bg-slate-700 border border-slate-600'
          : 'hover:bg-slate-700/50 border border-transparent'
        }
      `}
      onClick={handleClick}
    >
      <div className="flex items-center gap-2">
        {/* Status indicator */}
        <div className={`w-2 h-2 rounded-full ${getStatusColor()} ${team.status === 'active' ? 'animate-pulse' : ''}`} />

        {/* Team info */}
        <div className="flex-1 min-w-0">
          <div className="text-white text-sm font-medium truncate">
            {team.name}
          </div>
          <div className="text-slate-400 text-xs truncate">
            {agentCount} agent{agentCount !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Delete button */}
        <button
          onClick={handleDelete}
          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-slate-600 text-slate-400 hover:text-red-400 transition-all"
          title="Delete team"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </motion.div>
  );
}
