import { contextBridge, ipcRenderer } from 'electron';
import type { AgentStatus, MessageType, OMCStatusInfo, AgentMessage } from '../shared/types';

// Event types for renderer
interface AgentMessageEvent {
  messageId: string;
  chunk: string;
  fullText: string;
  type: MessageType;
  isComplete: boolean;
}

interface AgentToolUseEvent {
  toolName: string;
  input: string;
}

interface AgentStatusEvent {
  status: AgentStatus;
}

interface AgentErrorEvent {
  error: string;
}

interface AgentResultEvent {
  result: string;
  costUsd: number;
  turns: number;
}

// Team-related types
interface SerializedTeam {
  id: string;
  name: string;
  workingDirectory: string;
  leaderId: string;
  agents: SerializedAgent[];
  status: 'idle' | 'active' | 'complete';
  createdAt: number;
}

interface SerializedAgent {
  id: string;
  role: string;
  isLeader: boolean;
  status: AgentStatus;
  messages: AgentMessage[];
}

interface TeamCreatedEvent {
  id: string;
  name: string;
  workingDirectory: string;
  leaderId: string;
  agents: SerializedAgent[];
  status: string;
  createdAt: number;
}

interface TeamAgentAddedEvent {
  teamId: string;
  agent: SerializedAgent;
}

interface TeamAgentRemovedEvent {
  teamId: string;
  agentId: string;
}

interface TeamAgentStatusEvent {
  teamId: string;
  agentId: string;
  status: AgentStatus;
}

interface TeamAgentMessageEvent {
  teamId: string;
  agentId: string;
  message: AgentMessage;
}

interface TeamInitEvent {
  teams: SerializedTeam[];
  activeTeamId: string | null;
}

// Shared IPC helpers
const selectDirectory = (): Promise<string | null> =>
  ipcRenderer.invoke('dialog:select-directory');

// Expose Claude API to renderer (legacy, for backward compatibility)
contextBridge.exposeInMainWorld('claudeAPI', {
  // Send prompt to Claude
  sendPrompt: (prompt: string, workingDirectory?: string) => {
    ipcRenderer.send('control:send-prompt', { prompt, workingDirectory });
  },

  // Stop current query
  stop: () => {
    ipcRenderer.send('control:stop');
  },

  // Notify window is ready
  notifyReady: () => {
    ipcRenderer.send('window:ready');
  },

  // Directory selection
  selectDirectory,

  getWorkingDirectory: (): Promise<string | null> => {
    return ipcRenderer.invoke('get-working-directory');
  },

  // Event listeners
  onMessage: (callback: (event: AgentMessageEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: AgentMessageEvent) => callback(data);
    ipcRenderer.on('agent:message', handler);
    return () => ipcRenderer.removeListener('agent:message', handler);
  },

  onToolUse: (callback: (event: AgentToolUseEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: AgentToolUseEvent) => callback(data);
    ipcRenderer.on('agent:tool-use', handler);
    return () => ipcRenderer.removeListener('agent:tool-use', handler);
  },

  onStatus: (callback: (event: AgentStatusEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: AgentStatusEvent) => callback(data);
    ipcRenderer.on('agent:status', handler);
    return () => ipcRenderer.removeListener('agent:status', handler);
  },

  onError: (callback: (event: AgentErrorEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: AgentErrorEvent) => callback(data);
    ipcRenderer.on('agent:error', handler);
    return () => ipcRenderer.removeListener('agent:error', handler);
  },

  onResult: (callback: (event: AgentResultEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: AgentResultEvent) => callback(data);
    ipcRenderer.on('agent:result', handler);
    return () => ipcRenderer.removeListener('agent:result', handler);
  },

  // === OMC APIs ===
  getOMCStatus: (workingDirectory?: string): Promise<OMCStatusInfo> => {
    return ipcRenderer.invoke('omc:get-status', workingDirectory);
  },

  initializeOMC: (workingDirectory?: string): Promise<OMCStatusInfo> => {
    return ipcRenderer.invoke('omc:initialize', workingDirectory);
  }
});

