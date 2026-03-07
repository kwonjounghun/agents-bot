/**
 * Team State Manager Module
 * Single Responsibility: Manage team agent state and round-robin routing
 *
 * This module handles:
 * - Tracking active team agents
 * - Round-robin agent selection
 * - Time-based agent switching
 *
 * Usage:
 *   const manager = createTeamStateManager({ switchIntervalMs: 3000 });
 *   manager.addAgent({ id: 'agent-1', role: 'executor' });
 *   const current = manager.getCurrentAgent();
 *   manager.switchToNextAgent();
 */

import type { AgentRole } from './agentNormalizer';

export interface TeamAgent {
  id: string;
  role: AgentRole;
}

export interface TeamStateManagerConfig {
  /**
   * Interval in milliseconds before auto-switching agents.
   * Default: 3000ms
   */
  switchIntervalMs?: number;
}

export interface TeamStateManager {
  /**
   * Add an agent to the team.
   */
  addAgent(agent: TeamAgent): void;

  /**
   * Remove an agent from the team by ID.
   */
  removeAgent(agentId: string): void;

  /**
   * Get an agent by ID.
   */
  getAgent(agentId: string): TeamAgent | undefined;

  /**
   * Get the current active agent.
   */
  getCurrentAgent(): TeamAgent | null;

  /**
   * Switch to the next agent (round-robin).
   */
  switchToNextAgent(): void;

  /**
   * Maybe switch to next agent if enough time has passed.
   * @returns true if switched, false otherwise
   */
  maybeSwitchByTime(): boolean;

  /**
   * Get all active agents.
   */
  getAllAgents(): TeamAgent[];

  /**
   * Clear all agents.
   */
  clear(): void;

  /**
   * Get the count of active agents.
   */
  getAgentCount(): number;

  /**
   * Check if a specific agent exists.
   */
  hasAgent(agentId: string): boolean;

  /**
   * Set agents in bulk (replaces existing).
   */
  setAgents(agents: TeamAgent[]): void;

  /**
   * Get the current agent index.
   */
  getCurrentIndex(): number;

  /**
   * Reset the switch timer.
   */
  resetSwitchTimer(): void;
}

const DEFAULT_SWITCH_INTERVAL = 3000;

/**
 * Create a new team state manager.
 *
 * @param config - Configuration options
 * @returns TeamStateManager instance
 */
export function createTeamStateManager(config: TeamStateManagerConfig = {}): TeamStateManager {
  const switchIntervalMs = config.switchIntervalMs ?? DEFAULT_SWITCH_INTERVAL;

  let agents: TeamAgent[] = [];
  let currentIndex = 0;
  let lastSwitchTime = Date.now();

  return {
    addAgent(agent: TeamAgent): void {
      // Avoid duplicates
      if (!agents.find(a => a.id === agent.id)) {
        agents.push(agent);
      }
    },

    removeAgent(agentId: string): void {
      const index = agents.findIndex(a => a.id === agentId);
      if (index !== -1) {
        agents.splice(index, 1);
        // Adjust current index if needed
        if (currentIndex >= agents.length) {
          currentIndex = Math.max(0, agents.length - 1);
        }
      }
    },

    getAgent(agentId: string): TeamAgent | undefined {
      return agents.find(a => a.id === agentId);
    },

    getCurrentAgent(): TeamAgent | null {
      if (agents.length === 0) {
        return null;
      }
      return agents[currentIndex] || null;
    },

    switchToNextAgent(): void {
      if (agents.length === 0) {
        return;
      }
      currentIndex = (currentIndex + 1) % agents.length;
      lastSwitchTime = Date.now();
    },

    maybeSwitchByTime(): boolean {
      const now = Date.now();
      if (now - lastSwitchTime > switchIntervalMs) {
        this.switchToNextAgent();
        return true;
      }
      return false;
    },

    getAllAgents(): TeamAgent[] {
      return [...agents];
    },

    clear(): void {
      agents = [];
      currentIndex = 0;
      lastSwitchTime = Date.now();
    },

    getAgentCount(): number {
      return agents.length;
    },

    hasAgent(agentId: string): boolean {
      return agents.some(a => a.id === agentId);
    },

    setAgents(newAgents: TeamAgent[]): void {
      agents = [...newAgents];
      currentIndex = 0;
      lastSwitchTime = Date.now();
    },

    getCurrentIndex(): number {
      return currentIndex;
    },

    resetSwitchTimer(): void {
      lastSwitchTime = Date.now();
    }
  };
}
