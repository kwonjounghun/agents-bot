import { contextBridge, ipcRenderer } from 'electron';
import type { AgentStatus, MessageType, AgentRole, WidgetMessage, OMCStatusInfo } from '../shared/types';

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

// Auto-detected team agent events
interface AgentJoinedEvent {
  agentId: string;
  role: string;
}

interface AgentCompletedEvent {
  agentId: string;
  role: string;
}

// Expose APIs to renderer
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
  selectDirectory: (): Promise<string | null> => {
    return ipcRenderer.invoke('dialog:select-directory');
  },

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

  // Auto-detected team agent events
  onAgentJoined: (callback: (event: AgentJoinedEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: AgentJoinedEvent) => callback(data);
    ipcRenderer.on('team:agent-joined', handler);
    return () => ipcRenderer.removeListener('team:agent-joined', handler);
  },

  onAgentCompleted: (callback: (event: AgentCompletedEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: AgentCompletedEvent) => callback(data);
    ipcRenderer.on('team:agent-completed', handler);
    return () => ipcRenderer.removeListener('team:agent-completed', handler);
  },

  // === Team Widget Controls ===

  // Spawn team widgets
  spawnTeamWidgets: (agents: { id: string; role: AgentRole }[]): Promise<{ id: string; role: AgentRole; windowId: number }[]> => {
    return ipcRenderer.invoke('team:spawn-widgets', agents);
  },

  // Send message to a specific widget
  sendWidgetMessage: (message: WidgetMessage) => {
    ipcRenderer.send('team:widget-message', message);
  },

  // Send status to a specific widget
  sendWidgetStatus: (agentId: string, status: AgentStatus) => {
    ipcRenderer.send('team:widget-status', { agentId, status });
  },

  // Close a specific widget
  closeWidget: (agentId: string) => {
    ipcRenderer.send('team:close-widget', agentId);
  },

  // Close all widgets
  closeAllWidgets: () => {
    ipcRenderer.send('team:close-all-widgets');
  },

  // Get active widget count
  getWidgetCount: (): Promise<number> => {
    return ipcRenderer.invoke('team:get-widget-count');
  },

  // === OMC APIs ===

  // Get OMC installation status
  getOMCStatus: (workingDirectory?: string): Promise<OMCStatusInfo> => {
    return ipcRenderer.invoke('omc:get-status', workingDirectory);
  },

  // Initialize OMC
  initializeOMC: (workingDirectory?: string): Promise<OMCStatusInfo> => {
    return ipcRenderer.invoke('omc:initialize', workingDirectory);
  }
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
      // Auto-detected team agent events
      onAgentJoined: (callback: (event: AgentJoinedEvent) => void) => () => void;
      onAgentCompleted: (callback: (event: AgentCompletedEvent) => void) => () => void;
      // Team Widget Controls
      spawnTeamWidgets: (agents: { id: string; role: AgentRole }[]) => Promise<{ id: string; role: AgentRole; windowId: number }[]>;
      sendWidgetMessage: (message: WidgetMessage) => void;
      sendWidgetStatus: (agentId: string, status: AgentStatus) => void;
      closeWidget: (agentId: string) => void;
      closeAllWidgets: () => void;
      getWidgetCount: () => Promise<number>;
      // OMC APIs
      getOMCStatus: (workingDirectory?: string) => Promise<OMCStatusInfo>;
      initializeOMC: (workingDirectory?: string) => Promise<OMCStatusInfo>;
    };
  }
}
