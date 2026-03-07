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
  /** Tool use ID that spawned the subagent (for routing messages to correct widget) */
  parentToolUseId?: string;
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
  /** Tool use ID that spawned this subagent (present for subagent messages) */
  parent_tool_use_id?: string;
  message?: {
    content?: Array<ToolUseBlock | { type: string; text?: string; thinking?: string }>;
  };
}

export interface StreamEvent {
  type: 'stream_event';
  /** Tool use ID that spawned this subagent (present for subagent messages) */
  parent_tool_use_id?: string;
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
  const parentToolUseId = message.parent_tool_use_id;

  // Debug: Log stream event details
  console.log('[MessageParser] parseStreamEvent:', 'has event:', !!event, 'event.type:', event?.type,
    'parent_tool_use_id:', parentToolUseId || 'none');

  if (!event || event.type !== 'content_block_delta') {
    if (event) {
      console.log('[MessageParser] Skipping stream event type:', event.type);
    }
    return null;
  }

  const delta = event.delta;
  console.log('[MessageParser] delta.type:', delta?.type);

  if (delta.type === 'text_delta') {
    const parsed = parseTextDelta(delta as TextDelta);
    parsed.parentToolUseId = parentToolUseId;
    return parsed;
  }

  if (delta.type === 'thinking_delta') {
    const parsed = parseThinkingDelta(delta as ThinkingDelta);
    parsed.parentToolUseId = parentToolUseId;
    return parsed;
  }

  console.log('[MessageParser] Unknown delta type:', (delta as { type?: string })?.type);
  return null;
}

/**
 * Text block from assistant message
 */
export interface TextBlock {
  type: 'text';
  text: string;
}

/**
 * Thinking block from assistant message (extended thinking)
 */
export interface ThinkingBlock {
  type: 'thinking';
  thinking: string;
}

/**
 * Parse an assistant message and extract all content blocks.
 * Returns an array since assistant messages can contain multiple blocks.
 */
export function parseAssistantMessage(message: AssistantMessage): ParsedMessage[] {
  const results: ParsedMessage[] = [];

  if (!message.message?.content) {
    return results;
  }

  const parentToolUseId = message.parent_tool_use_id;
  console.log('[MessageParser] parseAssistantMessage: block count:', message.message.content.length,
    'parent_tool_use_id:', parentToolUseId || 'none');

  for (const block of message.message.content) {
    console.log('[MessageParser] Block type:', block.type);

    if (block.type === 'tool_use') {
      const parsed = parseToolUse(block as ToolUseBlock);
      parsed.parentToolUseId = parentToolUseId;
      results.push(parsed);
    } else if (block.type === 'text') {
      const textBlock = block as unknown as TextBlock;
      if (textBlock.text && textBlock.text.length > 0) {
        results.push({
          type: 'text',
          content: textBlock.text,
          parentToolUseId
        });
      }
    } else if (block.type === 'thinking') {
      const thinkingBlock = block as unknown as ThinkingBlock;
      if (thinkingBlock.thinking && thinkingBlock.thinking.length > 0) {
        results.push({
          type: 'thinking',
          content: thinkingBlock.thinking,
          parentToolUseId
        });
      }
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

  const msg = message as { type?: string; subtype?: string };

  // Debug: Log all message types we receive
  console.log('[MessageParser] Received message type:', msg.type, 'subtype:', msg.subtype || 'none');

  switch (msg.type) {
    case 'assistant':
      return parseAssistantMessage(message as AssistantMessage);

    case 'stream_event': {
      const result = parseStreamEvent(message as StreamEvent);
      if (result) {
        console.log('[MessageParser] Parsed stream_event:', result.type, 'content length:', result.content?.length || 0);
      }
      return result;
    }

    case 'result':
      return parseResultMessage(message as ResultMessage);

    case 'system':
      return parseSystemMessage(message as SystemMessage);

    case 'user':
      // User messages (tool results, etc.) - skip for UI
      return null;

    default:
      console.log('[MessageParser] Unknown message type:', msg.type, JSON.stringify(message).substring(0, 200));
      return null;
  }
}

/**
 * Check if a parsed result is an array of messages.
 */
export function isMessageArray(result: ParsedMessage | ParsedMessage[] | null): result is ParsedMessage[] {
  return Array.isArray(result);
}
