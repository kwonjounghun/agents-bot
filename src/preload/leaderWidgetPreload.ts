/**
 * Leader Widget Preload Script
 *
 * Exposes APIs for the Team Leader widget with input functionality
 */

import { contextBridge, ipcRenderer } from 'electron';
import type { AgentStatus, AgentRole } from '../shared/types';

export interface SubAgentStatusUpdate {
  agentId: string;
  role: AgentRole;
  status: AgentStatus;
}

export interface LeaderMessage {
  type: 'thinking' | 'speaking' | 'tool_use' | 'complete' | 'error';
  content: string;
  timestamp: number;
}

export interface LeaderWidgetParams {
  leaderId: string;
  workingDirectory: string;
}

contextBridge.exposeInMainWorld('leaderAPI', {
  /**
   * Get leader widget identity from URL params
   */
  getLeaderParams: (): LeaderWidgetParams => {
    const params = new URLSearchParams(window.location.search);
    return {
      leaderId: params.get('leaderId') || '',
      workingDirectory: decodeURIComponent(params.get('workingDirectory') || '')
    };
  },

  /**
   * Send command to the leader agent
   */
  sendCommand: (command: string): void => {
    ipcRenderer.send('leader:send-command', { command });
  },

  /**
   * Notify that the leader widget is ready
   */
  notifyReady: (): void => {
    ipcRenderer.send('leader:ready');
  },

  /**
   * Request to close the leader widget
   */
  requestClose: (): void => {
    ipcRenderer.send('leader:close');
  },

  /**
   * Listen for leader's own messages (thinking, speaking)
   */
  onMessage: (callback: (message: LeaderMessage) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: LeaderMessage) => callback(data);
    ipcRenderer.on('leader:message', handler);
    return () => ipcRenderer.removeListener('leader:message', handler);
  },

  /**
   * Listen for leader status updates
   */
  onStatus: (callback: (status: AgentStatus) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { status: AgentStatus }) => callback(data.status);
    ipcRenderer.on('leader:status', handler);
    return () => ipcRenderer.removeListener('leader:status', handler);
  },

  /**
   * Listen for sub-agent status updates
   */
  onSubAgentStatus: (callback: (data: SubAgentStatusUpdate) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: SubAgentStatusUpdate) => callback(data);
    ipcRenderer.on('leader:subagent-status', handler);
    return () => ipcRenderer.removeListener('leader:subagent-status', handler);
  },

  /**
   * Listen for sub-agent creation events
   */
  onSubAgentCreated: (callback: (data: { agentId: string; role: AgentRole }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { agentId: string; role: AgentRole }) => callback(data);
    ipcRenderer.on('leader:subagent-created', handler);
    return () => ipcRenderer.removeListener('leader:subagent-created', handler);
  },

  /**
   * Listen for sub-agent removal events
   */
  onSubAgentRemoved: (callback: (data: { agentId: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { agentId: string }) => callback(data);
    ipcRenderer.on('leader:subagent-removed', handler);
    return () => ipcRenderer.removeListener('leader:subagent-removed', handler);
  },

  /**
   * Listen for result events
   */
  onResult: (callback: (data: { result: string; costUsd: number; turns: number }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { result: string; costUsd: number; turns: number }) => callback(data);
    ipcRenderer.on('leader:result', handler);
    return () => ipcRenderer.removeListener('leader:result', handler);
  },

  /**
   * Listen for error events
   */
  onError: (callback: (error: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { error: string }) => callback(data.error);
    ipcRenderer.on('leader:error', handler);
    return () => ipcRenderer.removeListener('leader:error', handler);
  }
});

// TypeScript declaration for window.leaderAPI
declare global {
  interface Window {
    leaderAPI: {
      getLeaderParams: () => LeaderWidgetParams;
      sendCommand: (command: string) => void;
      notifyReady: () => void;
      requestClose: () => void;
      onMessage: (callback: (message: LeaderMessage) => void) => () => void;
      onStatus: (callback: (status: AgentStatus) => void) => () => void;
      onSubAgentStatus: (callback: (data: SubAgentStatusUpdate) => void) => () => void;
      onSubAgentCreated: (callback: (data: { agentId: string; role: AgentRole }) => void) => () => void;
      onSubAgentRemoved: (callback: (data: { agentId: string }) => void) => () => void;
      onResult: (callback: (data: { result: string; costUsd: number; turns: number }) => void) => () => void;
      onError: (callback: (error: string) => void) => () => void;
    };
  }
}
