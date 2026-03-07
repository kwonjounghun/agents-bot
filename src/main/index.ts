import { app, BrowserWindow, ipcMain, screen, dialog } from 'electron';
import { join } from 'path';
import { ClaudeAgentService, ClaudeAgentMessage, AgentStartEvent, AgentStopEvent } from './claudeAgentService';
import { WidgetManager } from './widgetManager';
import { StreamRouter, createStreamRouter } from './services/streamRouter';
import { TranscriptWatcher, createTranscriptWatcher, TranscriptMessage } from './services/transcriptWatcher';
import { TrayManager, createTrayManager } from './tray';
import { LeaderAgentManager, createLeaderAgentManager } from './leaderAgentManager';
import type { AgentStatus, AgentRole, WidgetMessage, OMCStatusInfo } from '../shared/types';

// Disable sandbox for macOS compatibility
app.commandLine.appendSwitch('no-sandbox');

let mainWindow: BrowserWindow | null = null;
let claudeService: ClaudeAgentService | null = null;
let widgetManager: WidgetManager | null = null;
let streamRouter: StreamRouter | null = null;
let transcriptWatcher: TranscriptWatcher | null = null;
let trayManager: TrayManager | null = null;
let leaderManager: LeaderAgentManager | null = null;
let currentWorkingDirectory: string | null = null;

// Track current message IDs for streaming accumulation
let currentTextMessageId: string | null = null;
let currentThinkingMessageId: string | null = null;

// Track accumulated transcript content per agent
const transcriptAccumulator: Map<string, { text: string; thinking: string; tool_use: string; tool_result: string }> = new Map();

/**
 * Normalize agent type from SDK to match our KNOWN_AGENTS keys
 * Handles various formats:
 * - "oh-my-claudecode:executor" -> "executor"
 * - "Explore" -> "explore"
 * - "general-purpose" -> "explore"
 */
function normalizeAgentType(agentType: string): AgentRole {
  if (!agentType) return 'executor';

  // Remove oh-my-claudecode: prefix
  let normalized = agentType.replace(/^oh-my-claudecode:/i, '');

  // Convert to lowercase
  normalized = normalized.toLowerCase();

  // Map SDK built-in agent types to our agent types
  const agentTypeMap: Record<string, AgentRole> = {
    'general-purpose': 'executor',
    'general': 'executor',
    'default': 'executor',
    'plan': 'planner',
    'bash': 'executor',
    'explorer': 'explore',
  };

  if (agentTypeMap[normalized]) {
    return agentTypeMap[normalized];
  }

  // Return as-is if it's a known agent type
  return normalized as AgentRole;
}

async function createMainWindow(): Promise<BrowserWindow> {
  console.log('[Main] Creating main window...');

  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;

  const win = new BrowserWindow({
    width: 500,
    height: 700,
    x: screenWidth - 520,
    y: 20,
    frame: true,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: false,
    hasShadow: true,
    show: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.once('ready-to-show', () => {
    console.log('[Main] Window ready to show');
    win.show();
  });

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('[Main] Failed to load:', errorCode, errorDescription);
  });

  win.webContents.on('did-finish-load', () => {
    console.log('[Main] Page finished loading');
  });

  // Load the renderer
  try {
    if (process.env.NODE_ENV === 'development') {
      const url = process.env.ELECTRON_RENDERER_URL || 'http://localhost:5173';
      console.log('[Main] Loading renderer from:', url);
      await win.loadURL(url);
    } else {
      const filePath = join(__dirname, '../renderer/index.html');
      console.log('[Main] Loading file:', filePath);
      await win.loadFile(filePath);
    }
    console.log('[Main] Load completed');
  } catch (error) {
    console.error('[Main] Error loading window:', error);
    win.show();
  }

  return win;
}

