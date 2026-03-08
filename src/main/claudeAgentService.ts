/**
 * Claude Agent Service
 *
 * This service orchestrates the Claude Agent SDK interactions.
 * Uses composed single-responsibility modules for specific tasks.
 */

import { EventEmitter } from 'events';
import type { QueryOptions } from '../shared/types';

// Import single-responsibility modules
import { getSDK } from './services/sdkLoader';
import {
  parseMessage,
  isMessageArray,
  type ParsedMessage
} from './services/messageParser';
import {
  buildFinalPrompt,
  buildOmcAgentContext
} from './services/promptProcessor';
import {
  buildBaseHooks,
  mergeHooks,
  buildQueryOptions,
  type AgentStartEvent,
  type AgentStopEvent
} from './services/hookBuilder';

// Composed services
import {
  OMCIntegration,
  createOMCIntegration
} from './services/omcIntegration';
import {
  PersistentModeService,
  createPersistentModeService,
  type QueryFunction
} from './services/persistentModeService';

// Types
import type { ExecutionResult, SkillMode } from '../sdk-omc/types';
import type { OMCStatus } from './omc';

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
  private omcIntegration: OMCIntegration;
  private persistentModeService: PersistentModeService | null = null;

  // For persistent mode query accumulation
  private lastQueryResponse: string = '';
  private lastToolsUsed: string[] = [];

  constructor() {
    super();
    this.omcIntegration = createOMCIntegration({
      workingDirectory: this.currentWorkingDirectory
    });
    this.setupOMCEventForwarding();
  }

  /**
   * Setup OMC event forwarding to service listeners
   */
  private setupOMCEventForwarding(): void {
    this.omcIntegration.on('skillActivated', (data) => {
      this.emit('omcSkillActivated', data);
    });
    this.omcIntegration.on('modeChanged', (data) => {
      this.emit('omcModeChanged', data);
    });
    this.omcIntegration.on('keywordsDetected', (data) => {
      this.emit('omcKeywordsDetected', data);
    });
  }

  // ============================================
  // OMC Integration (delegated to OMCIntegration)
  // ============================================

  enableSdkOmc(): void {
    this.omcIntegration.enable();
  }

  isSdkOmcEnabled(): boolean {
    return this.omcIntegration.isEnabled();
  }

  async initSdkOmc(workingDirectory?: string): Promise<{
    success: boolean;
    activeModes: string[];
    agents: string[];
    skills: string[];
  }> {
    const cwd = workingDirectory || this.currentWorkingDirectory;
    this.omcIntegration.setWorkingDirectory(cwd);
    return this.omcIntegration.initializeSdk(cwd);
  }

  getSdkOmcQueryOptions(options = {}): ReturnType<typeof this.omcIntegration.getQueryOptions> {
    return this.omcIntegration.getQueryOptions(options);
  }

  processSdkOmcPrompt(prompt: string): ReturnType<typeof this.omcIntegration.processPrompt> {
    return this.omcIntegration.processPrompt(prompt);
  }

  async getSdkOmcStatus(): Promise<Awaited<ReturnType<typeof this.omcIntegration.getStatus>>> {
    return this.omcIntegration.getStatus();
  }

  getSdkOmcAgents(): ReturnType<typeof this.omcIntegration.getAgents> {
    return this.omcIntegration.getAgents();
  }

  async initOMC(workingDirectory?: string): Promise<OMCStatus> {
    const cwd = workingDirectory || this.currentWorkingDirectory;
    this.omcIntegration.setWorkingDirectory(cwd);
    return this.omcIntegration.initializeExternal(cwd);
  }

  getOMCStatus(workingDirectory?: string): OMCStatus {
    return this.omcIntegration.getExternalStatus(workingDirectory || this.currentWorkingDirectory);
  }

  // ============================================
  // Core Query Execution
  // ============================================

  /**
   * Send a query to Claude Agent SDK and stream responses
   */
  async query(options: QueryOptions): Promise<void> {
    if (this.isRunning) {
      console.log('[ClaudeAgentService] Already running, stopping previous query');
      this.stop();
    }

    this.isRunning = true;
    this.abortController = new AbortController();

    const { prompt: rawPrompt, workingDirectory, model } = options;
    this.currentWorkingDirectory = workingDirectory || process.cwd();
    this.omcIntegration.setWorkingDirectory(this.currentWorkingDirectory);

    console.log('[ClaudeAgentService] Starting query');
    console.log('[ClaudeAgentService] Working directory:', this.currentWorkingDirectory);
    console.log('[ClaudeAgentService] Model:', model || 'default');

    // Initialize OMC if not already done
    if (!this.omcIntegration.isInitialized()) {
      if (this.omcIntegration.isEnabled()) {
        await this.omcIntegration.initializeSdk(this.currentWorkingDirectory);
      } else {
        await this.omcIntegration.initializeExternal(this.currentWorkingDirectory);
      }
    }

    // Process OMC commands (skill loading)
    const { prompt, skillContext } = this.omcIntegration.processCommand(rawPrompt);
    if (skillContext) {
      console.log('[ClaudeAgentService] OMC skill context loaded');
    }

    // Process SDK-OMC keywords if enabled
    let sdkOmcContext = '';
    if (this.omcIntegration.isEnabled()) {
      const omcResult = this.omcIntegration.processPrompt(rawPrompt);
      if (omcResult.suggestedMode) {
        console.log('[ClaudeAgentService] SDK-OMC mode detected:', omcResult.suggestedMode);
      }

      // Build OMC agent context
      const agents = this.omcIntegration.getAgents();
      sdkOmcContext = buildOmcAgentContext(agents, omcResult.suggestedMode || undefined);
    }

    try {
      const sdk = await getSDK();
      console.log('[ClaudeAgentService] SDK loaded, creating query iterator...');

      // Build the final prompt with contexts
      const finalPrompt = buildFinalPrompt(prompt, skillContext, sdkOmcContext);
      console.log('[ClaudeAgentService] Final prompt length:', finalPrompt.length);

      // Build base hooks for agent tracking
      const baseHooks = buildBaseHooks({
        onAgentStart: (event) => {
          console.log('[ClaudeAgentService] SubagentStart:', event.agentType, event.agentId);
          this.emit('agentStart', event);
        },
        onAgentStop: (event) => {
          console.log('[ClaudeAgentService] SubagentStop:', event.agentId);
          this.emit('agentStop', event);
        }
      });

      // Merge OMC hooks with base hooks
      const finalHooks = mergeHooks(baseHooks, this.omcIntegration.getHooks());

      // Build query options
      const queryOpts = buildQueryOptions({
        workingDirectory: this.currentWorkingDirectory,
        model,
        abortController: this.abortController,
        hooks: finalHooks,
        agents: this.omcIntegration.isEnabled() ? this.omcIntegration.getAgents() : undefined
      });

      if (this.omcIntegration.isEnabled()) {
        console.log('[ClaudeAgentService] SDK-OMC agents registered:', Object.keys(queryOpts.agents || {}).length);
      }

      const queryIterator = sdk.query({
        prompt: finalPrompt,
        options: queryOpts as any
      });

      // Store query iterator for proper cleanup on stop
      this.currentQuery = queryIterator;

      console.log('[ClaudeAgentService] Query iterator created, starting message loop...');
      let messageCount = 0;

      for await (const message of queryIterator) {
        messageCount++;
        console.log('[ClaudeAgentService] Message #' + messageCount + ':', (message as any).type, (message as any).subtype || '');

        if (this.abortController?.signal.aborted) {
          console.log('[ClaudeAgentService] Query aborted');
          break;
        }

        this.processMessage(message);
      }

      console.log('[ClaudeAgentService] Message loop ended. Total messages:', messageCount);

    } catch (error) {
      console.error('[ClaudeAgentService] Query error:', error);
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
      console.log('[ClaudeAgentService] Available agents:', parsed.agents);
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
        // Call return() to properly close the async generator
        this.currentQuery.return(undefined);
      } catch (e) {
        console.log('[ClaudeAgentService] Error closing query:', e);
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
    // Initialize OMC if needed
    if (!this.omcIntegration.isInitialized() && this.omcIntegration.isEnabled()) {
      await this.omcIntegration.initializeSdk(this.currentWorkingDirectory);
    }

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

  async executeRalph(task: string): Promise<ExecutionResult> {
    return this.executePersistentMode('ralph', task);
  }

  async executeAutopilot(goal: string): Promise<ExecutionResult> {
    return this.executePersistentMode('autopilot', goal);
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
      this.lastQueryResponse = '';
      this.lastToolsUsed = [];

      return new Promise((resolve) => {
        const messageHandler = (msg: ClaudeAgentMessage) => {
          if (msg.type === 'text' || msg.type === 'thinking') {
            this.lastQueryResponse += msg.content;
          }
          if (msg.type === 'tool_use' && msg.toolName) {
            this.lastToolsUsed.push(msg.toolName);
          }
          if (msg.type === 'result') {
            this.lastQueryResponse += msg.content;
          }
          if (msg.type === 'error') {
            this.removeListener('message', messageHandler);
            resolve({
              success: false,
              response: this.lastQueryResponse,
              toolsUsed: this.lastToolsUsed,
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
            response: this.lastQueryResponse,
            toolsUsed: this.lastToolsUsed
          });
        }).catch((error) => {
          this.removeListener('message', messageHandler);
          resolve({
            success: false,
            response: this.lastQueryResponse,
            toolsUsed: this.lastToolsUsed,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        });
      });
    };
  }
}
