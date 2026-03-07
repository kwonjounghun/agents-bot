import { app, BrowserWindow, ipcMain, screen, dialog } from 'electron';
import { join } from 'path';
import { ClaudeAgentService, ClaudeAgentMessage, AgentStartEvent, AgentStopEvent } from './claudeAgentService';
import { WidgetManager } from './widgetManager';
import type { AgentStatus, AgentRole, WidgetMessage, OMCStatusInfo } from '../shared/types';

// Disable sandbox for macOS compatibility
app.commandLine.appendSwitch('no-sandbox');

let mainWindow: BrowserWindow | null = null;
let claudeService: ClaudeAgentService | null = null;
let widgetManager: WidgetManager | null = null;
let currentWorkingDirectory: string | null = null;

// Track current message IDs for streaming accumulation
let currentTextMessageId: string | null = null;
let currentThinkingMessageId: string | null = null;

// Team state tracking
interface TeamAgent {
  id: string;
  role: AgentRole;
}
let activeTeamAgents: TeamAgent[] = [];
let currentAgentIndex = 0;
let lastAgentSwitchTime = 0;
const AGENT_SWITCH_INTERVAL = 3000; // Switch agent every 3 seconds of thinking

// SDK agent_id to widget mapping (for auto-detected agents)
const agentIdToWidget: Map<string, TeamAgent> = new Map();
let widgetSpawnIndex = 0;

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

// Get current agent for round-robin message routing
function getCurrentAgent(): TeamAgent | null {
  if (activeTeamAgents.length === 0) return null;
  return activeTeamAgents[currentAgentIndex];
}

// Switch to next agent (round-robin)
function switchToNextAgent(): void {
  if (activeTeamAgents.length === 0) return;
  currentAgentIndex = (currentAgentIndex + 1) % activeTeamAgents.length;
  lastAgentSwitchTime = Date.now();
}

// Check if we should switch agents based on time
function maybeSwitch(): void {
  const now = Date.now();
  if (now - lastAgentSwitchTime > AGENT_SWITCH_INTERVAL) {
    switchToNextAgent();
  }
}

// Send message to current active widget
function sendToActiveWidget(type: 'thinking' | 'speaking' | 'tool_use' | 'complete', content: string): void {
  const agent = getCurrentAgent();
  if (!agent) return;

  const widgetMessage: WidgetMessage = {
    agentId: agent.id,
    role: agent.role,
    type,
    content,
    timestamp: Date.now()
  };

  widgetManager?.sendMessageToWidget(widgetMessage);
}

// Send thinking message to ALL widgets (so all agents appear to be thinking)
function sendToAllWidgets(type: 'thinking' | 'speaking' | 'tool_use' | 'complete', content: string): void {
  activeTeamAgents.forEach(agent => {
    const widgetMessage: WidgetMessage = {
      agentId: agent.id,
      role: agent.role,
      type,
      content,
      timestamp: Date.now()
    };
    widgetManager?.sendMessageToWidget(widgetMessage);
  });
}

// Update status of current active widget
function updateActiveWidgetStatus(status: AgentStatus): void {
  const agent = getCurrentAgent();
  if (!agent) return;
  widgetManager?.sendStatusToWidget(agent.id, status);
}

// Update all widgets with a status
function updateAllWidgetsStatus(status: AgentStatus): void {
  activeTeamAgents.forEach(agent => {
    widgetManager?.sendStatusToWidget(agent.id, status);
  });
}

