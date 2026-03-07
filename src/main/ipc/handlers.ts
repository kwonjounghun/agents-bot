/**
 * IPC Handler Registry Module
 * Single Responsibility: Register and manage IPC handlers
 *
 * This module organizes IPC handlers by domain:
 * - Dialog handlers (file/directory selection)
 * - Control handlers (prompt sending, stopping)
 * - Team handlers (widget management)
 * - OMC handlers (status, initialization)
 *
 * Usage:
 *   const registry = createIPCHandlerRegistry(dependencies);
 *   registry.registerAll();
 */

import { ipcMain, dialog } from 'electron';
import type { ClaudeAgentService } from '../claudeAgentService';
import type { WidgetManager } from '../widgetManager';
import type { TeamStateManager, TeamAgent } from '../services/teamStateManager';
import type { AgentRole } from '../services/agentNormalizer';
import type { AgentStatus } from '../services/widgetRouter';

export interface IPCHandlerDependencies {
  claudeService: ClaudeAgentService | null;
  widgetManager: WidgetManager | null;
  teamStateManager: TeamStateManager;
  sendToRenderer: (channel: string, data: unknown) => void;
  getCurrentWorkingDirectory: () => string | null;
  setCurrentWorkingDirectory: (dir: string) => void;
  resetMessageIds: () => void;
  clearAutoDetectedAgents: () => void;
}

export interface IPCHandlerRegistry {
  /**
   * Register all IPC handlers.
   */
  registerAll(): void;

  /**
   * Register dialog-related handlers.
   */
  registerDialogHandlers(): void;

  /**
   * Register control-related handlers.
   */
  registerControlHandlers(): void;

  /**
   * Register team-related handlers.
   */
  registerTeamHandlers(): void;

  /**
   * Register OMC-related handlers.
   */
  registerOMCHandlers(): void;
}

/**
 * Create an IPC handler registry.
 *
 * @param deps - Handler dependencies
 * @returns IPCHandlerRegistry instance
 */
export function createIPCHandlerRegistry(deps: IPCHandlerDependencies): IPCHandlerRegistry {
  return {
    registerAll(): void {
      this.registerDialogHandlers();
      this.registerControlHandlers();
      this.registerTeamHandlers();
      this.registerOMCHandlers();
    },

    registerDialogHandlers(): void {
      // Select working directory
      ipcMain.handle('dialog:select-directory', async () => {
        const result = await dialog.showOpenDialog({
          properties: ['openDirectory'],
          title: 'Select Project Directory',
          buttonLabel: 'Select'
        });

        if (!result.canceled && result.filePaths.length > 0) {
          const dir = result.filePaths[0];
          deps.setCurrentWorkingDirectory(dir);
          return dir;
        }
        return null;
      });

      // Get current working directory
      ipcMain.handle('get-working-directory', () => {
        return deps.getCurrentWorkingDirectory();
      });
    },

    registerControlHandlers(): void {
      // Send prompt to Claude
      ipcMain.on('control:send-prompt', async (_event, { prompt, workingDirectory }: {
        prompt: string;
        workingDirectory?: string;
      }) => {
        const cwd = workingDirectory || deps.getCurrentWorkingDirectory();
        console.log('[IPC] Sending prompt:', prompt.substring(0, 50) + '...');
        console.log('[IPC] Working directory:', cwd);

        // Reset message IDs for new conversation
        deps.resetMessageIds();

        // Reset auto-detection state (close old widgets from previous run)
        deps.clearAutoDetectedAgents();

        deps.sendToRenderer('agent:status', { status: 'thinking' as AgentStatus });

        try {
          await deps.claudeService?.query({
            prompt,
            workingDirectory: cwd || undefined
          });
        } catch (error) {
          console.error('[IPC] Error sending prompt:', error);
          deps.sendToRenderer('agent:error', {
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      });

      // Stop current query
      ipcMain.on('control:stop', () => {
        console.log('[IPC] Stopping query');
        deps.claudeService?.stop();
        deps.sendToRenderer('agent:status', { status: 'idle' as AgentStatus });
      });

      // Window ready notification
      ipcMain.on('window:ready', () => {
        console.log('[IPC] Window ready');
      });
    },

    registerTeamHandlers(): void {
      // Spawn agent team widgets
      ipcMain.handle('team:spawn-widgets', async (_event, agents: { id: string; role: AgentRole }[]) => {
        console.log('[IPC] Spawning team widgets:', agents);

        // Track active team agents for message routing
        deps.teamStateManager.setAgents(agents.map(a => ({ id: a.id, role: a.role })));

        const results = [];
        for (let i = 0; i < agents.length; i++) {
          const { id, role } = agents[i];
          const widget = await deps.widgetManager?.createWidget(id, role, i);
          results.push({ id, role, windowId: widget?.id });
        }
        return results;
      });

      // Send message to specific widget
      ipcMain.on('team:widget-message', (_event, message: {
        agentId: string;
        role: AgentRole;
        type: string;
        content: string;
        timestamp: number;
      }) => {
        console.log('[IPC] Widget message:', message.agentId, message.type);
        deps.widgetManager?.sendMessageToWidget(message as any);
      });

      // Send status to specific widget
      ipcMain.on('team:widget-status', (_event, { agentId, status }: {
        agentId: string;
        status: AgentStatus;
      }) => {
        deps.widgetManager?.sendStatusToWidget(agentId, status);
      });

      // Close specific widget
      ipcMain.on('team:close-widget', (_event, agentId: string) => {
        console.log('[IPC] Closing widget:', agentId);
        deps.widgetManager?.closeWidget(agentId);
      });

      // Close all widgets
      ipcMain.on('team:close-all-widgets', () => {
        console.log('[IPC] Closing all widgets');
        deps.widgetManager?.closeAllWidgets();
        deps.teamStateManager.clear();
      });

      // Get active widget count
      ipcMain.handle('team:get-widget-count', () => {
        return deps.widgetManager?.getWidgetCount() || 0;
      });
    },

    registerOMCHandlers(): void {
      // Get OMC installation status
      ipcMain.handle('omc:get-status', async (_event, workingDirectory?: string) => {
        const cwd = workingDirectory || deps.getCurrentWorkingDirectory() || process.cwd();
        return deps.claudeService?.getOMCStatus(cwd) || {
          installed: false,
          version: null,
          skillCount: 0,
          skills: [],
          activeModes: []
        };
      });

      // Initialize OMC
      ipcMain.handle('omc:initialize', async (_event, workingDirectory?: string) => {
        const cwd = workingDirectory || deps.getCurrentWorkingDirectory() || process.cwd();
        return deps.claudeService?.initOMC(cwd);
      });
    }
  };
}
