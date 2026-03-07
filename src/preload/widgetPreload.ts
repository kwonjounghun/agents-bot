import { contextBridge, ipcRenderer } from 'electron';
import type { WidgetMessage, AgentStatus } from '../shared/types';

contextBridge.exposeInMainWorld('widgetAPI', {
  // Get widget identity from URL params
  getWidgetParams: () => {
    const params = new URLSearchParams(window.location.search);
    return {
      agentId: params.get('agentId') || '',
      role: params.get('role') || ''
    };
  },

  // Listen for messages
  onMessage: (callback: (message: WidgetMessage) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: WidgetMessage) => callback(data);
    ipcRenderer.on('widget:message', handler);
    return () => ipcRenderer.removeListener('widget:message', handler);
  },

  // Listen for status updates
  onStatus: (callback: (data: { agentId: string; status: AgentStatus }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { agentId: string; status: AgentStatus }) => callback(data);
    ipcRenderer.on('widget:status', handler);
    return () => ipcRenderer.removeListener('widget:status', handler);
  },

  // Listen for close signal
  onClose: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('widget:close', handler);
    return () => ipcRenderer.removeListener('widget:close', handler);
  }
});

// TypeScript declaration for window.widgetAPI
declare global {
  interface Window {
    widgetAPI: {
      getWidgetParams: () => { agentId: string; role: string };
      onMessage: (callback: (message: WidgetMessage) => void) => () => void;
      onStatus: (callback: (data: { agentId: string; status: AgentStatus }) => void) => () => void;
      onClose: (callback: () => void) => () => void;
    };
  }
}
