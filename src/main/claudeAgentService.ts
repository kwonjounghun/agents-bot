import { EventEmitter } from 'events';
import type { QueryOptions } from '../shared/types';
import {
  detectOMCInstallation,
  getOMCStatus,
  initializeOMC,
  createOMCHooks,
  mergeHooks,
  getAvailableSkills,
  type OMCStatus,
  type SDKHooks
} from './omc';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// SDK-OMC (built-in OMC implementation)
import * as SdkOmc from '../sdk-omc';
import type { OmcSdkOptions } from '../sdk-omc/types';

// Dynamic import for ES module SDK
let sdkModule: typeof import('@anthropic-ai/claude-agent-sdk') | null = null;

async function getSDK() {
  if (!sdkModule) {
    sdkModule = await import('@anthropic-ai/claude-agent-sdk');
  }
  return sdkModule;
}

// OMC state
let omcHooks: SDKHooks | null = null;
let omcInitialized = false;

// SDK-OMC mode (use built-in implementation instead of external OMC)
let useSdkOmc = false;

export interface ClaudeAgentMessage {
  type: 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'result' | 'error';
  content: string;
  toolName?: string;
  toolInput?: string;
  costUsd?: number;
  turns?: number;
}

// Agent lifecycle events
export interface AgentStartEvent {
  agentId: string;
  agentType: string;
}

export interface AgentStopEvent {
  agentId: string;
  transcriptPath?: string;
}

export class ClaudeAgentService extends EventEmitter {
  private abortController: AbortController | null = null;
  private isRunning: boolean = false;
  private currentWorkingDirectory: string = process.cwd();
  private sdkOmcEnabled: boolean = false;

  constructor() {
    super();
  }

  /**
   * Enable SDK-OMC mode (use built-in OMC implementation)
   * This is useful when external OMC is not installed or for SDK-only usage
   */
  enableSdkOmc(): void {
    this.sdkOmcEnabled = true;
    useSdkOmc = true;
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
      // Create SDK-OMC hooks
      const sdkOmcHooks = SdkOmc.createOmcHooks();
      omcHooks = sdkOmcHooks as SDKHooks;
      omcInitialized = true;
      this.sdkOmcEnabled = true;
      useSdkOmc = true;

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
      // Create OMC hooks
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
          console.log(`[ClaudeAgentService] Keywords detected: ${keywords.map(k => k.type).join(', ')}`);
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
   * Parse slash command from prompt
   */
  private parseSlashCommand(prompt: string): { skill: string; args: string } | null {
    const trimmed = prompt.trim();
    const match = trimmed.match(/^\/([a-z0-9-]+)(?:\s+(.*))?$/i);

    if (!match) {
      return null;
    }

    return {
      skill: match[1].toLowerCase(),
      args: match[2] || ''
    };
  }

  /**
   * Load skill definition from OMC
   */
  private loadSkillDefinition(skillName: string): string | null {
    const installation = detectOMCInstallation();
    if (!installation.skillsPath) return null;

    const skillDir = join(installation.skillsPath, skillName);
    const possibleFiles = ['SKILL.md', 'index.md', 'README.md'];

    for (const file of possibleFiles) {
      const filePath = join(skillDir, file);
      if (existsSync(filePath)) {
        try {
          return readFileSync(filePath, 'utf-8');
        } catch {
          continue;
        }
      }
    }

    return null;
  }

  /**
   * Process OMC commands and return transformed prompt with skill context
   */
  private processOMCCommand(prompt: string): { prompt: string; skillContext?: string } {
    const installation = detectOMCInstallation();

    if (!installation.isInstalled) {
      return { prompt };
    }

    const command = this.parseSlashCommand(prompt);

    if (!command) {
      return { prompt };
    }

    const availableSkills = getAvailableSkills(installation);

    if (!availableSkills.includes(command.skill)) {
      console.log(`[ClaudeAgentService] Unknown skill: ${command.skill}`);
      return { prompt };
    }

    console.log(`[ClaudeAgentService] Processing skill: ${command.skill}`);

    const skillDef = this.loadSkillDefinition(command.skill);
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

    // Initialize OMC if not already done (external or SDK-OMC)
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
        sdkOmcContext = `[SDK-OMC MODE: ${omcResult.suggestedMode.toUpperCase()}]\n`;
      }
      if (omcResult.suggestedAgent) {
        console.log('[ClaudeAgentService] SDK-OMC agent suggested:', omcResult.suggestedAgent);
      }

      // Add available agents context so Claude knows to use them
      const agents = this.getSdkOmcAgents();
      const agentList = Object.entries(agents)
        .map(([name, def]) => `- ${name}: ${def.description}`)
        .join('\n');

      sdkOmcContext += `
<available_agents>
When using the Task tool, use these specialized agent types:
${agentList}

Example: Task(subagent_type="executor", prompt="Implement the feature...")
</available_agents>
`;
    }

