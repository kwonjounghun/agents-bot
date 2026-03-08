/**
 * Transcript Line Parser
 * Single Responsibility: Parse JSONL transcript lines into structured messages
 *
 * Handles Claude ESP-style JSONL format with agentId fields.
 */

import { formatToolInputDetailed } from '../../../shared/formatters/toolInputFormatter';

/**
 * Parsed transcript message
 */
export interface TranscriptMessage {
  type: 'text' | 'thinking' | 'tool_use' | 'tool_result';
  content: string;
  agentId: string;
  /** Tool name for tool_use/tool_result messages */
  toolName?: string;
  /** Tool use ID for correlation */
  toolUseId?: string;
}

/**
 * Configuration for result truncation
 */
export interface ParserConfig {
  /** Maximum length for tool result content (default: 500) */
  maxResultLength: number;
}

const DEFAULT_CONFIG: ParserConfig = {
  maxResultLength: 500,
};

/**
 * Parse a single JSONL line from the transcript (ESP-style)
 * Returns multiple messages if the line contains multiple content blocks
 *
 * JSONL format includes agentId field:
 * {"agentId": "ab215e8", "sessionId": "...", "type": "assistant", "message": {...}}
 *
 * @param line - A single line from the JSONL transcript
 * @param config - Optional parser configuration
 * @returns Array of parsed messages (may be empty or contain multiple messages)
 */
export function parseTranscriptLine(
  line: string,
  config: ParserConfig = DEFAULT_CONFIG
): TranscriptMessage[] {
  if (!line.trim()) {
    return [];
  }

  try {
    const entry = JSON.parse(line);
    const messages: TranscriptMessage[] = [];

    // Extract agentId from JSONL entry (claude-esp style)
    const agentId = entry.agentId || '';

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
            agentId,
          });
        }
        if (block.type === 'thinking' && block.thinking) {
          messages.push({
            type: 'thinking',
            content: block.thinking,
            agentId,
          });
        }
        if (block.type === 'tool_use' && block.name) {
          const formattedInput = formatToolInputDetailed(block.name, block.input);
          messages.push({
            type: 'tool_use',
            content: formattedInput,
            agentId,
            toolName: block.name,
            toolUseId: block.id,
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
          let resultContent = extractToolResultContent(block.content);

          // Truncate if necessary
          if (resultContent.length > config.maxResultLength) {
            resultContent = resultContent.substring(0, config.maxResultLength) + '... (truncated)';
          }

          messages.push({
            type: 'tool_result',
            content: resultContent,
            agentId,
            toolUseId: block.tool_use_id,
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
 * Extract text content from tool result
 */
function extractToolResultContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    let result = '';
    for (const contentBlock of content) {
      if (contentBlock.type === 'text' && contentBlock.text) {
        result += contentBlock.text;
      }
    }
    return result;
  }

  return '';
}

/**
 * Check if a line is likely a valid JSONL entry
 */
export function isValidJsonlLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('{') && trimmed.endsWith('}');
}

/**
 * Parse multiple JSONL lines
 */
export function parseTranscriptLines(
  lines: string[],
  config: ParserConfig = DEFAULT_CONFIG
): TranscriptMessage[] {
  return lines.flatMap((line) => parseTranscriptLine(line, config));
}
