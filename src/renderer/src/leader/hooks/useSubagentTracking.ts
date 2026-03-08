/**
 * useSubagentTracking Hook
 *
 * Business Logic Layer for tracking sub-agent statuses.
 * Manages the list of active sub-agents and their states.
 */

import { useState, useCallback } from 'react';
import type { AgentRole, AgentStatus, SubAgentInfo } from '../../shared';

export interface UseSubagentTrackingReturn {
  subAgents: SubAgentInfo[];
  addSubAgent: (agentId: string, role: AgentRole) => void;
  removeSubAgent: (agentId: string) => void;
  updateSubAgentStatus: (agentId: string, role: AgentRole, status: AgentStatus) => void;
  clearSubAgents: () => void;
}

/**
 * Hook for tracking sub-agent statuses
 */
export function useSubagentTracking(): UseSubagentTrackingReturn {
  const [subAgents, setSubAgents] = useState<SubAgentInfo[]>([]);

  const addSubAgent = useCallback((agentId: string, role: AgentRole) => {
    setSubAgents((prev) => {
      // Don't add if already exists
      if (prev.find((a) => a.agentId === agentId)) {
        return prev;
      }
      return [...prev, { agentId, role, status: 'idle' }];
    });
  }, []);

  const removeSubAgent = useCallback((agentId: string) => {
    setSubAgents((prev) => prev.filter((a) => a.agentId !== agentId));
  }, []);

  const updateSubAgentStatus = useCallback((agentId: string, role: AgentRole, status: AgentStatus) => {
    setSubAgents((prev) => {
      const existing = prev.find((a) => a.agentId === agentId);
      if (existing) {
        return prev.map((a) => (a.agentId === agentId ? { ...a, role, status } : a));
      }
      // Add new agent if not exists
      return [...prev, { agentId, role, status }];
    });
  }, []);

  const clearSubAgents = useCallback(() => {
    setSubAgents([]);
  }, []);

  return {
    subAgents,
    addSubAgent,
    removeSubAgent,
    updateSubAgentStatus,
    clearSubAgents
  };
}

export default useSubagentTracking;
