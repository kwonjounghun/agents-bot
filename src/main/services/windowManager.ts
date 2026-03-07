/**
 * Window Manager Service
 *
 * Manages BrowserWindow creation and IPC communication.
 * Single responsibility: window lifecycle and renderer communication.
 */

import { BrowserWindow, screen } from 'electron';
import { join } from 'path';

export interface WindowManagerConfig {
  width?: number;
  height?: number;
  alwaysOnTop?: boolean;
  preloadPath?: string;
}

const DEFAULT_CONFIG: WindowManagerConfig = {
  width: 500,
  height: 700,
  alwaysOnTop: true
};

/**
 * Window Manager Service
 *
 * Creates and manages the main application window.
 */
export class WindowManagerService {
  private mainWindow: BrowserWindow | null = null;
  private config: WindowManagerConfig;

  constructor(config: WindowManagerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Create the main application window
   */
  async create(): Promise<BrowserWindow> {
    console.log('[WindowManager] Creating main window...');

    const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;

    const win = new BrowserWindow({
      width: this.config.width,
      height: this.config.height,
      x: screenWidth - (this.config.width || 500) - 20,
      y: 20,
      frame: true,
      alwaysOnTop: this.config.alwaysOnTop,
      resizable: true,
      skipTaskbar: false,
      hasShadow: true,
      show: true,
      webPreferences: {
        preload: this.config.preloadPath || join(__dirname, '../preload/index.cjs'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    win.once('ready-to-show', () => {
      console.log('[WindowManager] Window ready to show');
      win.show();
    });

    win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
      console.error('[WindowManager] Failed to load:', errorCode, errorDescription);
    });

    win.webContents.on('did-finish-load', () => {
      console.log('[WindowManager] Page finished loading');
    });

    // Load the renderer
    try {
      if (process.env.NODE_ENV === 'development') {
        const url = process.env.ELECTRON_RENDERER_URL || 'http://localhost:5173';
        console.log('[WindowManager] Loading renderer from:', url);
        await win.loadURL(url);
      } else {
        const filePath = join(__dirname, '../renderer/index.html');
        console.log('[WindowManager] Loading file:', filePath);
        await win.loadFile(filePath);
      }
      console.log('[WindowManager] Load completed');
    } catch (error) {
      console.error('[WindowManager] Error loading window:', error);
      win.show();
    }

    this.mainWindow = win;
    return win;
  }

  /**
   * Get the main window instance
   */
  get(): BrowserWindow | null {
    return this.mainWindow;
  }

  /**
   * Check if the main window exists and is not destroyed
   */
  isValid(): boolean {
    return this.mainWindow !== null && !this.mainWindow.isDestroyed();
  }

  /**
   * Send data to the renderer process
   */
  sendToRenderer(channel: string, data: unknown): void {
    if (this.isValid()) {
      this.mainWindow!.webContents.send(channel, data);
    }
  }

  /**
   * Close the main window
   */
  close(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.close();
    }
    this.mainWindow = null;
  }

  /**
   * Set closed callback
   */
  onClosed(callback: () => void): void {
    if (this.mainWindow) {
      this.mainWindow.on('closed', callback);
    }
  }
}

/**
 * Create a window manager service instance
 */
export function createWindowManager(config?: WindowManagerConfig): WindowManagerService {
  return new WindowManagerService(config);
}