function setupClaudeService(): void {
  claudeService = new ClaudeAgentService();

  // Enable SDK-OMC mode (built-in OMC implementation)
  claudeService.enableSdkOmc();
  console.log('[Main] SDK-OMC enabled');

  // Auto-detect agent starts from SDK hooks
  claudeService.on('agentStart', async (event: AgentStartEvent) => {
    // Normalize the agent type from SDK format to our known agent names
    const normalizedRole = normalizeAgentType(event.agentType);
    console.log('[Main] Agent started (auto-detected):', event.agentType, '->', normalizedRole, event.agentId);

    // Check if we already have this agent
    if (agentIdToWidget.has(event.agentId)) {
      console.log('[Main] Agent already tracked, updating status');
      const agent = agentIdToWidget.get(event.agentId)!;
      widgetManager?.sendStatusToWidget(agent.id, 'thinking');
      return;
    }

    // Create new widget for this agent
    const widgetAgent: TeamAgent = {
      id: event.agentId,
      role: normalizedRole
    };

    // Track the agent
    agentIdToWidget.set(event.agentId, widgetAgent);
    activeTeamAgents.push(widgetAgent);

    // Spawn widget
    const widget = await widgetManager?.createWidget(event.agentId, normalizedRole, widgetSpawnIndex++);
    console.log('[Main] Created widget for agent:', normalizedRole, 'windowId:', widget?.id);

    // Send initial thinking status
    widgetManager?.sendStatusToWidget(event.agentId, 'thinking');

    // Notify renderer about new team member
    sendToRenderer('team:agent-joined', { agentId: event.agentId, role: normalizedRole });
  });

  // Auto-detect agent stops from SDK hooks
  claudeService.on('agentStop', (event: AgentStopEvent) => {
    console.log('[Main] Agent stopped (auto-detected):', event.agentId);

    const agent = agentIdToWidget.get(event.agentId);
    if (agent) {
      // Mark as complete
      widgetManager?.sendStatusToWidget(event.agentId, 'complete');
      widgetManager?.sendMessageToWidget({
        agentId: event.agentId,
        role: agent.role,
        type: 'complete',
        content: 'Task completed',
        timestamp: Date.now()
      });

      // Notify renderer
      sendToRenderer('team:agent-completed', { agentId: event.agentId, role: agent.role });
    }
  });

  // Handle available agents list from system init
  claudeService.on('agentsAvailable', (agents: string[]) => {
    console.log('[Main] Agents available from SDK:', agents);
    sendToRenderer('team:agents-available', { agents });
  });

  claudeService.on('message', (message: ClaudeAgentMessage) => {
    const hasTeam = activeTeamAgents.length > 0;

    switch (message.type) {
      case 'text':
        // Create new message ID only if we don't have one yet
        if (!currentTextMessageId) {
          currentTextMessageId = `text-${Date.now()}`;
          // Switch agent when starting new text block
          if (hasTeam) {
            switchToNextAgent();
            updateActiveWidgetStatus('responding');
          }
        }
        sendToRenderer('agent:status', { status: 'responding' as AgentStatus });
        sendToRenderer('agent:message', {
          messageId: currentTextMessageId,
          chunk: message.content,
          fullText: message.content,
          type: 'text',
          isComplete: false
        });

        // Stream to active widget
        if (hasTeam) {
          sendToActiveWidget('speaking', message.content);
        }
        break;

      case 'thinking':
        // Create new message ID only if we don't have one yet
        if (!currentThinkingMessageId) {
          currentThinkingMessageId = `thinking-${Date.now()}`;
          // Set all widgets to thinking status
          if (hasTeam) {
            updateAllWidgetsStatus('thinking');
          }
        }
        sendToRenderer('agent:status', { status: 'thinking' as AgentStatus });
        sendToRenderer('agent:message', {
          messageId: currentThinkingMessageId,
          chunk: message.content,
          fullText: message.content,
          type: 'thinking',
          isComplete: false
        });

        // Broadcast thinking to ALL widgets (so all agents appear to think together)
        if (hasTeam) {
          sendToAllWidgets('thinking', message.content);
        }
        break;

      case 'tool_use':
        // Tool use resets text message for next response
        currentTextMessageId = null;
        currentThinkingMessageId = null;
        sendToRenderer('agent:status', { status: 'using_tool' as AgentStatus });
        sendToRenderer('agent:tool-use', {
          toolName: message.toolName || 'Unknown',
          input: message.toolInput || ''
        });

        // Update widget with tool use
        if (hasTeam) {
          switchToNextAgent();
          updateActiveWidgetStatus('using_tool');
          sendToActiveWidget('tool_use', `Using ${message.toolName || 'tool'}...`);
        }
        break;

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

        // Mark all widgets as complete
        if (hasTeam) {
          updateAllWidgetsStatus('complete');
          activeTeamAgents.forEach(agent => {
            widgetManager?.sendMessageToWidget({
              agentId: agent.id,
              role: agent.role,
              type: 'complete',
              content: '',
              timestamp: Date.now()
            });
          });
        }
        break;

      case 'error':
        // Reset all message IDs on error
        currentTextMessageId = null;
        currentThinkingMessageId = null;
        sendToRenderer('agent:status', { status: 'error' as AgentStatus });
        sendToRenderer('agent:error', { error: message.content });

        // Mark all widgets as error
        if (hasTeam) {
          updateAllWidgetsStatus('error');
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

    // Reset auto-detection state (close old widgets from previous run)
    if (agentIdToWidget.size > 0) {
      console.log('[Main] Cleaning up previous auto-detected agents');
      widgetManager?.closeAllWidgets();
      agentIdToWidget.clear();
      activeTeamAgents = [];
      widgetSpawnIndex = 0;
    }

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

  // Spawn agent team widgets
  ipcMain.handle('team:spawn-widgets', async (_event, agents: { id: string; role: AgentRole }[]) => {
    console.log('[Main] Spawning team widgets:', agents);

    // Track active team agents for message routing
    activeTeamAgents = agents.map(a => ({ id: a.id, role: a.role }));
    currentAgentIndex = 0;
    lastAgentSwitchTime = Date.now();

    const results = [];
    for (let i = 0; i < agents.length; i++) {
      const { id, role } = agents[i];
      const widget = await widgetManager?.createWidget(id, role, i);
      results.push({ id, role, windowId: widget?.id });
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
    widgetManager?.closeAllWidgets();
    // Clear team state
    activeTeamAgents = [];
    currentAgentIndex = 0;
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
  widgetManager?.closeAllWidgets();
  claudeService?.stop();
});
