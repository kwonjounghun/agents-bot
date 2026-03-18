/**
 * IPC Handlers Setup
 * Single Responsibility: Register all IPC handlers for main process communication
 *
 * Uses dependency injection for services to enable testing and loose coupling.
 */

import { ipcMain, dialog } from 'electron';
import type { TeamManager } from '../services/teamManager';
import type { TeamServiceRegistry } from '../services/teamServiceRegistry';
import type { AgentStatus } from '../../shared/types';
import { getClaudeUsage } from '../services/claudeUsageService';

/**
 * Services required by IPC handlers
 */
export interface IPCServices {
  teamManager: TeamManager | null;
  teamServiceRegistry: TeamServiceRegistry | null;
  sendToRenderer: (channel: string, data: unknown) => void;
}

/**
 * Register all IPC handlers
 */
export function registerIpcHandlers(services: IPCServices): void {
  registerDialogHandlers(services);
  registerControlHandlers(services);
  registerTeamHandlers(services);
  registerOmcHandlers(services);
  registerUsageHandlers();
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
      // Update working directory for the active team's transcript watcher
      const activeTeam = services.teamManager?.getActiveTeam();
      if (activeTeam) {
        services.teamServiceRegistry?.get(activeTeam.id)?.transcriptWatcher?.setWorkingDirectory(selectedDir);
      }
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
 * Control-related IPC handlers (legacy prompt/stop, kept for compatibility)
 */
function registerControlHandlers(services: IPCServices): void {
  // Window ready notification
  ipcMain.on('window:ready', () => {
    console.log('[IPC] Window ready');
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
    // Stop and clean up team services first
    services.teamServiceRegistry?.delete(teamId);
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
    services.teamServiceRegistry?.stopAll();
    services.teamManager?.clearAll();
  });

  // Stop agents for a specific team only
  ipcMain.on('team:stop-all-agents', (_event, teamId: string) => {
    console.log('[IPC] Stopping agents for team:', teamId);

    if (!teamId) {
      console.warn('[IPC] team:stop-all-agents called without teamId — ignoring');
      return;
    }

    // Stop only this team's services (other teams are unaffected)
    services.teamServiceRegistry?.stopTeam(teamId);

    // Update UI state for this team
    if (services.teamManager) {
      const team = services.teamManager.getTeam(teamId);
      if (team) {
        services.teamManager.updateAgentStatus(teamId, team.leaderId, 'idle');

        const subAgentIds: string[] = [];
        for (const agent of team.agents.values()) {
          if (!agent.isLeader) {
            subAgentIds.push(agent.id);
            services.teamManager.updateAgentStatus(teamId, agent.id, 'stopped');
          }
        }

        services.teamManager.updateTeamStatus(teamId, 'idle');

        // Remove sub-agents after brief delay so UI shows 'stopped' state
        if (subAgentIds.length > 0) {
          setTimeout(() => {
            for (const agentId of subAgentIds) {
              services.teamManager?.removeAgent(teamId, agentId);
            }
          }, 1000);
        }
      }
    }
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
    const teamId = activeTeam?.id;
    const cwd = workingDirectory || activeTeam?.workingDirectory || process.cwd();

    if (teamId) {
      const svc = services.teamServiceRegistry?.get(teamId);
      if (svc) {
        return svc.claudeService.getOMCStatus(cwd);
      }
    }

    return {
      installed: false,
      version: null,
      skillCount: 0,
      skills: [],
      activeModes: [],
    };
  });

  // Initialize OMC
  ipcMain.handle('omc:initialize', async (_event, workingDirectory?: string) => {
    const activeTeam = services.teamManager?.getActiveTeam();
    const teamId = activeTeam?.id;
    const cwd = workingDirectory || activeTeam?.workingDirectory || process.cwd();

    if (teamId) {
      const svc = services.teamServiceRegistry?.get(teamId);
      if (svc) {
        return svc.claudeService.initOMC(cwd);
      }
    }
  });
}

/**
 * Usage-related IPC handlers
 */
function registerUsageHandlers(): void {
  ipcMain.handle('usage:get-claude', async () => {
    return getClaudeUsage();
  });
}
