/**
 * Tool Input Formatter
 * Single Responsibility: Format tool inputs for display
 *
 * Provides two formatting modes:
 * - Detailed: Full tool input information (for transcripts)
 * - Compact: Short summary (for widgets)
 */

type ToolInput = Record<string, unknown>;

/**
 * Formatter function type for individual tools
 */
type ToolFormatter = (input: ToolInput) => string;

/**
 * Declarative formatter registry for detailed output
 */
const DETAILED_FORMATTERS: Record<string, ToolFormatter> = {
  Read: (i) => (i.file_path as string) || '',
  Write: (i) => `${i.file_path || ''} (${String(i.content || '').length} chars)`,
  Edit: (i) => (i.file_path as string) || '',
  Bash: (i) => (i.command as string) || '',
  Glob: (i) => `${i.pattern || ''} in ${i.path || '.'}`,
  Grep: (i) => `"${i.pattern || ''}" in ${i.path || '.'}`,
  Task: (i) => `${i.subagent_type || 'agent'}: ${String(i.prompt || '').substring(0, 100)}...`,
  WebFetch: (i) => (i.url as string) || '',
  WebSearch: (i) => (i.query as string) || '',
};

/**
 * Declarative formatter registry for compact output (widget display)
 */
const COMPACT_FORMATTERS: Record<string, ToolFormatter> = {
  Read: (i) => i.file_path ? ` ${String(i.file_path).split('/').pop()}` : '',
  Write: (i) => i.file_path ? ` ${String(i.file_path).split('/').pop()}` : '',
  Edit: (i) => i.file_path ? ` ${String(i.file_path).split('/').pop()}` : '',
  Bash: (i) => i.command ? ` ${String(i.command).split(' ')[0]}` : '',
  Glob: (i) => i.pattern ? ` ${i.pattern}` : '',
  Grep: (i) => i.pattern ? ` "${String(i.pattern).substring(0, 20)}"` : '',
  Task: (i) => i.subagent_type ? ` ${i.subagent_type}` : '',
  WebFetch: (i) => i.url ? ` ${new URL(String(i.url)).hostname}` : '',
  WebSearch: (i) => i.query ? ` "${String(i.query).substring(0, 20)}"` : '',
};

/**
 * Default formatter for unknown tools
 */
const defaultDetailedFormatter: ToolFormatter = (input) => {
  const entries = Object.entries(input).slice(0, 3);
  return entries.map(([k, v]) => `${k}=${String(v).substring(0, 50)}`).join(', ');
};

/**
 * Parse tool input from string or object
 */
function parseToolInput(input: unknown): ToolInput | null {
  if (!input) return null;

  if (typeof input === 'object') {
    return input as ToolInput;
  }

  if (typeof input === 'string') {
    try {
      return JSON.parse(input) as ToolInput;
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Format tool input with detailed information (for transcripts)
 *
 * @example
 * formatToolInputDetailed('Read', { file_path: '/src/index.ts' })
 * // Returns: '/src/index.ts'
 *
 * formatToolInputDetailed('Bash', { command: 'npm install' })
 * // Returns: 'npm install'
 */
export function formatToolInputDetailed(toolName: string, input: unknown): string {
  const parsed = parseToolInput(input);
  if (!parsed) return String(input || '');

  const formatter = DETAILED_FORMATTERS[toolName] ?? defaultDetailedFormatter;
  return formatter(parsed);
}

/**
 * Format tool input with compact summary (for widgets)
 *
 * @example
 * formatToolInputCompact('Read', '{"file_path": "/src/index.ts"}')
 * // Returns: 'Read index.ts'
 *
 * formatToolInputCompact('Bash', '{"command": "npm install"}')
 * // Returns: 'Bash npm'
 */
export function formatToolInputCompact(toolName: string, input: unknown): string {
  const parsed = parseToolInput(input);
  const detail = parsed ? (COMPACT_FORMATTERS[toolName]?.(parsed) ?? '') : '';
  return `${toolName}${detail}`;
}

/**
 * Legacy alias for formatToolInputDetailed
 * @deprecated Use formatToolInputDetailed instead
 */
export const formatToolInput = formatToolInputDetailed;
