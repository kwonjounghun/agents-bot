import { app, BrowserWindow } from 'electron';
import type { ClaudeAgentService, AgentStartEvent, AgentStopEvent } from './claudeAgentService';
import { WidgetManager } from './widgetManager';
import { createStreamRouter, normalizeAgentType, type StreamRouter } from './services/streamRouter';
import { createTranscriptWatcher, type TranscriptWatcher } from './services/transcriptWatcher';
import { createTranscriptMessageHandler, type TranscriptMessageHandler } from './services/transcriptMessageHandler';
import { createTrayManager, type TrayManager } from './tray';
import { createLeaderAgentManager, type LeaderAgentManager } from './leaderAgentManager';
import { registerIpcHandlers } from './setup/ipcHandlers';
import { createMainWindow } from './setup/windowFactory';
import { setupClaudeService } from './setup/claudeServiceSetup';

// Disable sandbox for macOS compatibility
app.commandLine.appendSwitch('no-sandbox');

let mainWindow: BrowserWindow | null = null;
let claudeService: ClaudeAgentService | null = null;
let widgetManager: WidgetManager | null = null;
let streamRouter: StreamRouter | null = null;
let transcriptWatcher: TranscriptWatcher | null = null;
let transcriptHandler: TranscriptMessageHandler | null = null;
let trayManager: TrayManager | null = null;
let leaderManager: LeaderAgentManager | null = null;
let currentWorkingDirectory: string | null = null;

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

  // Initialize Widget Manager
  widgetManager = new WidgetManager();

  // Initialize StreamRouter with 3-second auto-close delay
  streamRouter = createStreamRouter({ autoCloseDelayMs: 3000 });
  streamRouter.setWidgetManager(widgetManager);

  // Initialize Leader Agent Manager
  leaderManager = createLeaderAgentManager();

  // Handle commands from leader widget
  leaderManager.on('commandReceived', async ({ command, workingDirectory }) => {
    console.log('[Main] Leader command received:', command.substring(0, 50));

    // Reset message IDs for new conversation
    currentTextMessageId = null;
    currentThinkingMessageId = null;

    // Clear previous agent widgets via StreamRouter
    if (streamRouter && streamRouter.getStackDepth() > 0) {
      streamRouter.clear();
    }

    // Stop all transcript watchers from previous query
    transcriptWatcher?.stopAll();
    transcriptHandler?.clearAllAccumulators();

    // Update leader status
    leaderManager?.sendToLeader('status', { status: 'thinking' });

    try {
      await claudeService?.query({
        prompt: command,
        workingDirectory
      });
    } catch (error) {
      console.error('[Main] Error executing leader command:', error);
      leaderManager?.sendToLeader('error', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Initialize Tray Manager
  trayManager = createTrayManager({
    onCallLeader: async (workingDirectory: string) => {
      console.log('[Main] Tray: Call leader for directory:', workingDirectory);
      currentWorkingDirectory = workingDirectory;

      // Update TranscriptWatcher with new working directory
      transcriptWatcher?.setWorkingDirectory(workingDirectory);

      // Create leader widget
      if (leaderManager) {
        await leaderManager.createLeader(workingDirectory);
      }

      // Activate tray indicator
      trayManager?.setActive(true);
    },
    onQuit: () => {
      console.log('[Main] Tray: Quit requested');
      leaderManager?.closeLeader();
      trayManager?.setActive(false);
    }
  });
  trayManager.initialize();
  console.log('[Main] Tray manager initialized');

  // Initialize TranscriptMessageHandler (extracted from inline callback)
  transcriptHandler = createTranscriptMessageHandler({
    streamRouter: streamRouter!,
    widgetManager: widgetManager!,
    leaderManager
  });

  // Initialize TranscriptWatcher with handler
  const workingDir = currentWorkingDirectory || process.cwd();
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
    leaderManager,
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
  });

  // Forward agent events to leader manager for sub-agent widget creation
  claudeService.on('agentStart', async (event: AgentStartEvent) => {
    if (leaderManager?.hasLeader()) {
      const normalizedRole = normalizeAgentType(event.agentType);
      console.log('[Main] Creating sub-agent widget via leader:', event.agentId, normalizedRole);

      // Create sub-agent widget
      await leaderManager.createSubAgent(event.agentId, normalizedRole, event.toolUseId);

      // Notify leader about new sub-agent
      leaderManager.sendToLeader('subagent-created', {
        agentId: event.agentId,
        role: normalizedRole,
      });
    }
  });

  claudeService.on('agentStop', (event: AgentStopEvent) => {
    if (leaderManager?.hasLeader()) {
      // Update sub-agent status to complete
      leaderManager.updateSubAgentStatus(event.agentId, 'complete');

      // Close sub-agent widget after delay
      setTimeout(() => {
        leaderManager?.closeSubAgent(event.agentId);
        leaderManager?.sendToLeader('subagent-removed', { agentId: event.agentId });
      }, 3000);
    }
  });

  // Setup IPC handlers
  registerIpcHandlers({
    claudeService,
    widgetManager,
    streamRouter,
    transcriptWatcher,
    sendToRenderer,
    getWorkingDirectory: () => currentWorkingDirectory,
    setWorkingDirectory: (dir: string) => {
      currentWorkingDirectory = dir;
    },
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

  mainWindow.on('closed', () => {
    mainWindow = null;
    claudeService?.stop();
  });

  // macOS specific handling
  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = await createMainWindow();
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
  leaderManager?.closeLeader();
  trayManager?.destroy();
  claudeService?.stop();
});
