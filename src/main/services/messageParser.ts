/**
 * Message Parser Module
 * Single Responsibility: Parse SDK messages into simplified types
 *
 * This module contains PURE FUNCTIONS with no side effects.
 * It transforms raw SDK messages into a normalized format for consumption.
 *
 * Usage:
 *   const parsed = parseMessage(sdkMessage);
 *   if (parsed) {
 *     // Handle parsed message
 *   }
 */

export type ParsedMessageType = 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'result' | 'error' | 'system' | 'skip';

export interface ParsedMessage {
  type: ParsedMessageType;
  content?: string;
  toolName?: string;
  toolInput?: string;
  costUsd?: number;
  turns?: number;
  isSuccess?: boolean;
  agents?: string[];
}

export interface TextDelta {
  type: 'text_delta';
  text: string;
}

export interface ThinkingDelta {
  type: 'thinking_delta';
  thinking: string;
}

export interface ContentBlockDelta {
  type: 'content_block_delta';
  delta: TextDelta | ThinkingDelta;
}

export interface ToolUseBlock {
  type: 'tool_use';
  name: string;
  input: unknown;
}

export interface AssistantMessage {
  type: 'assistant';
  message?: {
    content?: Array<ToolUseBlock | { type: string }>;
  };
}

export interface StreamEvent {
  type: 'stream_event';
  event?: ContentBlockDelta;
}

export interface ResultMessage {
  type: 'result';
  subtype?: 'success' | 'error';
  result?: string;
  errors?: string[];
  total_cost_usd?: number;
  num_turns?: number;
}

export interface SystemMessage {
  type: 'system';
  subtype?: string;
  agents?: string[];
}

/**
 * Parse a text delta from a stream event.
 */
export function parseTextDelta(delta: TextDelta): ParsedMessage {
  return {
    type: 'text',
    content: delta.text
  };
}

/**
 * Parse a thinking delta from a stream event.
 */
export function parseThinkingDelta(delta: ThinkingDelta): ParsedMessage {
  return {
    type: 'thinking',
    content: delta.thinking
  };
}

/**
 * Parse a tool use block from an assistant message.
 */
export function parseToolUse(block: ToolUseBlock): ParsedMessage {
  return {
    type: 'tool_use',
    content: `Using ${block.name}`,
    toolName: block.name,
    toolInput: JSON.stringify(block.input, null, 2)
  };
}

/**
 * Parse a stream event message.
 */
export function parseStreamEvent(message: StreamEvent): ParsedMessage | null {
  const event = message.event;

  if (!event || event.type !== 'content_block_delta') {
    return null;
  }

  const delta = event.delta;

  if (delta.type === 'text_delta') {
    return parseTextDelta(delta as TextDelta);
  }

  if (delta.type === 'thinking_delta') {
    return parseThinkingDelta(delta as ThinkingDelta);
  }

  return null;
}

/**
 * Parse an assistant message and extract tool use blocks.
 * Returns an array since assistant messages can contain multiple tool uses.
 */
export function parseAssistantMessage(message: AssistantMessage): ParsedMessage[] {
  const results: ParsedMessage[] = [];

  if (!message.message?.content) {
    return results;
  }

  for (const block of message.message.content) {
    if (block.type === 'tool_use') {
      results.push(parseToolUse(block as ToolUseBlock));
    }
  }

  return results;
}

/**
 * Parse a result message (query completion).
 */
export function parseResultMessage(message: ResultMessage): ParsedMessage {
  const isSuccess = message.subtype === 'success';

  return {
    type: 'result',
    content: isSuccess
      ? (message.result || 'Completed')
      : `Error: ${message.errors?.join(', ') || 'Unknown'}`,
    costUsd: message.total_cost_usd || 0,
    turns: message.num_turns || 0,
    isSuccess
  };
}

/**
 * Parse a system message.
 */
export function parseSystemMessage(message: SystemMessage): ParsedMessage | null {
  if (message.subtype === 'init' && message.agents && message.agents.length > 0) {
    return {
      type: 'system',
      agents: message.agents
    };
  }
  return null;
}

/**
 * Main entry point: Parse any SDK message into a normalized format.
 * Returns null for messages that should be skipped.
 */
export function parseMessage(message: unknown): ParsedMessage | ParsedMessage[] | null {
  if (!message || typeof message !== 'object') {
    return null;
  }

  const msg = message as { type?: string };

  switch (msg.type) {
    case 'assistant':
      return parseAssistantMessage(message as AssistantMessage);

    case 'stream_event':
      return parseStreamEvent(message as StreamEvent);

    case 'result':
      return parseResultMessage(message as ResultMessage);

    case 'system':
      return parseSystemMessage(message as SystemMessage);

    case 'user':
      // User messages (tool results, etc.) - skip for UI
      return null;

    default:
      return null;
  }
}

/**
 * Check if a parsed result is an array of messages.
 */
export function isMessageArray(result: ParsedMessage | ParsedMessage[] | null): result is ParsedMessage[] {
  return Array.isArray(result);
}
