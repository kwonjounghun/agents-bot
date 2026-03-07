/**
 * Transcript Watcher Service
 *
 * Watches subagent transcript files in real-time and streams
 * content to the corresponding widgets.
 *
 * Transcript location pattern:
 * ~/.claude/projects/{project-slug}/{session-id}/subagents/agent-a{hash}.jsonl
 *
 * Strategy: Watch the subagents directory and assign new files to agents
 * in the order they start.
 */

import { readFile, stat, readdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

export interface TranscriptMessage {
  type: 'text' | 'thinking' | 'tool_use' | 'tool_result';
  content: string;
  agentId: string;
  /** Tool name for tool_use/tool_result messages */
  toolName?: string;
  /** Tool use ID for correlation */
  toolUseId?: string;
}

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
 * Get the Claude projects directory
 */
function getClaudeProjectsDir(): string {
  return join(homedir(), '.claude', 'projects');
}

/**
 * Convert a working directory path to a Claude project slug
 * Claude replaces ALL non-alphanumeric characters with hyphens
 * e.g., /Users/foo/Documents/02_side-projects/scope -> -Users-foo-Documents-02-side-projects-scope
 */
function getProjectSlug(workingDirectory: string): string {
  // Replace all non-alphanumeric characters with hyphens (same as Claude)
  return workingDirectory.replace(/[^a-zA-Z0-9]/g, '-');
}

/**
 * Find the most recent session directory for a project
 */
async function findLatestSessionDir(projectDir: string): Promise<string | null> {
  try {
    const entries = await readdir(projectDir, { withFileTypes: true });

    // Filter for UUID-like directories (session IDs)
    const sessionDirs = entries.filter(e =>
      e.isDirectory() &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(e.name)
    );

    if (sessionDirs.length === 0) {
      return null;
    }

    // Get stats for each directory and sort by modification time
    const dirStats = await Promise.all(
      sessionDirs.map(async (dir) => {
        const dirPath = join(projectDir, dir.name);
        const stats = await stat(dirPath);
        return { name: dir.name, mtime: stats.mtime };
      })
    );

    dirStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    return dirStats[0]?.name || null;
  } catch {
    return null;
  }
}

/**
 * Get the subagents directory for the current session
 */
async function getSubagentsDir(workingDirectory: string): Promise<string | null> {
  const projectsDir = getClaudeProjectsDir();
  const projectSlug = getProjectSlug(workingDirectory);
  const projectDir = join(projectsDir, projectSlug);

  const sessionId = await findLatestSessionDir(projectDir);
  if (!sessionId) {
    console.log('[TranscriptWatcher] No session directory found for project:', projectSlug);
    return null;
  }

  return join(projectDir, sessionId, 'subagents');
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
 * Format tool input for display (ESP-style)
 */
function formatToolInput(toolName: string, input: unknown): string {
  if (!input || typeof input !== 'object') {
    return String(input || '');
  }

  const inputObj = input as Record<string, unknown>;

  // Tool-specific formatting
  switch (toolName) {
    case 'Read':
      return inputObj.file_path as string || '';
    case 'Write':
      return `${inputObj.file_path || ''} (${String(inputObj.content || '').length} chars)`;
    case 'Edit':
      return inputObj.file_path as string || '';
    case 'Bash':
      return inputObj.command as string || '';
    case 'Glob':
      return `${inputObj.pattern || ''} in ${inputObj.path || '.'}`;
    case 'Grep':
      return `"${inputObj.pattern || ''}" in ${inputObj.path || '.'}`;
    case 'Task':
      return `${inputObj.subagent_type || 'agent'}: ${String(inputObj.prompt || '').substring(0, 100)}...`;
    case 'WebFetch':
      return inputObj.url as string || '';
    case 'WebSearch':
      return inputObj.query as string || '';
    default:
      // Generic: show first few key-value pairs
      const entries = Object.entries(inputObj).slice(0, 3);
      return entries.map(([k, v]) => `${k}=${String(v).substring(0, 50)}`).join(', ');
  }
}

/**
 * Parse a single JSONL line from the transcript (ESP-style)
 * Returns multiple messages if the line contains multiple content blocks
 */
function parseTranscriptLine(line: string): TranscriptMessage[] {
  if (!line.trim()) {
    return [];
  }

  try {
    const entry = JSON.parse(line);
    const messages: TranscriptMessage[] = [];

    // Process assistant messages (thinking, text, tool_use)
    if (entry.type === 'assistant' && entry.message?.content) {
      const content = entry.message.content;
      if (!Array.isArray(content)) {
        return [];
      }

      for (const block of content) {
        if (block.type === 'text' && block.text) {
          messages.push({
            type: 'text',
            content: block.text,
            agentId: ''
          });
        }
        if (block.type === 'thinking' && block.thinking) {
          messages.push({
            type: 'thinking',
            content: block.thinking,
            agentId: ''
          });
        }
        if (block.type === 'tool_use' && block.name) {
          const formattedInput = formatToolInput(block.name, block.input);
          messages.push({
            type: 'tool_use',
            content: formattedInput,
            agentId: '',
            toolName: block.name,
            toolUseId: block.id
          });
        }
      }
    }

    // Process user messages (tool_result)
    if (entry.type === 'user' && entry.message?.content) {
      const content = entry.message.content;
      if (!Array.isArray(content)) {
        return [];
      }

      for (const block of content) {
        if (block.type === 'tool_result' && block.tool_use_id) {
          let resultContent = '';
          if (typeof block.content === 'string') {
            resultContent = block.content;
          } else if (Array.isArray(block.content)) {
            for (const contentBlock of block.content) {
              if (contentBlock.type === 'text' && contentBlock.text) {
                resultContent += contentBlock.text;
              }
            }
          }

          if (resultContent.length > 500) {
            resultContent = resultContent.substring(0, 500) + '... (truncated)';
          }

          messages.push({
            type: 'tool_result',
            content: resultContent,
            agentId: '',
            toolUseId: block.tool_use_id
          });
        }
      }
    }

    return messages;
  } catch {
    return [];
  }
}

/**
 * TranscriptWatcher class manages watching multiple subagent transcripts
 */
export class TranscriptWatcher {
  private watchers: Map<string, WatcherState> = new Map();
  private callbacks: TranscriptWatcherCallbacks;
  private workingDirectory: string;
  private pollInterval: NodeJS.Timeout | null = null;
  private readonly POLL_INTERVAL_MS = 500;

  // Track which files are already assigned to agents
  private assignedFiles: Set<string> = new Set();
  // Queue of agents waiting for file assignment
  private pendingAgents: string[] = [];
  // Cached subagents directory
  private subagentsDir: string | null = null;

  constructor(callbacks: TranscriptWatcherCallbacks, workingDirectory: string) {
    this.callbacks = callbacks;
    this.workingDirectory = workingDirectory;
  }

  /**
   * Start watching a subagent's transcript
   */
  async startWatching(agentId: string): Promise<boolean> {
    if (this.watchers.has(agentId)) {
      console.log('[TranscriptWatcher] Already watching:', agentId);
      return true;
    }

    console.log('[TranscriptWatcher] Start watching requested for:', agentId);

    // Get subagents directory if not cached
    if (!this.subagentsDir) {
      this.subagentsDir = await getSubagentsDir(this.workingDirectory);
      if (!this.subagentsDir) {
        console.log('[TranscriptWatcher] Could not find subagents directory');
        return false;
      }
      console.log('[TranscriptWatcher] Subagents directory:', this.subagentsDir);
    }

    // Try to find an unassigned file for this agent
    const assigned = await this.tryAssignFile(agentId);
    if (!assigned) {
      // No file yet, add to pending queue
      this.pendingAgents.push(agentId);
      console.log('[TranscriptWatcher] Agent added to pending queue:', agentId);
    }

    // Start polling (also checks for new files)
    this.startPolling();

    return true;
  }

  /**
   * Try to assign an unassigned file to an agent
   */
  private async tryAssignFile(agentId: string): Promise<boolean> {
    if (!this.subagentsDir) return false;

    const files = await getAgentFiles(this.subagentsDir);

    // Find first file that isn't already assigned
    for (const fileInfo of files) {
      if (!this.assignedFiles.has(fileInfo.path)) {
        // Assign this file to the agent
        this.assignedFiles.add(fileInfo.path);

        const state: WatcherState = {
          lastPosition: 0,
          filePath: fileInfo.path,
          agentId,
          isActive: true
        };

        this.watchers.set(agentId, state);
        console.log('[TranscriptWatcher] Assigned file to agent:', agentId, '->', fileInfo.file);

        // Do initial read
        await this.checkForNewContent(state);

        return true;
      }
    }

    return false;
  }

  /**
   * Stop watching a subagent's transcript
   */
  stopWatching(agentId: string): void {
    const state = this.watchers.get(agentId);
    if (state) {
      state.isActive = false;
      this.assignedFiles.delete(state.filePath);
      this.watchers.delete(agentId);
      console.log('[TranscriptWatcher] Stopped watching:', agentId);
    }

    // Remove from pending queue if present
    const pendingIdx = this.pendingAgents.indexOf(agentId);
    if (pendingIdx >= 0) {
      this.pendingAgents.splice(pendingIdx, 1);
    }

    // Stop polling if no more watchers and no pending
    if (this.watchers.size === 0 && this.pendingAgents.length === 0 && this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  /**
   * Stop all watchers
   */
  stopAll(): void {
    for (const [agentId] of this.watchers) {
      this.stopWatching(agentId);
    }
    this.pendingAgents = [];
    this.assignedFiles.clear();
    this.subagentsDir = null;

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  /**
   * Start polling for changes
   */
  private startPolling(): void {
    if (this.pollInterval) {
      return;
    }

    this.pollInterval = setInterval(async () => {
      // Check for new files for pending agents
      while (this.pendingAgents.length > 0) {
        const agentId = this.pendingAgents[0];
        const assigned = await this.tryAssignFile(agentId);
        if (assigned) {
          this.pendingAgents.shift();
        } else {
          break; // No more files available
        }
      }

      // Check for new content in watched files
      for (const [, state] of this.watchers) {
        if (state.isActive) {
          await this.checkForNewContent(state);
        }
      }
    }, this.POLL_INTERVAL_MS);
  }

  /**
   * Check for new content in a transcript file
   */
  private async checkForNewContent(state: WatcherState): Promise<void> {
    try {
      const stats = await stat(state.filePath);
      const fileSize = stats.size;

      if (fileSize <= state.lastPosition) {
        return; // No new content
      }

      // Read new content
      const content = await readFile(state.filePath, 'utf-8');
      const lines = content.split('\n');

      // Process new lines
      let currentPosition = 0;
      for (const line of lines) {
        currentPosition += line.length + 1; // +1 for newline

        if (currentPosition <= state.lastPosition) {
          continue;
        }

        const messages = parseTranscriptLine(line);
        for (const message of messages) {
          message.agentId = state.agentId;
          this.callbacks.onMessage(message);
        }
      }

      state.lastPosition = fileSize;
    } catch (error) {
      // File might not exist yet, which is fine
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.callbacks.onError?.(error as Error, state.agentId);
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
