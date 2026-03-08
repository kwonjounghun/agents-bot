/**
 * TeamView Component
 *
 * Main content area displaying the selected team's agents in a grid.
 */

import { useTeams } from '../../contexts/TeamsContext';
import { AgentGrid } from './AgentGrid';
import { TeamInput } from './TeamInput';
import type { AgentStatus } from '../../../../shared/types';

export function TeamView() {
  const { activeTeam } = useTeams();

  if (!activeTeam) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <div className="text-6xl mb-4">🤖</div>
          <div className="text-slate-400 text-lg">No team selected</div>
          <div className="text-slate-500 text-sm mt-2">
            Create a new team or select an existing one
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-slate-900 h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-700 bg-slate-800/50">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-white font-medium">{activeTeam.name}</h2>
            <div className="text-slate-400 text-xs truncate max-w-md">
              {activeTeam.workingDirectory}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={activeTeam.status} />
            <span className="text-slate-400 text-sm">
              {activeTeam.agents.length} agent{activeTeam.agents.length !== 1 ? 's' : ''}
            </span>
            <StopButton teamId={activeTeam.id} agents={activeTeam.agents} />
          </div>
        </div>
      </div>

      {/* Agent Grid */}
      <div className="flex-1 overflow-hidden">
        <AgentGrid agents={activeTeam.agents} />
      </div>

      {/* Input Area */}
      <div className="border-t border-slate-700">
        <TeamInput teamId={activeTeam.id} leaderId={activeTeam.leaderId} />
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const getStatusStyle = () => {
    switch (status) {
      case 'active':
        return 'bg-green-900/30 border-green-700/50 text-green-400';
      case 'complete':
        return 'bg-blue-900/30 border-blue-700/50 text-blue-400';
      default:
        return 'bg-slate-700/30 border-slate-600/50 text-slate-400';
    }
  };

  return (
    <span className={`px-2 py-1 rounded-full border text-xs ${getStatusStyle()}`}>
      {status}
    </span>
  );
}

interface StopButtonAgent {
  id: string;
  status: AgentStatus;
}

function StopButton({ teamId, agents }: { teamId: string; agents: StopButtonAgent[] }) {
  // Show stop button if any agent is processing
  const isAnyAgentProcessing = agents.some(
    (agent) =>
      agent.status === 'thinking' ||
      agent.status === 'responding' ||
      agent.status === 'using_tool'
  );

  if (!isAnyAgentProcessing) {
    return null;
  }

  const handleStop = () => {
    window.teamAPI?.stopAllAgents(teamId);
  };

  return (
    <button
      onClick={handleStop}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-md transition-colors"
      title="Stop all agents"
    >
      <svg
        className="w-4 h-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <rect x="6" y="6" width="12" height="12" rx="1" strokeWidth="2" />
      </svg>
      Stop
    </button>
  );
}
