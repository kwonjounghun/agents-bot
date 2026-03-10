/**
 * Team Manager
 *
 * Manages multiple teams, each consisting of a leader agent and sub-agents.
 * Replaces LeaderAgentManager and WidgetManager with a unified state management.
 */

import { EventEmitter } from 'events';
import { BrowserWindow } from 'electron';
import type { AgentRole, AgentStatus, AgentMessage } from '../../shared/types';

export interface AgentInfo {
  id: string;
  role: AgentRole;
  isLeader: boolean;
  parentToolUseId?: string;
  status: AgentStatus;
  messages: AgentMessage[];
}

export interface Team {
  id: string;
  name: string;
  workingDirectory: string;
  leaderId: string;
  agents: Map<string, AgentInfo>;
  status: 'idle' | 'active' | 'complete';
  createdAt: number;
  /** Whether a conversation has been started in this session */
  hasConversationStarted: boolean;
}

export interface TeamManagerEvents {
  teamCreated: Team;
  teamDeleted: { teamId: string };
  teamStatusChanged: { teamId: string; status: Team['status'] };
  agentAdded: { teamId: string; agent: AgentInfo };
  agentRemoved: { teamId: string; agentId: string };
  agentStatusChanged: { teamId: string; agentId: string; status: AgentStatus };
  agentMessage: { teamId: string; agentId: string; message: AgentMessage };
  commandReceived: { teamId: string; command: string; workingDirectory: string; shouldContinue: boolean };
}

export class TeamManager extends EventEmitter {
  private teams: Map<string, Team> = new Map();
  private activeTeamId: string | null = null;
  private mainWindow: BrowserWindow | null = null;

  constructor() {
    super();
  }

  /**
   * Set the main window for IPC communication
   */
  setMainWindow(window: BrowserWindow | null): void {
    this.mainWindow = window;
  }

