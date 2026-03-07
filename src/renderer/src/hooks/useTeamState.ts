/**
 * useTeamState Hook
 * Single Responsibility: Manage team agent state
 *
 * This hook tracks active team agents and provides actions
 * for managing the team.
 *
 * Usage:
 *   const [teamState, teamActions] = useTeamState();
 *   teamActions.addAgent({ id: 'agent-1', role: 'executor' });
 *   teamActions.closeTeam();
 */

import { useState, useCallback, useMemo } from 'react';
import type { AgentRole } from '../../../shared/types';

export interface TeamAgent {
  id: string;
  role: AgentRole;
}

export interface TeamState {
  isActive: boolean;
  agents: TeamAgent[];
}

export interface TeamActions {
  /**
   * Add an agent to the team.
   */
  addAgent(agent: TeamAgent): void;

  /**
   * Remove an agent from the team.
   */
  removeAgent(agentId: string): void;

  /**
   * Clear all agents.
   */
  clear(): void;

  /**
   * Close the team and clear all widgets.
   */
  closeTeam(): void;

  /**
   * Set team active state.
   */
  setActive(active: boolean): void;
}

/**
 * Hook for managing team state.
 *
 * @returns Tuple of [state, actions]
 */
export function useTeamState(): [TeamState, TeamActions] {
  const [isActive, setIsActive] = useState(false);
  const [agents, setAgents] = useState<TeamAgent[]>([]);

  const addAgent = useCallback((agent: TeamAgent) => {
    setAgents(prev => {
      // Avoid duplicates
      if (prev.find(a => a.id === agent.id)) {
        return prev;
      }
      return [...prev, agent];
    });
    setIsActive(true);
  }, []);

  const removeAgent = useCallback((agentId: string) => {
    setAgents(prev => prev.filter(a => a.id !== agentId));
  }, []);

  const clear = useCallback(() => {
    setAgents([]);
    setIsActive(false);
  }, []);

  const closeTeam = useCallback(() => {
    // Call API to close all widgets
    window.claudeAPI?.closeAllWidgets();
    clear();
  }, [clear]);

  const setActive = useCallback((active: boolean) => {
    setIsActive(active);
  }, []);

  const state: TeamState = useMemo(() => ({
    isActive,
    agents
  }), [isActive, agents]);

  const actions: TeamActions = useMemo(() => ({
    addAgent,
    removeAgent,
    clear,
    closeTeam,
    setActive
  }), [addAgent, removeAgent, clear, closeTeam, setActive]);

  return [state, actions];
}
