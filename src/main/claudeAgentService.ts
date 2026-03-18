/**
 * Claude Agent Service
 *
 * This service orchestrates the Claude Agent SDK interactions.
 * With settingSources: ["user", "project"], the SDK automatically loads
 * agents, hooks, skills, and CLAUDE.md from the filesystem.
 */

import { EventEmitter } from 'events';
import { execSync } from 'child_process';
import type { QueryOptions } from '../shared/types';

// Import single-responsibility modules
import { getSDK } from './services/sdkLoader';
import {
  parseMessage,
  isMessageArray,
  type ParsedMessage
} from './services/messageParser';
import {
  buildBaseHooks,
  buildQueryOptions,
  type AgentStartEvent,
  type AgentStopEvent,
} from './services/hookBuilder';

// Composed services
import {
  PersistentModeService,
  createPersistentModeService,
  type QueryFunction
} from './services/persistentModeService';

// Types
import type { ExecutionResult, SkillMode } from '../sdk-omc/types';

export interface ClaudeAgentMessage {
  type: 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'result' | 'error';
  content: string;
  toolName?: string;
  toolInput?: string;
  costUsd?: number;
  turns?: number;
  /** Tool use ID that spawned the subagent (for routing to correct widget) */
  parentToolUseId?: string;
}

export { AgentStartEvent, AgentStopEvent };

export class ClaudeAgentService extends EventEmitter {
  private abortController: AbortController | null = null;
  private currentQuery: AsyncGenerator<unknown, void, unknown> | null = null;
  private isRunning: boolean = false;
  private currentWorkingDirectory: string = process.cwd();

  // Composed services
  private persistentModeService: PersistentModeService | null = null;

  constructor() {
    super();
  }

  // ============================================
  // Core Query Execution
  // ============================================

  /**
   * Send a query to Claude Agent SDK and stream responses
   */
  async query(options: QueryOptions): Promise<void> {
    if (this.isRunning) {
      this.stop();
    }

    this.isRunning = true;
    this.abortController = new AbortController();

    const { prompt, workingDirectory, model, continue: continueConversation } = options;
    this.currentWorkingDirectory = workingDirectory || process.cwd();

    try {
      const sdk = await getSDK();

      // Build base hooks for agent tracking
      const baseHooks = buildBaseHooks({
        onAgentStart: (event) => {
          this.emit('agentStart', event);
        },
        onAgentStop: (event) => {
          this.emit('agentStop', event);
        }
      });

      // Build query options (settingSources handles agents/hooks/skills automatically)
      const claudePath = execSync('which claude', { encoding: 'utf-8' }).trim();
      const queryOpts = buildQueryOptions({
        workingDirectory: this.currentWorkingDirectory,
        model,
        abortController: this.abortController,
        hooks: baseHooks,
        continue: continueConversation,
        pathToClaudeCodeExecutable: claudePath
      });

      const queryIterator = sdk.query({
        prompt,
        options: queryOpts as any
      });

      // Store query iterator for proper cleanup on stop
      this.currentQuery = queryIterator;

      for await (const message of queryIterator) {
        if (this.abortController?.signal.aborted) {
          break;
        }

        this.processMessage(message);
      }

    } catch (error) {
      this.emit('message', {
        type: 'error',
        content: error instanceof Error ? error.message : 'Unknown error occurred'
      } as ClaudeAgentMessage);
    } finally {
      this.isRunning = false;
      this.abortController = null;
      this.currentQuery = null;
    }
  }

  /**
   * Process SDK messages and emit simplified events
   */
  private processMessage(message: unknown): void {
    const parsed = parseMessage(message);

    if (!parsed) {
      return;
    }

    // Handle array of messages
    if (isMessageArray(parsed)) {
      for (const msg of parsed) {
        this.emitParsedMessage(msg);
      }
      return;
    }

    this.emitParsedMessage(parsed);
  }

  /**
   * Emit a parsed message to listeners
   */
  private emitParsedMessage(parsed: ParsedMessage): void {
    if (parsed.type === 'system' && parsed.agents) {
      this.emit('agentsAvailable', parsed.agents);
      return;
    }

    if (parsed.type === 'skip') {
      return;
    }

    this.emit('message', {
      type: parsed.type,
      content: parsed.content || '',
      toolName: parsed.toolName,
      toolInput: parsed.toolInput,
      costUsd: parsed.costUsd,
      turns: parsed.turns,
      parentToolUseId: parsed.parentToolUseId
    } as ClaudeAgentMessage);
  }

