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
 *
 * ============================================================================
 * IMPORTANT: ID 매칭 관련 주의사항
 * ============================================================================
 * SDK agentId와 JSONL/파일경로 agentId는 형식이 다릅니다!
 * 자세한 내용은 src/main/services/utils/agentIdMatcher.ts 참조
 *
 * - SDK agentId: 전체 UUID/긴 해시 (예: "toolu_01ABCdef123456")
 * - JSONL agentId: 7자리 짧은 해시 (예: "ab215e8")
 * - 파일 경로: agent-a<hash>.jsonl (예: agent-a1b2c3d4e5f6.jsonl)
 *
 * 반드시 agentIdMatcher.ts의 매칭 함수를 사용하세요!
 * ============================================================================
 *
 * ============================================================================
 * CRITICAL: 캐시 초기화 관련 - 절대 삭제하지 마세요! (7번째 버그 수정)
 * ============================================================================
 * startWatching() 메서드에서 다음 3가지 캐시를 반드시 초기화해야 합니다:
 *
 * 1. this.lastDirScan = 0
 *    - 이유: 디렉토리 스캔은 5초(DIR_SCAN_INTERVAL_MS)마다만 실행됩니다.
 *    - 문제: 새 에이전트가 시작되면 새 JSONL 파일이 생성되지만,
 *           다음 스캔까지 5초를 기다려야 파일을 발견합니다.
 *    - 해결: lastDirScan을 0으로 리셋하면 즉시 디렉토리를 재스캔합니다.
 *
 * 2. this.subagentsDir = null
 *    - 이유: 세션이 바뀌면 subagents 디렉토리 경로도 바뀝니다.
 *           (예: .../session-abc/subagents -> .../session-xyz/subagents)
 *    - 문제: subagentsDir가 캐시되어 있으면 이전 세션 디렉토리를
 *           계속 스캔하여 새 세션의 파일을 찾지 못합니다.
 *    - 해결: subagentsDir를 null로 리셋하면 getSubagentsDir()가
 *           최신 세션 디렉토리를 다시 찾습니다.
 *
 * 3. this.cachedFiles.clear()
 *    - 이유: cachedFiles는 이전 세션의 파일 경로를 포함합니다.
 *    - 문제: 세션이 바뀌면 이전 파일들은 더 이상 유효하지 않습니다.
 *    - 해결: cachedFiles를 클리어하면 새 세션의 파일만 추적합니다.
 *
 * 이 3가지 초기화 중 하나라도 빠지면:
 * - 서브에이전트 메시지가 UI에 표시되지 않습니다.
 * - "NEW CONTENT DETECTED" 로그가 나타나지 않습니다.
 * - 디버깅이 매우 어렵습니다 (파일은 있지만 콘텐츠가 안 보임).
 *
 * 관련 버그 히스토리:
 * - 1~6차: ID 매칭 문제로 잘못 분석
 * - 7차: 캐시 초기화 문제 발견 및 수정 (이 주석 추가)
 * ============================================================================
 */

