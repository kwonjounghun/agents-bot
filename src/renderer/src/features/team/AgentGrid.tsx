/**
 * AgentGrid Component
 *
 * Displays agents in a responsive grid layout.
 */

import React from 'react';
import { Agent } from '../../contexts/TeamsContext';
import { AgentPanel } from './AgentPanel';
import { useGridLayout } from '../../hooks/useGridLayout';

interface AgentGridProps {
  agents: Agent[];
}

export function AgentGrid({ agents }: AgentGridProps) {
  const layout = useGridLayout(agents.length);

  if (agents.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center text-slate-500">
          <div className="text-4xl mb-2">💬</div>
          <div>Enter a command to start</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="h-full p-4 gap-4"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
        gridTemplateRows: `repeat(${layout.rows}, 1fr)`,
      }}
    >
      {agents.map(agent => (
        <AgentPanel key={agent.id} agent={agent} />
      ))}
    </div>
  );
}