function sendToRenderer(channel: string, data: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

function setupClaudeService(): void {
  claudeService = new ClaudeAgentService();

  // Enable SDK-OMC mode (built-in OMC implementation)
  claudeService.enableSdkOmc();
  console.log('[Main] SDK-OMC enabled');

  // Auto-detect agent starts from SDK hooks - use StreamRouter
  claudeService.on('agentStart', async (event: AgentStartEvent) => {
    // Normalize the agent type from SDK format to our known agent names
    const normalizedRole = normalizeAgentType(event.agentType);
    console.log('[Main] Agent started (auto-detected):', event.agentType, '->', normalizedRole, event.agentId,
      'toolUseId:', event.toolUseId || 'none');

    // Check if StreamRouter already has this agent
    if (streamRouter?.hasAgent(event.agentId)) {
      console.log('[Main] Agent already tracked in StreamRouter');
      return;
    }

    // Push context to StreamRouter (this also creates the widget)
    // Pass toolUseId for message routing
    await streamRouter?.pushContext(event.agentId, event.agentType, false, event.toolUseId);

    // Start watching transcript for this agent
    if (transcriptWatcher) {
      console.log('[Main] Starting transcript watcher for:', event.agentId);
      transcriptWatcher.startWatching(event.agentId);
    }

    // Notify renderer about new team member
    sendToRenderer('team:agent-joined', { agentId: event.agentId, role: normalizedRole });
  });

  // Auto-detect agent stops from SDK hooks - use StreamRouter
  claudeService.on('agentStop', (event: AgentStopEvent) => {
    console.log('[Main] Agent stopped (auto-detected):', event.agentId);

    // Stop watching transcript for this agent
    if (transcriptWatcher) {
      console.log('[Main] Stopping transcript watcher for:', event.agentId);
      transcriptWatcher.stopWatching(event.agentId);
    }

    // Clear transcript accumulator for this agent
    transcriptAccumulator.delete(event.agentId);

    // Pop context from StreamRouter (this handles widget completion and auto-close)
    const context = streamRouter?.popContext(event.agentId);

    if (context) {
      // Notify renderer
      sendToRenderer('team:agent-completed', { agentId: event.agentId, role: context.normalizedRole });
    }
  });

  // Handle available agents list from system init
  claudeService.on('agentsAvailable', (agents: string[]) => {
    console.log('[Main] Agents available from SDK:', agents);
    sendToRenderer('team:agents-available', { agents });
  });

  claudeService.on('message', (message: ClaudeAgentMessage) => {
    // Debug: Log message routing
    console.log('[Main] Message received:', message.type,
      'parentToolUseId:', message.parentToolUseId || 'none',
      'content length:', message.content?.length || 0);

    switch (message.type) {
      case 'text': {
        // Create new message ID only if we don't have one yet
        if (!currentTextMessageId) {
          currentTextMessageId = `text-${Date.now()}`;
        }
        sendToRenderer('agent:status', { status: 'responding' as AgentStatus });
        sendToRenderer('agent:message', {
          messageId: currentTextMessageId,
          chunk: message.content,
          fullText: message.content,
          type: 'text',
          isComplete: false
        });

        // Route to leader widget or subagent widget
        if (leaderManager?.hasLeader()) {
          if (message.parentToolUseId) {
            // Route to sub-agent widget via leader manager
            const subAgent = leaderManager.findSubAgentByToolUseId(message.parentToolUseId);
            if (subAgent) {
              leaderManager.updateSubAgentStatus(subAgent.id, 'responding');
              leaderManager.sendSubAgentMessage(subAgent.id, 'speaking', message.content);
            }
          } else {
            // Route to leader itself
            leaderManager.sendToLeader('status', { status: 'responding' });
            leaderManager.sendToLeader('message', {
              type: 'speaking',
              content: message.content,
              timestamp: Date.now()
            });
          }
        } else if (message.parentToolUseId) {
          console.log('[Main] Routing text to subagent via parentToolUseId:', message.parentToolUseId);
          streamRouter?.routeStatusByToolUseId('responding', message.parentToolUseId);
          streamRouter?.routeMessageByToolUseId('speaking', message.content, message.parentToolUseId);
        } else if (streamRouter && streamRouter.getStackDepth() > 0) {
          console.log('[Main] Routing text to current agent (fallback)');
          streamRouter.routeStatus('responding');
          streamRouter.routeMessage('speaking', message.content);
        }
        break;
      }

      case 'thinking': {
        // Create new message ID only if we don't have one yet
        if (!currentThinkingMessageId) {
          currentThinkingMessageId = `thinking-${Date.now()}`;
        }
        sendToRenderer('agent:status', { status: 'thinking' as AgentStatus });
        sendToRenderer('agent:message', {
          messageId: currentThinkingMessageId,
          chunk: message.content,
          fullText: message.content,
          type: 'thinking',
          isComplete: false
        });

        // Route thinking to leader widget or subagent widget
        if (leaderManager?.hasLeader()) {
          if (message.parentToolUseId) {
            // Route to sub-agent widget via leader manager
            const subAgent = leaderManager.findSubAgentByToolUseId(message.parentToolUseId);
            if (subAgent) {
              leaderManager.updateSubAgentStatus(subAgent.id, 'thinking');
              leaderManager.sendSubAgentMessage(subAgent.id, 'thinking', message.content);
            }
          } else {
            // Route to leader itself
            leaderManager.sendToLeader('status', { status: 'thinking' });
            leaderManager.sendToLeader('message', {
              type: 'thinking',
              content: message.content,
              timestamp: Date.now()
            });
          }
        } else if (message.parentToolUseId) {
          console.log('[Main] Routing thinking to subagent via parentToolUseId:', message.parentToolUseId);
          streamRouter?.routeStatusByToolUseId('thinking', message.parentToolUseId);
          streamRouter?.routeMessageByToolUseId('thinking', message.content, message.parentToolUseId);
        } else if (streamRouter && streamRouter.getStackDepth() > 0) {
          console.log('[Main] Routing thinking to current agent (fallback)');
          streamRouter.routeStatus('thinking');
          streamRouter.routeMessage('thinking', message.content);
        }
        break;
      }

      case 'tool_use': {
        // Tool use resets text message for next response
        currentTextMessageId = null;
        currentThinkingMessageId = null;
        sendToRenderer('agent:status', { status: 'using_tool' as AgentStatus });
        sendToRenderer('agent:tool-use', {
          toolName: message.toolName || 'Unknown',
          input: message.toolInput || ''
        });

        // Build tool message for widget
        const toolName = message.toolName || 'tool';
        let toolDetail = '';
        if (message.toolInput) {
          try {
            const input = JSON.parse(message.toolInput);
            if (toolName === 'Read' && input.file_path) {
              toolDetail = ` ${input.file_path.split('/').pop()}`;
            } else if (toolName === 'Glob' && input.pattern) {
              toolDetail = ` ${input.pattern}`;
            } else if (toolName === 'Grep' && input.pattern) {
              toolDetail = ` "${input.pattern.substring(0, 20)}"`;
            } else if (toolName === 'Edit' && input.file_path) {
              toolDetail = ` ${input.file_path.split('/').pop()}`;
            } else if (toolName === 'Write' && input.file_path) {
              toolDetail = ` ${input.file_path.split('/').pop()}`;
            } else if (toolName === 'Bash' && input.command) {
              const cmd = input.command.split(' ')[0];
              toolDetail = ` ${cmd}`;
            }
          } catch {
            // Ignore JSON parse errors
          }
        }
        const toolMessage = `${toolName}${toolDetail}`;

        // Route tool use to subagent widget
        // Try parentToolUseId first, fallback to current active agent
        if (message.parentToolUseId) {
          streamRouter?.routeStatusByToolUseId('using_tool', message.parentToolUseId);
          streamRouter?.routeMessageByToolUseId('tool_use', toolMessage, message.parentToolUseId);
        } else if (streamRouter && streamRouter.getStackDepth() > 0) {
          // Fallback: route to current active agent if no parentToolUseId
          streamRouter.routeStatus('using_tool');
          streamRouter.routeMessage('tool_use', toolMessage);
        }
        break;
      }

      case 'result':
        // Reset all message IDs on completion
        currentTextMessageId = null;
        currentThinkingMessageId = null;
        sendToRenderer('agent:status', { status: 'complete' as AgentStatus });
        sendToRenderer('agent:result', {
          result: message.content,
          costUsd: message.costUsd || 0,
          turns: message.turns || 0
        });

        // Route completion to leader widget or StreamRouter
        if (leaderManager?.hasLeader()) {
          leaderManager.sendToLeader('status', { status: 'complete' });
          leaderManager.sendToLeader('result', {
            result: message.content,
            costUsd: message.costUsd || 0,
            turns: message.turns || 0
          });
          leaderManager.sendToLeader('message', {
            type: 'complete',
            content: message.content,
            timestamp: Date.now()
          });
        } else if (streamRouter && streamRouter.getStackDepth() > 0) {
          streamRouter.broadcastStatus('complete');
          streamRouter.broadcastMessage('complete', '');
        }
        break;

      case 'error':
        // Reset all message IDs on error
        currentTextMessageId = null;
        currentThinkingMessageId = null;
        sendToRenderer('agent:status', { status: 'error' as AgentStatus });
        sendToRenderer('agent:error', { error: message.content });

        // Route error to leader widget or subagent widget
        if (leaderManager?.hasLeader()) {
          if (message.parentToolUseId) {
            const subAgent = leaderManager.findSubAgentByToolUseId(message.parentToolUseId);
            if (subAgent) {
              leaderManager.updateSubAgentStatus(subAgent.id, 'error');
              leaderManager.sendSubAgentMessage(subAgent.id, 'speaking', `Error: ${message.content}`);
            }
          } else {
            leaderManager.sendToLeader('status', { status: 'error' });
            leaderManager.sendToLeader('error', { error: message.content });
          }
        } else if (message.parentToolUseId) {
          streamRouter?.routeStatusByToolUseId('error', message.parentToolUseId);
          streamRouter?.routeMessageByToolUseId('speaking', `Error: ${message.content}`, message.parentToolUseId);
        } else if (streamRouter && streamRouter.getStackDepth() > 0) {
          streamRouter.routeError(message.content);
        }
        break;
    }
  });
}

function setupIPC(): void {
  // Select working directory
  ipcMain.handle('dialog:select-directory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select Project Directory',
      buttonLabel: 'Select'
    });

    if (!result.canceled && result.filePaths.length > 0) {
      currentWorkingDirectory = result.filePaths[0];
      // Update TranscriptWatcher with new working directory
      transcriptWatcher?.setWorkingDirectory(currentWorkingDirectory);
      return currentWorkingDirectory;
    }
    return null;
  });

  // Get current working directory
  ipcMain.handle('get-working-directory', () => {
    return currentWorkingDirectory;
  });

  // Send prompt to Claude
  ipcMain.on('control:send-prompt', async (_event, { prompt, workingDirectory }: { prompt: string; workingDirectory?: string }) => {
    const cwd = workingDirectory || currentWorkingDirectory;
    console.log('[Main] Sending prompt:', prompt.substring(0, 50) + '...');
    console.log('[Main] Working directory:', cwd);

    // Reset message IDs for new conversation
    currentTextMessageId = null;
    currentThinkingMessageId = null;

    // Clear previous agent widgets via StreamRouter
    if (streamRouter && streamRouter.getStackDepth() > 0) {
      console.log('[Main] Cleaning up previous agents via StreamRouter');
      streamRouter.clear();
    }

    // Stop all transcript watchers from previous query
    transcriptWatcher?.stopAll();

    // Clear all transcript accumulators
    transcriptAccumulator.clear();

    sendToRenderer('agent:status', { status: 'thinking' as AgentStatus });

    try {
      await claudeService?.query({
        prompt,
        workingDirectory: cwd || undefined
      });
    } catch (error) {
      console.error('[Main] Error sending prompt:', error);
      sendToRenderer('agent:error', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Stop current query
  ipcMain.on('control:stop', () => {
    console.log('[Main] Stopping query');
    claudeService?.stop();
    sendToRenderer('agent:status', { status: 'idle' as AgentStatus });
  });

  // Window ready notification
  ipcMain.on('window:ready', () => {
    console.log('[Main] Window ready');
  });

  // === Widget Team IPC Handlers ===

  // Spawn agent team widgets (for manual team spawning from renderer)
  ipcMain.handle('team:spawn-widgets', async (_event, agents: { id: string; role: AgentRole }[]) => {
    console.log('[Main] Spawning team widgets:', agents);

    const results = [];
    for (const { id, role } of agents) {
      // Use StreamRouter to manage context
      await streamRouter?.pushContext(id, role, true);
      const widget = widgetManager?.hasWidget(id);
      results.push({ id, role, created: widget });
    }
    return results;
  });

  // Send message to specific widget
  ipcMain.on('team:widget-message', (_event, message: WidgetMessage) => {
    console.log('[Main] Widget message:', message.agentId, message.type);
    widgetManager?.sendMessageToWidget(message);
  });

  // Send status to specific widget
  ipcMain.on('team:widget-status', (_event, { agentId, status }: { agentId: string; status: AgentStatus }) => {
    widgetManager?.sendStatusToWidget(agentId, status);
  });

  // Close specific widget
  ipcMain.on('team:close-widget', (_event, agentId: string) => {
    console.log('[Main] Closing widget:', agentId);
    widgetManager?.closeWidget(agentId);
  });

  // Close all widgets
  ipcMain.on('team:close-all-widgets', () => {
    console.log('[Main] Closing all widgets');
    streamRouter?.clear();
  });

  // Get active widget count
  ipcMain.handle('team:get-widget-count', () => {
    return widgetManager?.getWidgetCount() || 0;
  });

  // === OMC Status IPC Handlers ===

  // Get OMC installation status
  ipcMain.handle('omc:get-status', async (_event, workingDirectory?: string) => {
    const cwd = workingDirectory || currentWorkingDirectory || process.cwd();
    return claudeService?.getOMCStatus(cwd) || {
      installed: false,
      version: null,
      skillCount: 0,
      skills: [],
      activeModes: []
    };
  });

  // Initialize OMC
  ipcMain.handle('omc:initialize', async (_event, workingDirectory?: string) => {
    const cwd = workingDirectory || currentWorkingDirectory || process.cwd();
    return claudeService?.initOMC(cwd);
  });
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
    transcriptAccumulator.clear();

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

  // Forward agent events to leader manager for sub-agent widget creation
  claudeService?.on('agentStart', async (event: AgentStartEvent) => {
    if (leaderManager?.hasLeader()) {
      const normalizedRole = normalizeAgentType(event.agentType);
      console.log('[Main] Creating sub-agent widget via leader:', event.agentId, normalizedRole);

      // Create sub-agent widget
      await leaderManager.createSubAgent(event.agentId, normalizedRole, event.toolUseId);

      // Notify leader about new sub-agent
      leaderManager.sendToLeader('subagent-created', {
        agentId: event.agentId,
        role: normalizedRole
      });
    }
  });

  claudeService?.on('agentStop', (event: AgentStopEvent) => {
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

  // Initialize TranscriptWatcher with callbacks
  const workingDir = currentWorkingDirectory || process.cwd();
  transcriptWatcher = createTranscriptWatcher(
    {
      onMessage: (message: TranscriptMessage) => {
        // Only show thinking and text messages (skip tool_use and tool_result for cleaner display)
        if (message.type === 'tool_use' || message.type === 'tool_result') {
          return;
        }

        // Route transcript content to the widget via StreamRouter
        const agentContext = streamRouter?.getAgentContext(message.agentId);
        if (agentContext) {
          // Get or create accumulator for this agent
          let accum = transcriptAccumulator.get(message.agentId);
          if (!accum) {
            accum = { text: '', thinking: '', tool_use: '', tool_result: '' };
            transcriptAccumulator.set(message.agentId, accum);
          }

          // Map transcript message types to widget message types
          let widgetType: 'thinking' | 'speaking';
          let accumulatedContent: string;

          if (message.type === 'thinking') {
            widgetType = 'thinking';
            accum.thinking += message.content + '\n';
            accumulatedContent = accum.thinking;
          } else {
            // text type -> speaking
            widgetType = 'speaking';
            accum.text += message.content + '\n';
            accumulatedContent = accum.text;
          }

          widgetManager?.sendMessageToWidget({
            agentId: message.agentId,
            role: agentContext.normalizedRole,
            type: widgetType,
            content: accumulatedContent.trim(),
            timestamp: Date.now(),
            isNewSection: false
          });
        }
      },
      onError: (error: Error, agentId: string) => {
        console.error('[Main] Transcript error for', agentId, ':', error.message);
      }
    },
    workingDir
  );

  // Initialize Claude service
  setupClaudeService();

  // Setup IPC handlers
  setupIPC();

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
