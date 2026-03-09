import fs from 'fs';
import path from 'path';
import os from 'os';
import { AppConfig } from './types.js';

const CONFIG_DIR = '.obsidian-logger';
const CONFIG_FILE = 'config.json';
const SYNC_FILE = 'synced.json';

export function getConfigDir(): string {
  return path.join(os.homedir(), CONFIG_DIR);
}

function ensureConfigDir(): void {
  const dir = getConfigDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function loadConfig(): AppConfig {
  const configPath = path.join(getConfigDir(), CONFIG_FILE);
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(raw) as AppConfig;
  } catch {
    return {
      obsidian: {
        apiUrl: 'https://localhost:27124',
        apiKey: '',
        vaultPath: 'AI Sessions',
      },
      claudeProjectsDir: path.join(os.homedir(), '.claude', 'projects'),
      syncedSessions: {},
    };
  }
}

export function saveConfig(config: AppConfig): void {
  ensureConfigDir();
  const configPath = path.join(getConfigDir(), CONFIG_FILE);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

export function isSessionSynced(sessionId: string): boolean {
  const state = loadSyncState();
  return sessionId in state;
}

export function markSessionSynced(sessionId: string): void {
  const state = loadSyncState();
  state[sessionId] = new Date().toISOString();
  saveSyncState(state);
}

export function loadSyncState(): Record<string, string> {
  const syncPath = path.join(getConfigDir(), SYNC_FILE);
  try {
    const raw = fs.readFileSync(syncPath, 'utf-8');
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

export function saveSyncState(state: Record<string, string>): void {
  ensureConfigDir();
  const syncPath = path.join(getConfigDir(), SYNC_FILE);
  fs.writeFileSync(syncPath, JSON.stringify(state, null, 2), 'utf-8');
}
