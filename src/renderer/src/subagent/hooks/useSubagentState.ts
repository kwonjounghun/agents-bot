/**
 * useSubagentState Hook
 *
 * Business Logic Layer for sub-agent state management.
 * Manages agent identity, status, and derived state.
 */

import { useState, useCallback, useMemo } from 'react';
import type { AgentRole, AgentStatus } from '../../shared';
import { getStatusText, getStatusColorClass, isActiveStatus } from '../../shared';

export interface SubagentState {
  agentId: string;
  role: AgentRole;
  status: AgentStatus;
}

export interface SubagentDerivedState {
  isActive: boolean;
  statusText: string;
  statusColorClass: string;
}

export interface UseSubagentStateReturn {
  state: SubagentState;
  derived: SubagentDerivedState;
  setAgentId: (id: string) => void;
  setRole: (role: AgentRole) => void;
  setStatus: (status: AgentStatus) => void;
}

/**
 * Hook for managing sub-agent state
 */
export function useSubagentState(
  initialAgentId: string = '',
  initialRole: AgentRole = 'executor'
): UseSubagentStateReturn {
  const [agentId, setAgentId] = useState(initialAgentId);
  const [role, setRole] = useState<AgentRole>(initialRole);
  const [status, setStatus] = useState<AgentStatus>('idle');

  const state: SubagentState = useMemo(
    () => ({
      agentId,
      role,
      status
    }),
    [agentId, role, status]
  );

  const derived: SubagentDerivedState = useMemo(
    () => ({
      isActive: isActiveStatus(status),
      statusText: getStatusText(status),
      statusColorClass: getStatusColorClass(status)
    }),
    [status]
  );

  const handleSetAgentId = useCallback((id: string) => {
    setAgentId(id);
  }, []);

  const handleSetRole = useCallback((newRole: AgentRole) => {
    setRole(newRole);
  }, []);

  const handleSetStatus = useCallback((newStatus: AgentStatus) => {
    setStatus(newStatus);
  }, []);

  return {
    state,
    derived,
    setAgentId: handleSetAgentId,
    setRole: handleSetRole,
    setStatus: handleSetStatus
  };
}

export default useSubagentState;