  /**
   * Stop the current query
   */
  stop(): void {
    // Close query iterator first for proper resource cleanup
    if (this.currentQuery) {
      try {
        this.currentQuery.return(undefined);
      } catch (e) {
        // ignore
      }
      this.currentQuery = null;
    }

    // Then abort the controller
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.isRunning = false;
  }

  /**
   * Check if a query is currently running
   */
  isQueryRunning(): boolean {
    return this.isRunning;
  }

  // ============================================
  // Persistent Mode Execution
  // ============================================

  /**
   * Execute a persistent mode (Ralph, Autopilot, etc.)
   */
  async executePersistentMode(
    mode: SkillMode,
    task: string,
    options?: { maxIterations?: number; requireVerification?: boolean }
  ): Promise<ExecutionResult> {
    // Create persistent mode service if not exists
    if (!this.persistentModeService) {
      this.persistentModeService = createPersistentModeService(
        {
          workingDirectory: this.currentWorkingDirectory,
          ...options
        },
        this.createQueryFunction()
      );

      // Forward events with message emission
      this.setupPersistentModeEventForwarding(mode);
    }

    return this.persistentModeService.execute(mode, task, options);
  }

  /**
   * Setup persistent mode event forwarding
   */
  private setupPersistentModeEventForwarding(mode: SkillMode): void {
    if (!this.persistentModeService) return;

    this.persistentModeService.on('modeStarted', (data) => {
      this.emit('persistentModeStarted', data);
      this.emit('message', {
        type: 'text',
        content: `[${mode.toUpperCase()}] Started - ${data.task}`
      } as ClaudeAgentMessage);
    });

    this.persistentModeService.on('iterationStarted', (data) => {
      this.emit('persistentIterationStarted', data);
      this.emit('message', {
        type: 'text',
        content: `[${mode.toUpperCase()}] Iteration ${data.iteration}/${data.maxIterations}`
      } as ClaudeAgentMessage);
    });

    this.persistentModeService.on('iterationCompleted', (data) => {
      this.emit('persistentIterationCompleted', data);
    });

    this.persistentModeService.on('completionChecked', (data) => {
      this.emit('persistentCompletionChecked', data);
      if (data.checkResult.isComplete) {
        this.emit('message', {
          type: 'text',
          content: `[${mode.toUpperCase()}] Completion detected, verifying...`
        } as ClaudeAgentMessage);
      }
    });

    this.persistentModeService.on('verificationCompleted', (data) => {
      this.emit('persistentVerificationCompleted', data);
      this.emit('message', {
        type: 'text',
        content: `[${mode.toUpperCase()}] Verification: ${data.approved ? 'APPROVED' : 'REJECTED'}`
      } as ClaudeAgentMessage);
    });

    this.persistentModeService.on('modeCompleted', (data) => {
      this.emit('persistentModeCompleted', data);
      this.emit('message', {
        type: 'result',
        content: `[${mode.toUpperCase()}] Completed after ${data.iteration} iterations`
      } as ClaudeAgentMessage);
    });

    this.persistentModeService.on('modeEnded', (data) => {
      this.emit('persistentModeEnded', data);
    });
  }

  stopPersistentMode(): void {
    if (this.persistentModeService) {
      this.persistentModeService.stop();
    }
    this.stop();
  }

  isPersistentModeRunning(): boolean {
    return this.persistentModeService?.isRunning() || false;
  }

  /**
   * Create a query function for the persistent executor
   */
  private createQueryFunction(): QueryFunction {
    return async (prompt: string) => {
      let queryResponse = '';
      const toolsUsed: string[] = [];

      return new Promise((resolve) => {
        const messageHandler = (msg: ClaudeAgentMessage) => {
          if (msg.type === 'text' || msg.type === 'thinking') {
            queryResponse += msg.content;
          }
          if (msg.type === 'tool_use' && msg.toolName) {
            toolsUsed.push(msg.toolName);
          }
          if (msg.type === 'result') {
            queryResponse += msg.content;
          }
          if (msg.type === 'error') {
            this.removeListener('message', messageHandler);
            resolve({
              success: false,
              response: queryResponse,
              toolsUsed,
              error: msg.content
            });
          }
        };

        this.on('message', messageHandler);

        this.query({
          prompt,
          workingDirectory: this.currentWorkingDirectory
        }).then(() => {
          this.removeListener('message', messageHandler);
          resolve({
            success: true,
            response: queryResponse,
            toolsUsed
          });
        }).catch((error) => {
          this.removeListener('message', messageHandler);
          resolve({
            success: false,
            response: queryResponse,
            toolsUsed,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        });
      });
    };
  }
}
