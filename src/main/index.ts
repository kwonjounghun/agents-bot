import { app, BrowserWindow, ipcMain, screen, dialog } from 'electron';
import { join } from 'path';
import { ClaudeAgentService, ClaudeAgentMessage } from './claudeAgentService';
import type { AgentStatus } from '../shared/types';

// Disable sandbox for macOS compatibility
app.commandLine.appendSwitch('no-sandbox');

let mainWindow: BrowserWindow | null = null;
let claudeService: ClaudeAgentService | null = null;
let currentWorkingDirectory: string | null = null;

// Track current message IDs for streaming accumulation
let currentTextMessageId: string | null = null;
let currentThinkingMessageId: string | null = null;

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

  claudeService.on('message', (message: ClaudeAgentMessage) => {
    switch (message.type) {
      case 'text':
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
        break;

      case 'thinking':
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
        break;

      case 'error':
        // Reset all message IDs on error
        currentTextMessageId = null;
        currentThinkingMessageId = null;
        sendToRenderer('agent:status', { status: 'error' as AgentStatus });
        sendToRenderer('agent:error', { error: message.content });
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
}

console.log('[Main] Waiting for app ready...');
app.whenReady().then(async () => {
  console.log('[Main] App is ready!');

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
  claudeService?.stop();
});
