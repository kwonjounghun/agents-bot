/**
 * Transcript Watcher Service
 *
 * Watches subagent transcript files in real-time and streams
 * content to the corresponding widgets.
 *
 * Transcript location pattern:
 * ~/.claude/projects/{project-slug}/{session-id}/subagents/agent-a{hash}.jsonl
 *
 * Strategy: Watch all subagent files and route messages based on the agentId
 * field embedded in each JSONL line (claude-esp style).
 */

import { readFile, stat, readdir } from 'fs/promises';
import { join } from 'path';
import { parseTranscriptLine, type TranscriptMessage } from './parsers/transcriptLineParser';
import { getSubagentsDir } from './utils/claudeProjectPaths';

// Re-export TranscriptMessage for consumers
export type { TranscriptMessage } from './parsers/transcriptLineParser';

export interface TranscriptWatcherCallbacks {
  onMessage: (message: TranscriptMessage) => void;
  onError?: (error: Error, agentId: string) => void;
}

interface WatcherState {
  lastPosition: number;
  filePath: string;
  agentId: string;
  isActive: boolean;
}

/**
 * Get all agent transcript files in a directory, sorted by creation time
 */
async function getAgentFiles(subagentsDir: string): Promise<{ file: string; path: string; mtime: Date }[]> {
  try {
    const files = await readdir(subagentsDir);

    const agentFiles = files.filter(f =>
      f.startsWith('agent-a') &&
      f.endsWith('.jsonl') &&
      !f.includes('compact')
    );

    const fileStats = await Promise.all(
      agentFiles.map(async (file) => {
        const filePath = join(subagentsDir, file);
        const stats = await stat(filePath);
        return { file, path: filePath, mtime: stats.mtime };
      })
    );

    // Sort by modification time (oldest first - creation order)
    fileStats.sort((a, b) => a.mtime.getTime() - b.mtime.getTime());

    return fileStats;
  } catch {
    return [];
  }
}



/**
 * TranscriptWatcher class manages watching all subagent transcripts
 *
 * Strategy: Watch all files in the subagents directory and route messages
 * based on the agentId embedded in each JSONL line (claude-esp style).
 * No need to guess file-to-agent mapping.
 */
export class TranscriptWatcher {
  private fileStates: Map<string, WatcherState> = new Map();
  private callbacks: TranscriptWatcherCallbacks;
  private workingDirectory: string;
  private pollInterval: NodeJS.Timeout | null = null;
  private readonly POLL_INTERVAL_MS = 500;

  // Cached subagents directory
  private subagentsDir: string | null = null;
  // Track active (not stopped) agents
  private activeAgents: Set<string> = new Set();

  constructor(callbacks: TranscriptWatcherCallbacks, workingDirectory: string) {
    this.callbacks = callbacks;
    this.workingDirectory = workingDirectory;
  }

  /**
   * Start watching for a specific agent's transcript
   * The agent's messages will be identified by agentId in the JSONL content
   */
  async startWatching(agentId: string): Promise<boolean> {
    console.log('[TranscriptWatcher] Start watching for agentId:', agentId);

    // Mark this agent as active
    this.activeAgents.add(agentId);

    // Get subagents directory if not cached
    if (!this.subagentsDir) {
      this.subagentsDir = await getSubagentsDir(this.workingDirectory);
      if (!this.subagentsDir) {
        console.log('[TranscriptWatcher] Could not find subagents directory');
        return false;
      }
      console.log('[TranscriptWatcher] Subagents directory:', this.subagentsDir);
    }

    // Start polling all files
    this.startPolling();

    return true;
  }

  /**
   * Stop watching a specific agent
   */
  stopWatching(agentId: string): void {
    this.activeAgents.delete(agentId);
    console.log('[TranscriptWatcher] Stopped watching agentId:', agentId);

    // Stop polling if no more active agents
    if (this.activeAgents.size === 0 && this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      this.fileStates.clear();
    }
  }

  /**
   * Stop all watchers
   */
  stopAll(): void {
    this.activeAgents.clear();
    this.fileStates.clear();
    this.subagentsDir = null;

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    console.log('[TranscriptWatcher] Stopped all watchers');
  }

  /**
   * Start polling for changes in all subagent files
   */
  private startPolling(): void {
    if (this.pollInterval) {
      return;
    }

    this.pollInterval = setInterval(async () => {
      await this.pollAllFiles();
    }, this.POLL_INTERVAL_MS);

    // Do initial poll
    this.pollAllFiles();
  }

  /**
   * Poll all subagent files for new content
   */
  private async pollAllFiles(): Promise<void> {
    if (!this.subagentsDir) return;

    const files = await getAgentFiles(this.subagentsDir);

    for (const fileInfo of files) {
      await this.checkFileForNewContent(fileInfo.path);
    }
  }

  /**
   * Check a file for new content and emit messages with embedded agentId
   */
  private async checkFileForNewContent(filePath: string): Promise<void> {
    try {
      const stats = await stat(filePath);
      const fileSize = stats.size;

      // Get or create file state
      let fileState = this.fileStates.get(filePath);
      if (!fileState) {
        fileState = {
          lastPosition: 0,
          filePath,
          agentId: '', // Not used - agentId comes from JSONL content
          isActive: true
        };
        this.fileStates.set(filePath, fileState);
      }

      if (fileSize <= fileState.lastPosition) {
        return; // No new content
      }

      // Read new content
      const content = await readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      // Process new lines
      let currentPosition = 0;
      for (const line of lines) {
        currentPosition += line.length + 1; // +1 for newline

        if (currentPosition <= fileState.lastPosition) {
          continue;
        }

        const messages = parseTranscriptLine(line);
        for (const message of messages) {
          // Use agentId from JSONL content (already extracted by parseTranscriptLine)
          // Only emit if this agent is being watched
          if (message.agentId && this.activeAgents.has(message.agentId)) {
            this.callbacks.onMessage(message);
          }
        }
      }

      fileState.lastPosition = fileSize;
    } catch (error) {
      // File might not exist yet, which is fine
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error('[TranscriptWatcher] Error reading file:', filePath, error);
      }
    }
  }

  /**
   * Update working directory
   */
  setWorkingDirectory(workingDirectory: string): void {
    this.workingDirectory = workingDirectory;
    this.subagentsDir = null; // Reset cached directory
  }
}

/**
 * Create a new TranscriptWatcher instance
 */
export function createTranscriptWatcher(
  callbacks: TranscriptWatcherCallbacks,
  workingDirectory: string
): TranscriptWatcher {
  return new TranscriptWatcher(callbacks, workingDirectory);
}