  /**
   * Send data to renderer via IPC
   */
  private sendToRenderer(channel: string, data: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  /**
   * Create a new team
   */
  createTeam(workingDirectory: string): Team {
    const teamId = `team-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    const leaderId = `leader-${teamId}`;

    // Create leader agent
    const leader: AgentInfo = {
      id: leaderId,
      role: 'leader',
      isLeader: true,
      status: 'idle',
      messages: [],
    };

    const team: Team = {
      id: teamId,
      name: this.generateTeamName(workingDirectory),
      workingDirectory,
      leaderId,
      agents: new Map([[leaderId, leader]]),
      status: 'idle',
      createdAt: Date.now(),
      hasConversationStarted: false,
    };

    this.teams.set(teamId, team);

    // Set as active if no active team
    if (!this.activeTeamId) {
      this.activeTeamId = teamId;
    }

    console.log('[TeamManager] Team created:', teamId, workingDirectory);

    // Emit events
    this.emit('teamCreated', team);
    this.sendToRenderer('team:created', this.serializeTeam(team));

    return team;
  }

  /**
   * Generate a team name from working directory
   */
  private generateTeamName(workingDirectory: string): string {
    const parts = workingDirectory.split('/');
    return parts[parts.length - 1] || 'Team';
  }

  /**
   * Get a team by ID
   */
  getTeam(teamId: string): Team | undefined {
    return this.teams.get(teamId);
  }

  /**
   * Get all teams
   */
  getAllTeams(): Team[] {
    return Array.from(this.teams.values());
  }

  /**
   * Get active team
   */
  getActiveTeam(): Team | undefined {
    if (!this.activeTeamId) return undefined;
    return this.teams.get(this.activeTeamId);
  }

  /**
   * Get active team ID
   */
  getActiveTeamId(): string | null {
    return this.activeTeamId;
  }

  /**
   * Set active team
   */
  setActiveTeam(teamId: string): boolean {
    if (!this.teams.has(teamId)) {
      console.warn('[TeamManager] Team not found:', teamId);
      return false;
    }

    this.activeTeamId = teamId;
    console.log('[TeamManager] Active team set:', teamId);
    this.sendToRenderer('team:active-changed', { teamId });
    return true;
  }

  /**
   * Update team status
   */
  updateTeamStatus(teamId: string, status: Team['status']): void {
    const team = this.teams.get(teamId);
    if (!team) return;

    team.status = status;
    this.emit('teamStatusChanged', { teamId, status });
    this.sendToRenderer('team:status-changed', { teamId, status });
  }

  /**
   * Add an agent to a team
   */
  addAgent(teamId: string, agentInfo: Omit<AgentInfo, 'messages'>): AgentInfo | undefined {
    const team = this.teams.get(teamId);
    if (!team) {
      console.warn('[TeamManager] Team not found for adding agent:', teamId);
      return undefined;
    }

    // Check if agent already exists
    if (team.agents.has(agentInfo.id)) {
      console.log('[TeamManager] Agent already exists:', agentInfo.id);
      return team.agents.get(agentInfo.id);
    }

    const agent: AgentInfo = {
      ...agentInfo,
      messages: [],
    };

    team.agents.set(agent.id, agent);
    console.log('[TeamManager] Agent added:', agent.id, agent.role, 'to team:', teamId);

    // Update team status to active
    if (team.status === 'idle') {
      this.updateTeamStatus(teamId, 'active');
    }

    this.emit('agentAdded', { teamId, agent });
    this.sendToRenderer('team:agent-added', { teamId, agent: this.serializeAgent(agent) });

    return agent;
  }

  /**
   * Update agent status
   */
  updateAgentStatus(teamId: string, agentId: string, status: AgentStatus): void {
    const team = this.teams.get(teamId);
    if (!team) return;

    const agent = team.agents.get(agentId);
    if (!agent) return;

    agent.status = status;
    this.emit('agentStatusChanged', { teamId, agentId, status });
    this.sendToRenderer('team:agent-status', { teamId, agentId, status });
  }

  // Maximum number of messages per agent to prevent memory leaks
  private static readonly MAX_MESSAGES_PER_AGENT = 200;

  /**
   * Add a message to an agent
   * Messages are capped to prevent unbounded memory growth during long sessions
   */
  addAgentMessage(teamId: string, agentId: string, message: AgentMessage): void {
    const team = this.teams.get(teamId);
    if (!team) return;

    const agent = team.agents.get(agentId);
    if (!agent) return;

    agent.messages.push(message);

    // Cap message array to prevent memory leaks
    if (agent.messages.length > TeamManager.MAX_MESSAGES_PER_AGENT) {
      const removed = agent.messages.splice(0, agent.messages.length - TeamManager.MAX_MESSAGES_PER_AGENT);
      console.log(`[TeamManager] Pruned ${removed.length} old messages for agent ${agentId}`);
    }

    this.emit('agentMessage', { teamId, agentId, message });
    this.sendToRenderer('team:agent-message', { teamId, agentId, message });
  }

  /**
   * Update the last message of an agent (for streaming)
   */
  updateLastAgentMessage(teamId: string, agentId: string, content: string): void {
    const team = this.teams.get(teamId);
    if (!team) return;

    const agent = team.agents.get(agentId);
    if (!agent || agent.messages.length === 0) return;

    const lastMessage = agent.messages[agent.messages.length - 1];
    lastMessage.content = content;
    lastMessage.isStreaming = true;

    this.sendToRenderer('team:agent-message-update', {
      teamId,
      agentId,
      messageId: lastMessage.id,
      content,
      isStreaming: true
    });
  }

  /**
   * Remove an agent from a team
   */
  removeAgent(teamId: string, agentId: string): void {
    const team = this.teams.get(teamId);
    if (!team) return;

    // Don't remove leader
    if (agentId === team.leaderId) {
      console.warn('[TeamManager] Cannot remove leader agent');
      return;
    }

    if (team.agents.delete(agentId)) {
      console.log('[TeamManager] Agent removed:', agentId, 'from team:', teamId);
      this.emit('agentRemoved', { teamId, agentId });
      this.sendToRenderer('team:agent-removed', { teamId, agentId });
    }
  }

  /**
   * Delete a team
   */
  deleteTeam(teamId: string): boolean {
    const team = this.teams.get(teamId);
    if (!team) return false;

    // If deleting active team, switch to another
    if (this.activeTeamId === teamId) {
      const otherTeam = Array.from(this.teams.values()).find(t => t.id !== teamId);
      this.activeTeamId = otherTeam?.id || null;
    }

    this.teams.delete(teamId);
    console.log('[TeamManager] Team deleted:', teamId);

    this.emit('teamDeleted', { teamId });
    this.sendToRenderer('team:deleted', { teamId });

    return true;
  }

  /**
   * Find team by agent ID
   */
  findTeamByAgentId(agentId: string): Team | undefined {
    for (const team of this.teams.values()) {
      if (team.agents.has(agentId)) {
        return team;
      }
    }
    return undefined;
  }

  /**
   * Find agent by tool use ID
   */
  findAgentByToolUseId(toolUseId: string): { team: Team; agent: AgentInfo } | undefined {
    for (const team of this.teams.values()) {
      for (const agent of team.agents.values()) {
        if (agent.parentToolUseId === toolUseId) {
          return { team, agent };
        }
      }
    }
    return undefined;
  }

  /**
   * Handle command from renderer
   */
  handleCommand(teamId: string, command: string): void {
    const team = this.teams.get(teamId);
    if (!team) {
      console.warn('[TeamManager] Team not found for command:', teamId);
      return;
    }

    // Update leader status
    const leader = team.agents.get(team.leaderId);
    if (leader) {
      leader.status = 'thinking';
      this.sendToRenderer('team:agent-status', {
        teamId,
        agentId: team.leaderId,
        status: 'thinking'
      });
    }

    // Set as active team
    this.setActiveTeam(teamId);

    // Determine if we should continue existing conversation
    // Only continue if conversation has already started in this session
    const shouldContinue = team.hasConversationStarted;

    // Mark conversation as started for subsequent commands
    if (!team.hasConversationStarted) {
      team.hasConversationStarted = true;
      console.log('[TeamManager] Starting new conversation for team:', teamId);
    } else {
      console.log('[TeamManager] Continuing existing conversation for team:', teamId);
    }

    // Emit command event for main process to handle
    this.emit('commandReceived', {
      teamId,
      command,
      workingDirectory: team.workingDirectory,
      shouldContinue,
    });
  }

  /**
   * Check if any team exists
   */
  hasTeams(): boolean {
    return this.teams.size > 0;
  }

  /**
   * Get team count
   */
  getTeamCount(): number {
    return this.teams.size;
  }

  /**
   * Clear all teams
   */
  clearAll(): void {
    this.teams.clear();
    this.activeTeamId = null;
    this.sendToRenderer('team:all-cleared', {});
  }

  /**
   * Serialize team for IPC (convert Map to array)
   */
  private serializeTeam(team: Team): Record<string, unknown> {
    return {
      id: team.id,
      name: team.name,
      workingDirectory: team.workingDirectory,
      leaderId: team.leaderId,
      agents: Array.from(team.agents.values()).map(a => this.serializeAgent(a)),
      status: team.status,
      createdAt: team.createdAt,
    };
  }

  /**
   * Serialize agent for IPC
   */
  private serializeAgent(agent: AgentInfo): Record<string, unknown> {
    return {
      id: agent.id,
      role: agent.role,
      isLeader: agent.isLeader,
      status: agent.status,
      messages: agent.messages,
    };
  }

  /**
   * Get serialized teams for IPC
   */
  getSerializedTeams(): Record<string, unknown>[] {
    return this.getAllTeams().map(t => this.serializeTeam(t));
  }
}

export function createTeamManager(): TeamManager {
  return new TeamManager();
}
