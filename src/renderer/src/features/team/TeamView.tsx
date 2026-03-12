/**
 * TeamView Component
 *
 * Main content area displaying the team's agents in a grid.
 * Single team mode - shows directory selection when no team exists.
 */

import { useTeams } from '../../contexts/TeamsContext';
import { AgentGrid } from './AgentGrid';
import { TeamInput } from './TeamInput';
import type { AgentStatus } from '../../../../shared/types';
import { isActiveStatus, getTeamStatusStyle } from '../../utils/statusHelpers';

export function TeamView() {
  const { activeTeam } = useTeams();

  if (!activeTeam) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <div className="text-5xl mb-4">🤖</div>
          <div className="text-slate-400 text-base mb-2">팀을 선택하거나</div>
          <div className="text-slate-500 text-sm">
            사이드바의 <span className="text-blue-400 font-medium">팀장 호출</span> 버튼으로 새 팀을 시작하세요
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
  return (
    <span className={`px-2 py-1 rounded-full border text-xs ${getTeamStatusStyle(status)}`}>
      {status}
    </span>
  );
}

interface StopButtonAgent {
  id: string;
  status: AgentStatus;
}

function StopButton({ teamId, agents }: { teamId: string; agents: StopButtonAgent[] }) {
  const { stopAllAgents } = useTeams();
  // Show stop button if any agent is processing
  const isAnyAgentProcessing = agents.some((agent) => isActiveStatus(agent.status));

  if (!isAnyAgentProcessing) {
    return null;
  }

  const handleStop = () => {
    stopAllAgents(teamId);
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
