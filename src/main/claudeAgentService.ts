import { EventEmitter } from 'events';
import type { QueryOptions } from '../shared/types';

// Dynamic import for ES module SDK
let sdkModule: typeof import('@anthropic-ai/claude-agent-sdk') | null = null;

async function getSDK() {
  if (!sdkModule) {
    sdkModule = await import('@anthropic-ai/claude-agent-sdk');
  }
  return sdkModule;
}

export interface ClaudeAgentMessage {
  type: 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'result' | 'error';
  content: string;
  toolName?: string;
  toolInput?: string;
  costUsd?: number;
  turns?: number;
}

export class ClaudeAgentService extends EventEmitter {
  private abortController: AbortController | null = null;
  private isRunning: boolean = false;

  constructor() {
    super();
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

    const { prompt, workingDirectory, model } = options;

    console.log('[ClaudeAgentService] Starting query');
    console.log('[ClaudeAgentService] Working directory:', workingDirectory || process.cwd());
    console.log('[ClaudeAgentService] Model:', model || 'default');

    try {
      const sdk = await getSDK();

      const queryIterator = sdk.query({
        prompt,
        options: {
          cwd: workingDirectory || process.cwd(),
          model: model,
          abortController: this.abortController,
          permissionMode: 'bypassPermissions',
          allowDangerouslySkipPermissions: true,
          includePartialMessages: true,
          pathToClaudeCodeExecutable: '/opt/homebrew/bin/claude',
        }
      });

      for await (const message of queryIterator) {
        if (this.abortController?.signal.aborted) {
          console.log('[ClaudeAgentService] Query aborted');
          break;
        }

        this.processMessage(message);
      }

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
        // System messages - log but don't display
        console.log('[ClaudeAgentService] System message:', message.subtype);
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
