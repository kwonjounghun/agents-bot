import { app, BrowserWindow } from 'electron';
import type { ClaudeAgentService } from './claudeAgentService';
import { createStreamRouter, normalizeAgentType } from './services/streamRouter';
import { createTranscriptWatcher } from './services/transcriptWatcher';
import { createTranscriptMessageHandler } from './services/transcriptMessageHandler';
import { createTrayManager, type TrayManager } from './tray';
import { createTeamManager, type TeamManager } from './services/teamManager';
import { registerIpcHandlers } from './setup/ipcHandlers';
import { createMainWindow } from './setup/windowFactory';
import { setupClaudeService } from './setup/claudeServiceSetup';
import { createTeamServiceRegistry, type TeamServiceSet } from './services/teamServiceRegistry';

// Disable sandbox for macOS compatibility
app.commandLine.appendSwitch('no-sandbox');

let mainWindow: BrowserWindow | null = null;
let teamManager: TeamManager | null = null;
let trayManager: TrayManager | null = null;

const teamServiceRegistry = createTeamServiceRegistry();

function sendToRenderer(channel: string, data: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

/**
 * Create a complete, isolated service set for one team.
 * All message routing, transcript watching, and streaming state
 * are scoped to this team — no cross-team contamination.
 */
function createTeamServices(teamId: string, workingDirectory: string): TeamServiceSet {
  const streamRouter = createStreamRouter();

  const transcriptHandler = createTranscriptMessageHandler({
    streamRouter,
    teamManager,
  });

  const transcriptWatcher = createTranscriptWatcher(
    {
      onMessage: (message) => transcriptHandler.handleMessage(message),
    },
    workingDirectory
  );

  // Create mutable shell first so closures always read the live messageId values
  const svc: TeamServiceSet = {
    streamRouter,
    transcriptWatcher,
    transcriptHandler,
    textMessageId: null,
    thinkingMessageId: null,
    claudeService: null as unknown as ClaudeAgentService,
  };

  svc.claudeService = setupClaudeService({
    teamId,
    streamRouter,
    transcriptWatcher,
    teamManager,
    normalizeAgentType,
    sendToRenderer,
    getMessageIds: () => ({ textId: svc.textMessageId, thinkingId: svc.thinkingMessageId }),
    setMessageIds: (textId, thinkingId) => {
      svc.textMessageId = textId;
      svc.thinkingMessageId = thinkingId;
    },
    clearTranscriptAccumulator: (agentId) => transcriptHandler.clearAccumulator(agentId),
  });

  return svc;
}

app.whenReady().then(async () => {

  // Initialize Team Manager
  teamManager = createTeamManager();

  // Handle commands per team — each team uses its own isolated service set
  teamManager.on('commandReceived', async ({ teamId, command, workingDirectory, shouldContinue }: { teamId: string; command: string; workingDirectory: string; shouldContinue: boolean }) => {
    // Lazily create service set on first command for this team
    if (!teamServiceRegistry.has(teamId)) {
      const svc = createTeamServices(teamId, workingDirectory);
      teamServiceRegistry.set(teamId, svc);
    }

    const svc = teamServiceRegistry.get(teamId)!;

    // Reset per-query streaming state
    svc.textMessageId = null;
    svc.thinkingMessageId = null;

    if (svc.streamRouter.getStackDepth() > 0) {
      svc.streamRouter.clear();
    }

    svc.transcriptWatcher.stopAll();
    svc.transcriptHandler.clearAllAccumulators();
    svc.transcriptWatcher.setWorkingDirectory(workingDirectory);

    try {
      await svc.claudeService.query({
        prompt: command,
        workingDirectory,
        continue: shouldContinue,
      });
    } catch (error) {
      const team = teamManager?.getTeam(teamId);
      if (team) {
        teamManager?.updateAgentStatus(teamId, team.leaderId, 'error');
      }
      sendToRenderer('team:error', {
        teamId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Initialize Tray Manager
  trayManager = createTrayManager({
    onCallLeader: async (workingDirectory: string) => {
      if (teamManager) {
        const team = teamManager.createTeam(workingDirectory);
        teamManager.setActiveTeam(team.id);
      }

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
      }

      trayManager?.setActive(true);
    },
    onQuit: () => {
      teamServiceRegistry.stopAll();
      teamManager?.clearAll();
      trayManager?.setActive(false);
    },
    onToggleWindow: () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
  });
  trayManager.initialize();

  // Setup IPC handlers
  registerIpcHandlers({
    teamManager,
    teamServiceRegistry,
    sendToRenderer,
  });

  // Create the main window
  mainWindow = await createMainWindow();
  teamManager.setMainWindow(mainWindow);

  // Hide instead of close on macOS
  mainWindow.on('close', (event) => {
    if (process.platform === 'darwin') {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    teamServiceRegistry.stopAll();
  });

  // macOS specific handling
  app.on('activate', async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    } else if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = await createMainWindow();
      teamManager?.setMainWindow(mainWindow);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Graceful shutdown
app.on('before-quit', () => {
  teamServiceRegistry.clear();
  teamManager?.clearAll();
  trayManager?.destroy();
});
