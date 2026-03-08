import { app, BrowserWindow } from 'electron';
import type { ClaudeAgentService, AgentStartEvent, AgentStopEvent } from './claudeAgentService';
import { createStreamRouter, normalizeAgentType, type StreamRouter } from './services/streamRouter';
import { createTranscriptWatcher, type TranscriptWatcher } from './services/transcriptWatcher';
import { createTranscriptMessageHandler, type TranscriptMessageHandler } from './services/transcriptMessageHandler';
import { createTrayManager, type TrayManager } from './tray';
import { createTeamManager, type TeamManager } from './services/teamManager';
import { registerIpcHandlers } from './setup/ipcHandlers';
import { createMainWindow } from './setup/windowFactory';
import { setupClaudeService } from './setup/claudeServiceSetup';

// Disable sandbox for macOS compatibility
app.commandLine.appendSwitch('no-sandbox');

let mainWindow: BrowserWindow | null = null;
let claudeService: ClaudeAgentService | null = null;
let teamManager: TeamManager | null = null;
let streamRouter: StreamRouter | null = null;
let transcriptWatcher: TranscriptWatcher | null = null;
let transcriptHandler: TranscriptMessageHandler | null = null;
let trayManager: TrayManager | null = null;

// Track current message IDs for streaming accumulation
let currentTextMessageId: string | null = null;
let currentThinkingMessageId: string | null = null;

function sendToRenderer(channel: string, data: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

console.log('[Main] Waiting for app ready...');
app.whenReady().then(async () => {
  console.log('[Main] App is ready!');

  // Initialize StreamRouter
  streamRouter = createStreamRouter();

  // Initialize Team Manager (replaces LeaderAgentManager + WidgetManager)
  teamManager = createTeamManager();

  // Handle commands from team (leader)
  teamManager.on('commandReceived', async ({ teamId, command, workingDirectory }: { teamId: string; command: string; workingDirectory: string }) => {
    console.log('[Main] Team command received:', command.substring(0, 50));

    // Reset message IDs for new conversation
    currentTextMessageId = null;
    currentThinkingMessageId = null;

    // Clear previous agent context via StreamRouter
    if (streamRouter && streamRouter.getStackDepth() > 0) {
      streamRouter.clear();
    }

    // Stop all transcript watchers from previous query
    transcriptWatcher?.stopAll();
    transcriptHandler?.clearAllAccumulators();

    // Update transcript watcher working directory
    transcriptWatcher?.setWorkingDirectory(workingDirectory);

    try {
      await claudeService?.query({
        prompt: command,
        workingDirectory
      });
    } catch (error) {
      console.error('[Main] Error executing team command:', error);
      const activeTeam = teamManager?.getActiveTeam();
      if (activeTeam) {
        teamManager?.updateAgentStatus(activeTeam.id, activeTeam.leaderId, 'error');
      }
      sendToRenderer('team:error', {
        teamId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Initialize Tray Manager
  trayManager = createTrayManager({
    onCallLeader: async (workingDirectory: string) => {
      console.log('[Main] Tray: Call leader for directory:', workingDirectory);

      // Update TranscriptWatcher with new working directory
      transcriptWatcher?.setWorkingDirectory(workingDirectory);

      // Create new team
      if (teamManager) {
        const team = teamManager.createTeam(workingDirectory);
        teamManager.setActiveTeam(team.id);
      }

      // Show main window
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
      }

      // Activate tray indicator
      trayManager?.setActive(true);
    },
    onQuit: () => {
      console.log('[Main] Tray: Quit requested');
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
    }
  });
  trayManager.initialize();
  console.log('[Main] Tray manager initialized');

  // Initialize TranscriptMessageHandler
  transcriptHandler = createTranscriptMessageHandler({
    streamRouter: streamRouter!,
    teamManager
  });

  // Initialize TranscriptWatcher with handler
  const workingDir = process.cwd();
  transcriptWatcher = createTranscriptWatcher(
    {
      onMessage: (message) => transcriptHandler!.handleMessage(message),
      onError: (error: Error, agentId: string) => {
        console.error('[Main] Transcript error for', agentId, ':', error.message);
      }
    },
    workingDir
  );

  // Initialize Claude service with dependencies
  claudeService = setupClaudeService({
    streamRouter,
    transcriptWatcher,
    teamManager,
    normalizeAgentType,
    sendToRenderer,
    getMessageIds: () => ({ textId: currentTextMessageId, thinkingId: currentThinkingMessageId }),
    setMessageIds: (textId, thinkingId) => {
      currentTextMessageId = textId;
      currentThinkingMessageId = thinkingId;
    },
    clearTranscriptAccumulator: (agentId) => {
      transcriptHandler?.clearAccumulator(agentId);
    },
    // Enable routing leader messages (thinking/text) to TeamManager for display in leader chat
    routeLeaderToTeam: true,
  });

  // Forward agent events to team manager for sub-agent tracking
  claudeService.on('agentStart', async (event: AgentStartEvent) => {
    const activeTeam = teamManager?.getActiveTeam();
    if (activeTeam) {
      const normalizedRole = normalizeAgentType(event.agentType);
      console.log('[Main] Adding sub-agent to team:', event.agentId, normalizedRole);

      teamManager?.addAgent(activeTeam.id, {
        id: event.agentId,
        role: normalizedRole,
        isLeader: false,
        parentToolUseId: event.toolUseId,
        status: 'thinking',
      });
    }
  });

  claudeService.on('agentStop', (event: AgentStopEvent) => {
    const team = teamManager?.findTeamByAgentId(event.agentId);
    if (team) {
      // Update sub-agent status to complete
      teamManager?.updateAgentStatus(team.id, event.agentId, 'complete');

      // Remove sub-agent after delay
      setTimeout(() => {
        teamManager?.removeAgent(team.id, event.agentId);
      }, 3000);
    }
  });

  // Setup IPC handlers
  registerIpcHandlers({
    claudeService,
    teamManager,
    streamRouter,
    transcriptWatcher,
    sendToRenderer,
    resetMessageIds: () => {
      currentTextMessageId = null;
      currentThinkingMessageId = null;
    },
    clearTranscriptAccumulator: () => {
      transcriptHandler?.clearAllAccumulators();
    },
  });

  // Create the main window
  mainWindow = await createMainWindow();

  // Set main window for team manager IPC
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
    claudeService?.stop();
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
  transcriptWatcher?.stopAll();
  streamRouter?.clear();
  teamManager?.clearAll();
  trayManager?.destroy();
  claudeService?.stop();
});