import { open, stat, readdir } from 'fs/promises';
import { join } from 'path';
import type { FileHandle } from 'fs/promises';
import { parseTranscriptLine, type TranscriptMessage } from './parsers/transcriptLineParser';
import { findAgentTranscriptFile } from './utils/claudeProjectPaths';
import {
  extractAgentIdFromFilePath,
  findMatchingAgentId,
  resolveEffectiveAgentId,
} from './utils/agentIdMatcher';

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
  /** Partial line buffer for handling incomplete reads */
  partialLine: string;
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
  private readonly DIR_SCAN_INTERVAL_MS = 5000; // Scan for new files every 5s

  // Cached subagents directory (fallback only)
  private subagentsDir: string | null = null;
  // Track active (not stopped) agents
  private activeAgents: Set<string> = new Set();
  // Agents whose JSONL file has not been found yet — searched each poll cycle
  private pendingAgents: Set<string> = new Set();
  // Direct mapping: transcriptAgentId (short hash) -> SDK agentId
  private transcriptIdMap: Map<string, string> = new Map();
  // Direct mapping: filePath -> SDK agentId
  private fileAgentMap: Map<string, string> = new Map();
  // Cached file list to avoid readdir on every poll
  private cachedFiles: Set<string> = new Set();
  private lastDirScan: number = 0;

  constructor(callbacks: TranscriptWatcherCallbacks, workingDirectory: string) {
    this.callbacks = callbacks;
    this.workingDirectory = workingDirectory;
  }

  /**
   * Start watching for a specific agent's transcript
   *
   * @param agentId - SDK agentId (long UUID/hash from agentStart event)
   * @param transcriptAgentId - Short hash from transcript path (e.g., "a1b2c3d")
   * @param transcriptFilePath - Full path to the agent's JSONL file (most reliable).
   *                             When provided, the file is watched directly —
   *                             no directory scanning, no ID matching needed.
   */
  async startWatching(agentId: string, transcriptAgentId?: string, transcriptFilePath?: string): Promise<boolean> {
    if (!agentId) {
      return false;
    }

    this.activeAgents.add(agentId);

    if (transcriptFilePath) {
      // SDK provided the exact path — register directly, no searching needed
      this.fileAgentMap.set(transcriptFilePath, agentId);
      this.cachedFiles.add(transcriptFilePath);
    } else {
      // SDK did not provide path — search all session dirs by agent ID each poll cycle
      // This avoids all getSubagentsDir timing/session-contamination issues
      this.pendingAgents.add(agentId);
      if (transcriptAgentId) {
        this.transcriptIdMap.set(transcriptAgentId, agentId);
      }
    }

    this.startPolling();
    return true;
  }

  /**
   * Search all session directories for JSONL files matching pending agents.
   * Called once per poll cycle. Moves found agents from pendingAgents -> fileAgentMap.
   */
  private async resolvePendingAgents(): Promise<void> {
    if (this.pendingAgents.size === 0) return;

    for (const agentId of this.pendingAgents) {
      const filePath = await findAgentTranscriptFile(this.workingDirectory, agentId);
      if (filePath) {
        this.fileAgentMap.set(filePath, agentId);
        this.cachedFiles.add(filePath);
        this.pendingAgents.delete(agentId);
      }
    }
  }

  /**
   * Stop watching a specific agent
   */
  stopWatching(agentId: string): void {
    this.activeAgents.delete(agentId);
    this.pendingAgents.delete(agentId);
    for (const [transcriptId, sdkId] of this.transcriptIdMap) {
      if (sdkId === agentId) this.transcriptIdMap.delete(transcriptId);
    }
    for (const [filePath, sdkId] of this.fileAgentMap) {
      if (sdkId === agentId) {
        this.fileAgentMap.delete(filePath);
        this.cachedFiles.delete(filePath);
      }
    }
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
    this.pendingAgents.clear();
    this.transcriptIdMap.clear();
    this.fileAgentMap.clear();
    this.fileStates.clear();
    this.cachedFiles.clear();
    this.subagentsDir = null;

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
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
   * Optimized: only re-scan directory periodically, not on every poll
   */
  private async pollAllFiles(): Promise<void> {
    // Resolve pending agents first (search all session dirs by agent ID)
    await this.resolvePendingAgents();

    // Allow polling if we have directly registered files, pending agents being resolved,
    // or a subagentsDir fallback
    if (!this.subagentsDir && this.cachedFiles.size === 0) {
      return;
    }

    const now = Date.now();

    // Only re-scan directory periodically to find new files (only when using directory-scan fallback)
    if (this.subagentsDir && now - this.lastDirScan > this.DIR_SCAN_INTERVAL_MS) {
      const files = await getAgentFiles(this.subagentsDir);
      for (const fileInfo of files) {
        this.cachedFiles.add(fileInfo.path);
      }
      this.lastDirScan = now;
    }

    // Process cached files in parallel for better performance
    const filePaths = Array.from(this.cachedFiles);
    await Promise.all(filePaths.map(path => this.checkFileForNewContent(path)));
  }

  /**
   * Check a file for new content and emit messages with embedded agentId
   * Optimized: Read only new bytes from last position, not entire file
   */
  private async checkFileForNewContent(filePath: string): Promise<void> {
    let fileHandle: FileHandle | null = null;

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
          isActive: true,
          partialLine: ''
        };
        this.fileStates.set(filePath, fileState);
      }

      if (fileSize <= fileState.lastPosition) {
        return;
      }

      // Read only new bytes from the last position
      const bytesToRead = fileSize - fileState.lastPosition;
      const buffer = Buffer.alloc(bytesToRead);

      fileHandle = await open(filePath, 'r');
      await fileHandle.read(buffer, 0, bytesToRead, fileState.lastPosition);
      await fileHandle.close();
      fileHandle = null;

      // Combine with any partial line from previous read
      const newContent = fileState.partialLine + buffer.toString('utf-8');
      const lines = newContent.split('\n');

      // The last element might be an incomplete line (no trailing newline)
      // Save it for the next read
      fileState.partialLine = lines.pop() || '';

      // Extract agentId from file path (claude-esp pattern 4)
      // 중요: 파일 경로의 agentId가 JSONL보다 신뢰할 수 있음
      // 자세한 내용은 utils/agentIdMatcher.ts 참조
      const fileAgentId = extractAgentIdFromFilePath(filePath);

      // Process complete lines
      for (const line of lines) {
        if (!line.trim()) continue;

        const messages = parseTranscriptLine(line);

        for (const message of messages) {
          // 유효한 agentId 결정 (JSONL > 파일경로 우선순위)
          const effectiveAgentId = resolveEffectiveAgentId(message.agentId, fileAgentId);

          // 1. Direct file-path lookup (most reliable — set when transcriptFilePath is known)
          let matchedSdkId = this.fileAgentMap.get(filePath) || null;

          // 2. Direct transcript ID map lookup
          if (!matchedSdkId) {
            matchedSdkId = this.transcriptIdMap.get(effectiveAgentId) || null;
          }

          // 3. Fallback: fuzzy matching between SDK ID formats
          if (!matchedSdkId) {
            matchedSdkId = findMatchingAgentId(this.activeAgents, effectiveAgentId);
          }

          if (matchedSdkId) {
            // 매칭된 SDK agentId로 메시지 전달 (라우팅 일관성 유지)
            message.agentId = matchedSdkId;
            this.callbacks.onMessage(message);
          }
        }
      }

      fileState.lastPosition = fileSize;
    } catch (error) {
      // Clean up file handle on error
      if (fileHandle) {
        try { await fileHandle.close(); } catch { /* ignore */ }
      }
      // File might not exist yet, which is fine
    }
  }

  /**
   * Update working directory
   */
  setWorkingDirectory(workingDirectory: string): void {
    this.workingDirectory = workingDirectory;
    this.subagentsDir = null; // Reset cached directory
    this.cachedFiles.clear(); // Clear cached file list
    this.lastDirScan = 0; // Force directory re-scan
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
