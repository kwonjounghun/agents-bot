/**
 * Claude Agent Service
 *
 * This service orchestrates the Claude Agent SDK interactions.
 * It uses composed single-responsibility modules for specific tasks.
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
  parseSlashCommand,
  loadSkillDefinition,
  buildFinalPrompt,
  buildOmcAgentContext,
  type ProcessedPrompt
} from './services/promptProcessor';
import {
  buildBaseHooks,
  mergeHooks,
  buildQueryOptions,
  type AgentStartEvent,
  type AgentStopEvent
} from './services/hookBuilder';

// External OMC integration
import {
  detectOMCInstallation,
  getOMCStatus,
  initializeOMC,
  createOMCHooks,
  getAvailableSkills,
  type OMCStatus
} from './omc';

// SDK-OMC (built-in OMC implementation)
import * as SdkOmc from '../sdk-omc';
import type { OmcSdkOptions, ExecutionResult, SkillMode } from '../sdk-omc/types';
import {
  PersistentModeExecutor,
  createPersistentModeExecutor,
  type QueryResult
} from '../sdk-omc/executor';

// OMC state
let omcHooks: any = null;
let omcInitialized = false;

export interface ClaudeAgentMessage {
  type: 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'result' | 'error';
  content: string;
  toolName?: string;
  toolInput?: string;
  costUsd?: number;
  turns?: number;
}

export { AgentStartEvent, AgentStopEvent };

export class ClaudeAgentService extends EventEmitter {
  private abortController: AbortController | null = null;
  private isRunning: boolean = false;
  private currentWorkingDirectory: string = process.cwd();
  private sdkOmcEnabled: boolean = false;
  private persistentExecutor: PersistentModeExecutor | null = null;
  private lastQueryResponse: string = '';
  private lastToolsUsed: string[] = [];

  constructor() {
    super();
  }

  /**
   * Enable SDK-OMC mode (use built-in OMC implementation)
   */
  enableSdkOmc(): void {
    this.sdkOmcEnabled = true;
    console.log('[ClaudeAgentService] SDK-OMC mode enabled');
  }

  /**
   * Check if SDK-OMC mode is enabled
   */
  isSdkOmcEnabled(): boolean {
    return this.sdkOmcEnabled;
  }

  /**
   * Initialize SDK-OMC (built-in implementation)
   */
  async initSdkOmc(workingDirectory?: string): Promise<{
    success: boolean;
    activeModes: string[];
    agents: string[];
    skills: string[];
  }> {
    const cwd = workingDirectory || this.currentWorkingDirectory;
    console.log('[ClaudeAgentService] Initializing SDK-OMC...');

    const result = await SdkOmc.initializeOmc(cwd, { debug: true });

    if (result.success) {
      omcHooks = SdkOmc.createOmcHooks();
      omcInitialized = true;
      this.sdkOmcEnabled = true;

      console.log('[ClaudeAgentService] SDK-OMC initialized');
      console.log(`  Agents: ${result.agents.length}`);
      console.log(`  Skills: ${result.skills.length}`);
      console.log(`  Active modes: ${result.activeModes.join(', ') || 'none'}`);
    }

    return result;
  }

  /**
   * Get SDK-OMC query options for direct SDK usage
   */
  getSdkOmcQueryOptions(options: OmcSdkOptions = {}): ReturnType<typeof SdkOmc.createOmcQueryOptions> {
    return SdkOmc.createOmcQueryOptions({
      workingDirectory: this.currentWorkingDirectory,
      ...options
    });
  }

  /**
   * Process prompt using SDK-OMC keyword detection
   */
  processSdkOmcPrompt(prompt: string): ReturnType<typeof SdkOmc.processOmcPrompt> {
    return SdkOmc.processOmcPrompt(prompt);
  }

  /**
   * Get SDK-OMC status
   */
  async getSdkOmcStatus(): Promise<Awaited<ReturnType<typeof SdkOmc.getOmcStatus>>> {
    return SdkOmc.getOmcStatus(this.currentWorkingDirectory);
  }

  /**
   * Get SDK-OMC agents for subagent configuration
   */
  getSdkOmcAgents(): typeof SdkOmc.omcAgents {
    return SdkOmc.omcAgents;
  }

  /**
   * Initialize OMC modules and hooks
   */
  async initOMC(workingDirectory?: string): Promise<OMCStatus> {
    if (omcInitialized && omcHooks) {
      return getOMCStatus(workingDirectory || this.currentWorkingDirectory);
    }

    console.log('[ClaudeAgentService] Initializing OMC...');

    const result = await initializeOMC();

    if (result.success) {
      omcHooks = await createOMCHooks({
        workingDirectory: workingDirectory || this.currentWorkingDirectory,
        onSkillActivated: (skill, args) => {
          console.log(`[ClaudeAgentService] Skill activated: ${skill}`);
          this.emit('omcSkillActivated', { skill, args });
        },
        onModeChanged: (mode, active) => {
          console.log(`[ClaudeAgentService] Mode changed: ${mode} (${active ? 'active' : 'inactive'})`);
          this.emit('omcModeChanged', { mode, active });
        },
        onKeywordsDetected: (keywords) => {
          console.log(`[ClaudeAgentService] Keywords detected: ${keywords.map((k: any) => k.type).join(', ')}`);
          this.emit('omcKeywordsDetected', { keywords });
        }
      });

      omcInitialized = true;
      console.log('[ClaudeAgentService] OMC initialized:', result.status.version);
    } else {
      console.log('[ClaudeAgentService] OMC initialization failed:', result.error);
    }

    return result.status;
  }

  /**
   * Get OMC status for UI display
   */
  getOMCStatus(workingDirectory?: string): OMCStatus {
    return getOMCStatus(workingDirectory || this.currentWorkingDirectory);
  }

  /**
   * Process OMC commands and return transformed prompt with skill context
   */
  private processOMCCommand(prompt: string): ProcessedPrompt {
    const installation = detectOMCInstallation();

    if (!installation.isInstalled) {
      return { prompt };
    }

    const command = parseSlashCommand(prompt);

    if (!command) {
      return { prompt };
    }

    const availableSkills = getAvailableSkills(installation);

    if (!availableSkills.includes(command.skill)) {
      console.log(`[ClaudeAgentService] Unknown skill: ${command.skill}`);
      return { prompt };
    }

    console.log(`[ClaudeAgentService] Processing skill: ${command.skill}`);

    const skillDef = loadSkillDefinition(command.skill, installation.skillsPath || '');
    if (skillDef) {
      const skillContext = `[OMC Skill Activated: ${command.skill}]\n\n${skillDef}`;
      return {
        prompt: command.args || `Execute the ${command.skill} skill`,
        skillContext
      };
    }

    return { prompt: command.args || prompt };
  }

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

    console.log('[ClaudeAgentService] Starting query');
    console.log('[ClaudeAgentService] Working directory:', this.currentWorkingDirectory);
    console.log('[ClaudeAgentService] Model:', model || 'default');

    // Initialize OMC if not already done
    if (!omcInitialized) {
      if (this.sdkOmcEnabled) {
        await this.initSdkOmc(this.currentWorkingDirectory);
      } else {
        await this.initOMC(this.currentWorkingDirectory);
      }
    }

    // Process OMC commands (skill loading)
    const { prompt, skillContext } = this.processOMCCommand(rawPrompt);
    if (skillContext) {
      console.log('[ClaudeAgentService] OMC skill context loaded');
    }

    // Process SDK-OMC keywords if enabled
    let sdkOmcContext = '';
    if (this.sdkOmcEnabled) {
      const omcResult = this.processSdkOmcPrompt(rawPrompt);
      if (omcResult.suggestedMode) {
        console.log('[ClaudeAgentService] SDK-OMC mode detected:', omcResult.suggestedMode);
      }

      // Build OMC agent context
      const agents = this.getSdkOmcAgents();
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
      const finalHooks = mergeHooks(baseHooks, omcHooks);

      // Build query options
      const queryOpts = buildQueryOptions({
        workingDirectory: this.currentWorkingDirectory,
        model,
        abortController: this.abortController,
        hooks: finalHooks,
        agents: this.sdkOmcEnabled ? this.getSdkOmcAgents() : undefined
      });

      if (this.sdkOmcEnabled) {
        console.log('[ClaudeAgentService] SDK-OMC agents registered:', Object.keys(queryOpts.agents || {}).length);
      }

      const queryIterator = sdk.query({
        prompt: finalPrompt,
        options: queryOpts as any
      });

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

    // Handle array of messages (e.g., multiple tool uses in assistant message)
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
      turns: parsed.turns
    } as ClaudeAgentMessage);
  }

  /**
   * Stop the current query
   */
  stop(): void {
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

  /**
   * Execute a persistent mode (Ralph, Autopilot, etc.)
   * This implements the persistent execution loop that continues until completion.
   */
  async executePersistentMode(
    mode: SkillMode,
    task: string,
    options?: { maxIterations?: number; requireVerification?: boolean }
  ): Promise<ExecutionResult> {
    // Initialize OMC if needed
    if (!omcInitialized && this.sdkOmcEnabled) {
      await this.initSdkOmc(this.currentWorkingDirectory);
    }

    // Create executor if not exists
    if (!this.persistentExecutor) {
      this.persistentExecutor = createPersistentModeExecutor(
        this.currentWorkingDirectory,
        this.createQueryFunction(),
        options
      );

      // Forward executor events
      this.persistentExecutor.on('modeStarted', (data) => {
        this.emit('persistentModeStarted', data);
        this.emit('message', {
          type: 'text',
          content: `[${mode.toUpperCase()}] Started - ${task}`
        } as ClaudeAgentMessage);
      });

      this.persistentExecutor.on('iterationStarted', (data) => {
        this.emit('persistentIterationStarted', data);
        this.emit('message', {
          type: 'text',
          content: `[${mode.toUpperCase()}] Iteration ${data.iteration}/${data.maxIterations}`
        } as ClaudeAgentMessage);
      });

      this.persistentExecutor.on('iterationCompleted', (data) => {
        this.emit('persistentIterationCompleted', data);
      });

      this.persistentExecutor.on('completionChecked', (data) => {
        this.emit('persistentCompletionChecked', data);
        if (data.checkResult.isComplete) {
          this.emit('message', {
            type: 'text',
            content: `[${mode.toUpperCase()}] Completion detected, verifying...`
          } as ClaudeAgentMessage);
        }
      });

      this.persistentExecutor.on('verificationCompleted', (data) => {
        this.emit('persistentVerificationCompleted', data);
        this.emit('message', {
          type: 'text',
          content: `[${mode.toUpperCase()}] Verification: ${data.approved ? 'APPROVED' : 'REJECTED'}`
        } as ClaudeAgentMessage);
      });

      this.persistentExecutor.on('modeCompleted', (data) => {
        this.emit('persistentModeCompleted', data);
        this.emit('message', {
          type: 'result',
          content: `[${mode.toUpperCase()}] Completed after ${data.iteration} iterations`
        } as ClaudeAgentMessage);
      });

      this.persistentExecutor.on('modeEnded', (data) => {
        this.emit('persistentModeEnded', data);
      });
    }

    // Execute the appropriate mode
    switch (mode) {
      case 'ralph':
        return this.persistentExecutor.executeRalph(task);
      case 'autopilot':
        return this.persistentExecutor.executeAutopilot(task);
      default:
        return {
          success: false,
          mode,
          iterations: 0,
          error: `Persistent execution not implemented for mode: ${mode}`
        };
    }
  }

  /**
   * Execute Ralph mode - persistent loop until task completion
   */
  async executeRalph(task: string): Promise<ExecutionResult> {
    return this.executePersistentMode('ralph', task);
  }

  /**
   * Execute Autopilot mode - full autonomous execution
   */
  async executeAutopilot(goal: string): Promise<ExecutionResult> {
    return this.executePersistentMode('autopilot', goal);
  }

  /**
   * Stop persistent mode execution
   */
  stopPersistentMode(): void {
    if (this.persistentExecutor) {
      this.persistentExecutor.stop();
    }
    this.stop();
  }

  /**
   * Check if persistent mode is running
   */
  isPersistentModeRunning(): boolean {
    return this.persistentExecutor?.getIsRunning() || false;
  }

  /**
   * Create a query function for the persistent executor
   */
  private createQueryFunction(): (prompt: string) => Promise<QueryResult> {
    return async (prompt: string): Promise<QueryResult> => {
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

        // Execute query
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
