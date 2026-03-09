import { TranscriptEntry, ContentBlock, ReasoningChain, ReasoningStep } from '../types.js';

export function extractReasoningChain(entries: TranscriptEntry[]): ReasoningChain {
  const steps: ReasoningStep[] = [];
  const toolsUsed = new Set<string>();
  let stepIndex = 0;

  // Metadata
  const firstEntry = entries[0];
  const lastEntry = entries[entries.length - 1];
  const sessionId = firstEntry?.sessionId ?? '';
  const agentId = firstEntry?.agentId ?? '';
  const startTime = firstEntry?.timestamp ?? '';
  const endTime = lastEntry?.timestamp ?? '';
  const branch = firstEntry?.gitBranch ?? '';
  const cwd = firstEntry?.cwd ?? '';
  const project = extractProjectFromCwd(cwd);

  // Find model from first assistant entry
  let model = '';
  for (const entry of entries) {
    if (entry.type === 'assistant' && entry.message.model) {
      model = entry.message.model;
      break;
    }
  }

  let problem = '';
  let conclusion = '';

  // Find first user message for problem
  for (const entry of entries) {
    if (entry.type === 'user' && entry.message.role === 'user') {
      problem = extractTextContent(entry.message.content);
      if (problem) break;
    }
  }

  // Process all entries for steps
  for (const entry of entries) {
    if (entry.type !== 'assistant' && entry.type !== 'user') continue;

    const content = entry.message.content;

    if (typeof content === 'string') {
      if (entry.type === 'assistant' && content.trim()) {
        steps.push({
          index: stepIndex++,
          type: 'thinking',
          content: content.trim(),
          timestamp: entry.timestamp,
        });
      }
    } else if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === 'text' && block.text?.trim()) {
          steps.push({
            index: stepIndex++,
            type: 'thinking',
            content: block.text.trim(),
            timestamp: entry.timestamp,
          });
        } else if (block.type === 'tool_use' && block.name) {
          const toolName = block.name;
          toolsUsed.add(toolName);
          const toolInput = summarizeToolInput(toolName, block.input ?? {});
          steps.push({
            index: stepIndex++,
            type: 'tool_call',
            content: `${toolName}: ${toolInput}`,
            toolName,
            toolInput,
            timestamp: entry.timestamp,
          });
        } else if (block.type === 'tool_result') {
          const resultContent = typeof block.content === 'string'
            ? block.content
            : JSON.stringify(block.content ?? '');
          const truncated = resultContent.slice(0, 200);
          steps.push({
            index: stepIndex++,
            type: 'tool_result',
            content: truncated,
            timestamp: entry.timestamp,
          });
        }
      }
    }
  }

  // Last assistant text block becomes conclusion
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.type === 'assistant') {
      const text = extractTextContent(entry.message.content);
      if (text) {
        conclusion = text;
        break;
      }
    }
  }

  // Generate tags from project, branch, and tool names
  const tags: string[] = [];
  if (project) tags.push(project);
  if (branch && branch !== 'main' && branch !== 'master') tags.push(branch);
  for (const tool of toolsUsed) {
    tags.push(`tool:${tool}`);
  }

  return {
    sessionId,
    agentId,
    project,
    branch,
    model,
    startTime,
    endTime,
    problem,
    steps,
    conclusion,
    toolsUsed: Array.from(toolsUsed),
    tags,
  };
}

function extractTextContent(content: string | ContentBlock[]): string {
  if (typeof content === 'string') return content;
  return content
    .filter(b => b.type === 'text' && b.text)
    .map(b => b.text!)
    .join('\n')
    .trim();
}

function summarizeToolInput(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case 'Read':
      return String(input.file_path ?? '');
    case 'Bash': {
      const cmd = String(input.command ?? '');
      return cmd.slice(0, 100);
    }
    case 'Grep':
      return String(input.pattern ?? '');
    case 'Edit':
      return String(input.file_path ?? '');
    case 'Write':
      return String(input.file_path ?? '');
    case 'Agent':
      return String(input.description ?? input.prompt ?? '').slice(0, 100);
    default: {
      const json = JSON.stringify(input);
      return json.slice(0, 100);
    }
  }
}

function extractProjectFromCwd(cwd: string): string {
  if (!cwd) return '';
  const parts = cwd.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? '';
}