    try {
      const sdk = await getSDK();
      console.log('[ClaudeAgentService] SDK loaded, creating query iterator...');

      // Build the final prompt with skill context and SDK-OMC context if available
      let finalPrompt = prompt;
      if (skillContext) {
        finalPrompt = `${skillContext}\n\n---\n\nUser Request:\n${prompt}`;
      }
      // Always add SDK-OMC context when enabled (includes available agents list)
      if (sdkOmcContext) {
        finalPrompt = `${sdkOmcContext}\n${finalPrompt}`;
      }

      console.log('[ClaudeAgentService] Final prompt length:', finalPrompt.length);

      // Build base hooks for agent tracking
      const baseHooks: SDKHooks = {
        SubagentStart: [{
          hooks: [async (input: any) => {
            // Log full input to debug agent type detection
            console.log('[ClaudeAgentService] SubagentStart FULL INPUT:', JSON.stringify(input, null, 2));
            console.log('[ClaudeAgentService] SubagentStart agent_type:', input.agent_type);
            console.log('[ClaudeAgentService] SubagentStart subagent_type:', input.subagent_type);
            console.log('[ClaudeAgentService] SubagentStart agent_id:', input.agent_id);

            // Try to get the agent type from various possible fields
            const agentType = input.subagent_type || input.agent_type || input.type || 'unknown';

            this.emit('agentStart', {
              agentId: input.agent_id,
              agentType: agentType
            } as AgentStartEvent);
            return { continue: true };
          }]
        }],
        SubagentStop: [{
          hooks: [async (input: any) => {
            console.log('[ClaudeAgentService] SubagentStop:', input.agent_id);
            this.emit('agentStop', {
              agentId: input.agent_id,
              transcriptPath: input.agent_transcript_path
            } as AgentStopEvent);
            return { continue: true };
          }]
        }]
      };

      // Merge OMC hooks with base hooks
      const finalHooks = omcHooks ? mergeHooks(baseHooks, omcHooks) : baseHooks;

      // Build query options
      const queryOptions: any = {
        cwd: this.currentWorkingDirectory,
        model: model,
        abortController: this.abortController,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        includePartialMessages: true,
        pathToClaudeCodeExecutable: '/opt/homebrew/bin/claude',
        hooks: finalHooks as any
      };

      // Add SDK-OMC agents if enabled
      if (this.sdkOmcEnabled) {
        queryOptions.agents = this.getSdkOmcAgents();
        console.log('[ClaudeAgentService] SDK-OMC agents registered:', Object.keys(queryOptions.agents).length);
      }

      const queryIterator = sdk.query({
        prompt: finalPrompt,
        options: queryOptions
      });

      console.log('[ClaudeAgentService] Query iterator created, starting message loop...');
      let messageCount = 0;

      for await (const message of queryIterator) {
        messageCount++;
        console.log('[ClaudeAgentService] Message #' + messageCount + ':', message.type, (message as any).subtype || '');

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
  private processMessage(message: any): void {
    switch (message.type) {
      case 'assistant':
        // Full assistant message with content blocks
        // NOTE: text and thinking are already streamed via stream_event, so skip them here
        // Only process tool_use from assistant messages
        if (message.message?.content) {
          for (const block of message.message.content) {
            if (block.type === 'tool_use') {
              // Log Task tool calls to see which agent is being invoked
              if (block.name === 'Task') {
                console.log('[ClaudeAgentService] Task tool invoked with:', JSON.stringify(block.input, null, 2));
              }
              this.emit('message', {
                type: 'tool_use',
                content: `Using ${block.name}`,
                toolName: block.name,
                toolInput: JSON.stringify(block.input, null, 2)
              } as ClaudeAgentMessage);
            }
          }
        }
        break;

      case 'stream_event':
        // Streaming partial message
        const event = message.event;
        if (event?.type === 'content_block_delta') {
          if (event.delta?.type === 'text_delta') {
            this.emit('message', {
              type: 'text',
              content: event.delta.text
            } as ClaudeAgentMessage);
          } else if (event.delta?.type === 'thinking_delta') {
            this.emit('message', {
              type: 'thinking',
              content: event.delta.thinking
            } as ClaudeAgentMessage);
          }
        }
        break;

      case 'result':
        // Query completed
        console.log('[ClaudeAgentService] Result message full:', JSON.stringify(message, null, 2));
        const isSuccess = message.subtype === 'success';
        this.emit('message', {
          type: 'result',
          content: isSuccess ? (message.result || 'Completed') : `Error: ${message.errors?.join(', ') || 'Unknown'}`,
          costUsd: message.total_cost_usd || 0,
          turns: message.num_turns || 0
        } as ClaudeAgentMessage);
        break;

      case 'user':
        // User message (tool results, etc.) - ignore for UI
        break;

      case 'system':
        // System messages - check for init with agents list
        console.log('[ClaudeAgentService] System message:', message.subtype);
        if (message.subtype === 'init' && message.agents && message.agents.length > 0) {
          console.log('[ClaudeAgentService] Available agents:', message.agents);
          this.emit('agentsAvailable', message.agents);
        }
        break;

      default:
        console.log('[ClaudeAgentService] Unknown message type:', message.type);
    }
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
}
