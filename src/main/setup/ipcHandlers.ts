/**
 * IPC Handlers Setup
 * Single Responsibility: Register all IPC handlers for main process communication
 *
 * Uses dependency injection for services to enable testing and loose coupling.
 */

import { ipcMain, dialog } from 'electron';
import type { ClaudeAgentService } from '../claudeAgentService';
import type { WidgetManager } from '../widgetManager';
import type { StreamRouter } from '../services/streamRouter';
import type { TranscriptWatcher } from '../services/transcriptWatcher';
import type { AgentStatus, AgentRole, WidgetMessage } from '../../shared/types';

/**
 * Services required by IPC handlers
 */
export interface IPCServices {
  claudeService: ClaudeAgentService | null;
  widgetManager: WidgetManager | null;
  streamRouter: StreamRouter | null;
  transcriptWatcher: TranscriptWatcher | null;
  sendToRenderer: (channel: string, data: unknown) => void;
  getWorkingDirectory: () => string | null;
  setWorkingDirectory: (dir: string) => void;
  resetMessageIds: () => void;
  clearTranscriptAccumulator: () => void;
}

/**
 * Register all IPC handlers
 */
export function registerIpcHandlers(services: IPCServices): void {
  registerDialogHandlers(services);
  registerControlHandlers(services);
  registerTeamHandlers(services);
  registerOmcHandlers(services);
}

/**
 * Dialog-related IPC handlers
 */
function registerDialogHandlers(services: IPCServices): void {
  // Select working directory
  ipcMain.handle('dialog:select-directory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select Project Directory',
      buttonLabel: 'Select',
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const selectedDir = result.filePaths[0];
      services.setWorkingDirectory(selectedDir);
      services.transcriptWatcher?.setWorkingDirectory(selectedDir);
      return selectedDir;
    }
    return null;
  });

  // Get current working directory
  ipcMain.handle('get-working-directory', () => {
    return services.getWorkingDirectory();
  });
}

/**
 * Control-related IPC handlers (prompt, stop)
 */
function registerControlHandlers(services: IPCServices): void {
  // Send prompt to Claude
  ipcMain.on(
    'control:send-prompt',
    async (_event, { prompt, workingDirectory }: { prompt: string; workingDirectory?: string }) => {
      const cwd = workingDirectory || services.getWorkingDirectory();
      console.log('[IPC] Sending prompt:', prompt.substring(0, 50) + '...');
      console.log('[IPC] Working directory:', cwd);

      // Reset message IDs for new conversation
      services.resetMessageIds();

      // Clear previous agent widgets via StreamRouter
      if (services.streamRouter && services.streamRouter.getStackDepth() > 0) {
        console.log('[IPC] Cleaning up previous agents via StreamRouter');
        services.streamRouter.clear();
      }

      // Stop all transcript watchers from previous query
      services.transcriptWatcher?.stopAll();

      // Clear all transcript accumulators
      services.clearTranscriptAccumulator();

      services.sendToRenderer('agent:status', { status: 'thinking' as AgentStatus });

      try {
        await services.claudeService?.query({
          prompt,
          workingDirectory: cwd || undefined,
        });
      } catch (error) {
        console.error('[IPC] Error sending prompt:', error);
        services.sendToRenderer('agent:error', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  // Stop current query
  ipcMain.on('control:stop', () => {
    console.log('[IPC] Stopping query');
    services.claudeService?.stop();
    services.sendToRenderer('agent:status', { status: 'idle' as AgentStatus });
  });

  // Window ready notification
  ipcMain.on('window:ready', () => {
    console.log('[IPC] Window ready');
  });
}

/**
 * Team/Widget-related IPC handlers
 */
function registerTeamHandlers(services: IPCServices): void {
  // Spawn agent team widgets (for manual team spawning from renderer)
  ipcMain.handle('team:spawn-widgets', async (_event, agents: { id: string; role: AgentRole }[]) => {
    console.log('[IPC] Spawning team widgets:', agents);

    const results = [];
    for (const { id, role } of agents) {
      // Use StreamRouter to manage context
      await services.streamRouter?.pushContext(id, role, true);
      const widget = services.widgetManager?.hasWidget(id);
      results.push({ id, role, created: widget });
    }
    return results;
  });

  // Send message to specific widget
  ipcMain.on('team:widget-message', (_event, message: WidgetMessage) => {
    console.log('[IPC] Widget message:', message.agentId, message.type);
    services.widgetManager?.sendMessageToWidget(message);
  });

  // Send status to specific widget
  ipcMain.on('team:widget-status', (_event, { agentId, status }: { agentId: string; status: AgentStatus }) => {
    services.widgetManager?.sendStatusToWidget(agentId, status);
  });

  // Close specific widget
  ipcMain.on('team:close-widget', (_event, agentId: string) => {
    console.log('[IPC] Closing widget:', agentId);
    services.widgetManager?.closeWidget(agentId);
  });

  // Close all widgets
  ipcMain.on('team:close-all-widgets', () => {
    console.log('[IPC] Closing all widgets');
    services.streamRouter?.clear();
  });

  // Get active widget count
  ipcMain.handle('team:get-widget-count', () => {
    return services.widgetManager?.getWidgetCount() || 0;
  });
}

/**
 * OMC-related IPC handlers
 */
function registerOmcHandlers(services: IPCServices): void {
  // Get OMC installation status
  ipcMain.handle('omc:get-status', async (_event, workingDirectory?: string) => {
    const cwd = workingDirectory || services.getWorkingDirectory() || process.cwd();
    return (
      services.claudeService?.getOMCStatus(cwd) || {
        installed: false,
        version: null,
        skillCount: 0,
        skills: [],
        activeModes: [],
      }
    );
  });

  // Initialize OMC
  ipcMain.handle('omc:initialize', async (_event, workingDirectory?: string) => {
    const cwd = workingDirectory || services.getWorkingDirectory() || process.cwd();
    return services.claudeService?.initOMC(cwd);
  });
}
