/**
 * IPC Handlers Setup
 * Single Responsibility: Register all IPC handlers for main process communication
 *
 * Uses dependency injection for services to enable testing and loose coupling.
 */

import { ipcMain, dialog } from 'electron';
import type { ClaudeAgentService } from '../claudeAgentService';
import type { TeamManager } from '../services/teamManager';
import type { StreamRouter } from '../services/streamRouter';
import type { TranscriptWatcher } from '../services/transcriptWatcher';
import type { AgentStatus } from '../../shared/types';

/**
 * Services required by IPC handlers
 */
export interface IPCServices {
  claudeService: ClaudeAgentService | null;
  teamManager: TeamManager | null;
  streamRouter: StreamRouter | null;
  transcriptWatcher: TranscriptWatcher | null;
  sendToRenderer: (channel: string, data: unknown) => void;
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
      services.transcriptWatcher?.setWorkingDirectory(selectedDir);
      return selectedDir;
    }
    return null;
  });

  // Get current working directory
  ipcMain.handle('get-working-directory', () => {
    const activeTeam = services.teamManager?.getActiveTeam();
    return activeTeam?.workingDirectory || null;
  });
}

/**
 * Control-related IPC handlers (prompt, stop)
 */
function registerControlHandlers(services: IPCServices): void {
  // Send prompt to Claude (legacy, use team:send-command instead)
  ipcMain.on(
    'control:send-prompt',
    async (_event, { prompt, workingDirectory }: { prompt: string; workingDirectory?: string }) => {
      const activeTeam = services.teamManager?.getActiveTeam();
      const cwd = workingDirectory || activeTeam?.workingDirectory;
      console.log('[IPC] Sending prompt:', prompt.substring(0, 50) + '...');
      console.log('[IPC] Working directory:', cwd);

      // Reset message IDs for new conversation
      services.resetMessageIds();

      // Clear previous agent context via StreamRouter
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
    // Send current teams to renderer
    if (services.teamManager) {
      services.sendToRenderer('team:init', {
        teams: services.teamManager.getSerializedTeams(),
        activeTeamId: services.teamManager.getActiveTeamId(),
      });
    }
  });
}

/**
 * Team-related IPC handlers
 */
function registerTeamHandlers(services: IPCServices): void {
  // Create new team
  ipcMain.handle('team:create', async (_event, workingDirectory: string) => {
    console.log('[IPC] Creating team for:', workingDirectory);
    const team = services.teamManager?.createTeam(workingDirectory);
    return team ? {
      id: team.id,
      name: team.name,
      workingDirectory: team.workingDirectory,
      status: team.status,
    } : null;
  });

  // Get all teams
  ipcMain.handle('team:get-all', () => {
    return services.teamManager?.getSerializedTeams() || [];
  });

  // Set active team
  ipcMain.handle('team:set-active', (_event, teamId: string) => {
    console.log('[IPC] Setting active team:', teamId);
    return services.teamManager?.setActiveTeam(teamId) || false;
  });

  // Delete team
  ipcMain.handle('team:delete', (_event, teamId: string) => {
    console.log('[IPC] Deleting team:', teamId);
    return services.teamManager?.deleteTeam(teamId) || false;
  });

  // Send command to team
  ipcMain.on('team:send-command', (_event, { teamId, command }: { teamId: string; command: string }) => {
    console.log('[IPC] Team command:', teamId, command.substring(0, 50));
    services.teamManager?.handleCommand(teamId, command);
  });

  // Get team info
  ipcMain.handle('team:get', (_event, teamId: string) => {
    const team = services.teamManager?.getTeam(teamId);
    if (!team) return null;
    return {
      id: team.id,
      name: team.name,
      workingDirectory: team.workingDirectory,
      status: team.status,
      agents: Array.from(team.agents.values()),
    };
  });

  // Close all teams
  ipcMain.on('team:close-all', () => {
    console.log('[IPC] Closing all teams');
    services.teamManager?.clearAll();
    services.streamRouter?.clear();
  });

  // Get active team count
  ipcMain.handle('team:get-count', () => {
    return services.teamManager?.getTeamCount() || 0;
  });
}

/**
 * OMC-related IPC handlers
 */
function registerOmcHandlers(services: IPCServices): void {
  // Get OMC installation status
  ipcMain.handle('omc:get-status', async (_event, workingDirectory?: string) => {
    const activeTeam = services.teamManager?.getActiveTeam();
    const cwd = workingDirectory || activeTeam?.workingDirectory || process.cwd();
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
    const activeTeam = services.teamManager?.getActiveTeam();
    const cwd = workingDirectory || activeTeam?.workingDirectory || process.cwd();
    return services.claudeService?.initOMC(cwd);
  });
}
