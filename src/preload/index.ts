import { contextBridge, ipcRenderer } from 'electron';
import type { AgentStatus, MessageType } from '../shared/types';

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
    };
  }
}
