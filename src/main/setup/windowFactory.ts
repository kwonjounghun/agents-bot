/**
 * Window Factory
 * Single Responsibility: Create and configure the main application window
 *
 * Handles window creation, positioning, and content loading.
 */

import { BrowserWindow, screen } from 'electron';
import { join } from 'path';

/**
 * Window configuration options
 */
export interface WindowConfig {
  /** Window width in pixels */
  width: number;
  /** Window height in pixels */
  height: number;
  /** Offset from right edge of screen */
  rightOffset: number;
  /** Offset from top of screen */
  topOffset: number;
  /** Path to preload script (relative to __dirname) */
  preloadPath: string;
}

const DEFAULT_CONFIG: WindowConfig = {
  width: 500,
  height: 700,
  rightOffset: 20,
  topOffset: 20,
  preloadPath: '../preload/index.cjs',
};

/**
 * Create the main application window
 *
 * @param config - Optional window configuration overrides
 * @returns Configured BrowserWindow instance
 */
export async function createMainWindow(
  config: Partial<WindowConfig> = {}
): Promise<BrowserWindow> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  console.log('[WindowFactory] Creating main window...');

  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;

  const win = new BrowserWindow({
    width: finalConfig.width,
    height: finalConfig.height,
    x: screenWidth - finalConfig.width - finalConfig.rightOffset,
    y: finalConfig.topOffset,
    frame: true,
    alwaysOnTop: false,
    resizable: true,
    skipTaskbar: false,
    hasShadow: true,
    show: true,
    webPreferences: {
      preload: join(__dirname, finalConfig.preloadPath),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  setupWindowEventHandlers(win);
  await loadWindowContent(win);

  return win;
}

/**
 * Setup event handlers for window lifecycle
 */
function setupWindowEventHandlers(win: BrowserWindow): void {
  win.once('ready-to-show', () => {
    console.log('[WindowFactory] Window ready to show');
    win.show();
  });

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('[WindowFactory] Failed to load:', errorCode, errorDescription);
  });

  win.webContents.on('did-finish-load', () => {
    console.log('[WindowFactory] Page finished loading');
  });
}

/**
 * Load appropriate content based on environment
 */
async function loadWindowContent(win: BrowserWindow): Promise<void> {
  try {
    if (process.env.NODE_ENV === 'development') {
      const url = process.env.ELECTRON_RENDERER_URL || 'http://localhost:5173';
      console.log('[WindowFactory] Loading renderer from:', url);
      await win.loadURL(url);
    } else {
      const filePath = join(__dirname, '../renderer/index.html');
      console.log('[WindowFactory] Loading file:', filePath);
      await win.loadFile(filePath);
    }
    console.log('[WindowFactory] Load completed');
  } catch (error) {
    console.error('[WindowFactory] Error loading window:', error);
    win.show();
  }
}