// Expose Team API to renderer (new multi-team architecture)
contextBridge.exposeInMainWorld('teamAPI', {
  // === Commands ===

  // Create a new team
  createTeam: (workingDirectory: string): Promise<SerializedTeam | null> => {
    return ipcRenderer.invoke('team:create', workingDirectory);
  },

  // Get all teams
  getAllTeams: (): Promise<SerializedTeam[]> => {
    return ipcRenderer.invoke('team:get-all');
  },

  // Get a specific team
  getTeam: (teamId: string): Promise<SerializedTeam | null> => {
    return ipcRenderer.invoke('team:get', teamId);
  },

  // Set active team
  setActiveTeam: (teamId: string): Promise<boolean> => {
    return ipcRenderer.invoke('team:set-active', teamId);
  },

  // Delete a team
  deleteTeam: (teamId: string): Promise<boolean> => {
    return ipcRenderer.invoke('team:delete', teamId);
  },

  // Send command to a team
  sendCommand: (teamId: string, command: string) => {
    ipcRenderer.send('team:send-command', { teamId, command });
  },

  // Close all teams
  closeAllTeams: () => {
    ipcRenderer.send('team:close-all');
  },

  // Stop all agents (abort current query and cleanup)
  stopAllAgents: (teamId?: string) => {
    ipcRenderer.send('team:stop-all-agents', teamId);
  },

  // Get team count
  getTeamCount: (): Promise<number> => {
    return ipcRenderer.invoke('team:get-count');
  },

  // Select directory (shared implementation)
  selectDirectory,

  // === Event Listeners ===

  // Initial state when window loads
  onInit: (callback: (event: TeamInitEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: TeamInitEvent) => callback(data);
    ipcRenderer.on('team:init', handler);
    return () => ipcRenderer.removeListener('team:init', handler);
  },

  // Team created
  onTeamCreated: (callback: (team: TeamCreatedEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: TeamCreatedEvent) => callback(data);
    ipcRenderer.on('team:created', handler);
    return () => ipcRenderer.removeListener('team:created', handler);
  },

  // Team deleted
  onTeamDeleted: (callback: (data: { teamId: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { teamId: string }) => callback(data);
    ipcRenderer.on('team:deleted', handler);
    return () => ipcRenderer.removeListener('team:deleted', handler);
  },

  // Team status changed
  onTeamStatusChanged: (callback: (data: { teamId: string; status: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { teamId: string; status: string }) => callback(data);
    ipcRenderer.on('team:status-changed', handler);
    return () => ipcRenderer.removeListener('team:status-changed', handler);
  },

  // Active team changed
  onActiveTeamChanged: (callback: (data: { teamId: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { teamId: string }) => callback(data);
    ipcRenderer.on('team:active-changed', handler);
    return () => ipcRenderer.removeListener('team:active-changed', handler);
  },

  // Agent added to team
  onAgentAdded: (callback: (event: TeamAgentAddedEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: TeamAgentAddedEvent) => callback(data);
    ipcRenderer.on('team:agent-added', handler);
    return () => ipcRenderer.removeListener('team:agent-added', handler);
  },

  // Agent removed from team
  onAgentRemoved: (callback: (event: TeamAgentRemovedEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: TeamAgentRemovedEvent) => callback(data);
    ipcRenderer.on('team:agent-removed', handler);
    return () => ipcRenderer.removeListener('team:agent-removed', handler);
  },

  // Agent status changed
  onAgentStatus: (callback: (event: TeamAgentStatusEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: TeamAgentStatusEvent) => callback(data);
    ipcRenderer.on('team:agent-status', handler);
    return () => ipcRenderer.removeListener('team:agent-status', handler);
  },

  // Agent message received
  onAgentMessage: (callback: (event: TeamAgentMessageEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: TeamAgentMessageEvent) => callback(data);
    ipcRenderer.on('team:agent-message', handler);
    return () => ipcRenderer.removeListener('team:agent-message', handler);
  },

  // Agent message update (streaming)
  onAgentMessageUpdate: (callback: (data: { teamId: string; agentId: string; messageId: string; content: string; isStreaming: boolean }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { teamId: string; agentId: string; messageId: string; content: string; isStreaming: boolean }) => callback(data);
    ipcRenderer.on('team:agent-message-update', handler);
    return () => ipcRenderer.removeListener('team:agent-message-update', handler);
  },

  // All teams cleared
  onAllCleared: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('team:all-cleared', handler);
    return () => ipcRenderer.removeListener('team:all-cleared', handler);
  },

  // Error event
  onError: (callback: (data: { teamId: string; error: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { teamId: string; error: string }) => callback(data);
    ipcRenderer.on('team:error', handler);
    return () => ipcRenderer.removeListener('team:error', handler);
  },

  // SDK agent joined (from claudeServiceSetup agent lifecycle)
  onAgentJoined: (callback: (data: { agentId: string; role: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { agentId: string; role: string }) => callback(data);
    ipcRenderer.on('team:agent-joined', handler);
    return () => ipcRenderer.removeListener('team:agent-joined', handler);
  },

  // SDK agent completed
  onAgentCompleted: (callback: (data: { agentId: string; role: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { agentId: string; role: string }) => callback(data);
    ipcRenderer.on('team:agent-completed', handler);
    return () => ipcRenderer.removeListener('team:agent-completed', handler);
  },

  // SDK agents available list
  onAgentsAvailable: (callback: (data: { agents: string[] }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { agents: string[] }) => callback(data);
    ipcRenderer.on('team:agents-available', handler);
    return () => ipcRenderer.removeListener('team:agents-available', handler);
  },
});

// Type declarations for global window object
declare global {
  interface Window {
    claudeAPI: {
      sendPrompt: (prompt: string, workingDirectory?: string) => void;
      stop: () => void;
      notifyReady: () => void;
      selectDirectory: () => Promise<string | null>;
      getWorkingDirectory: () => Promise<string | null>;
      onMessage: (callback: (event: AgentMessageEvent) => void) => () => void;
      onToolUse: (callback: (event: AgentToolUseEvent) => void) => () => void;
      onStatus: (callback: (event: AgentStatusEvent) => void) => () => void;
      onError: (callback: (event: AgentErrorEvent) => void) => () => void;
      onResult: (callback: (event: AgentResultEvent) => void) => () => void;
      getOMCStatus: (workingDirectory?: string) => Promise<OMCStatusInfo>;
      initializeOMC: (workingDirectory?: string) => Promise<OMCStatusInfo>;
    };
    teamAPI: {
      // Commands
      createTeam: (workingDirectory: string) => Promise<SerializedTeam | null>;
      getAllTeams: () => Promise<SerializedTeam[]>;
      getTeam: (teamId: string) => Promise<SerializedTeam | null>;
      setActiveTeam: (teamId: string) => Promise<boolean>;
      deleteTeam: (teamId: string) => Promise<boolean>;
      sendCommand: (teamId: string, command: string) => void;
      closeAllTeams: () => void;
      stopAllAgents: (teamId?: string) => void;
      getTeamCount: () => Promise<number>;
      selectDirectory: () => Promise<string | null>;
      // Event Listeners
      onInit: (callback: (event: TeamInitEvent) => void) => () => void;
      onTeamCreated: (callback: (team: TeamCreatedEvent) => void) => () => void;
      onTeamDeleted: (callback: (data: { teamId: string }) => void) => () => void;
      onTeamStatusChanged: (callback: (data: { teamId: string; status: string }) => void) => () => void;
      onActiveTeamChanged: (callback: (data: { teamId: string }) => void) => () => void;
      onAgentAdded: (callback: (event: TeamAgentAddedEvent) => void) => () => void;
      onAgentRemoved: (callback: (event: TeamAgentRemovedEvent) => void) => () => void;
      onAgentStatus: (callback: (event: TeamAgentStatusEvent) => void) => () => void;
      onAgentMessage: (callback: (event: TeamAgentMessageEvent) => void) => () => void;
      onAgentMessageUpdate: (callback: (data: { teamId: string; agentId: string; messageId: string; content: string; isStreaming: boolean }) => void) => () => void;
      onAllCleared: (callback: () => void) => () => void;
      onError: (callback: (data: { teamId: string; error: string }) => void) => () => void;
      onAgentJoined: (callback: (data: { agentId: string; role: string }) => void) => () => void;
      onAgentCompleted: (callback: (data: { agentId: string; role: string }) => void) => () => void;
      onAgentsAvailable: (callback: (data: { agents: string[] }) => void) => () => void;
    };
  }
}
