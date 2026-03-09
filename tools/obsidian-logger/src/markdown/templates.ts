import { ReasoningChain } from '../types.js';

export function generateFrontmatter(chain: ReasoningChain): string {
  const date = chain.startTime.split('T')[0]; // YYYY-MM-DD
  const tags = ['ai/reasoning', `project/${chain.project}`, ...chain.tags];
  const uniqueTags = [...new Set(tags)];

  const yamlStr = [
    '---',
    `date: ${date}`,
    `session_id: ${escapeYaml(chain.sessionId)}`,
    `agent_id: ${escapeYaml(chain.agentId)}`,
    `project: ${escapeYaml(chain.project)}`,
    `branch: ${escapeYaml(chain.branch)}`,
    `model: ${escapeYaml(chain.model)}`,
    `tools_used: [${chain.toolsUsed.map(t => escapeYaml(t)).join(', ')}]`,
    `tags: [${uniqueTags.map(t => escapeYaml(t)).join(', ')}]`,
    `status: ${chain.conclusion ? 'completed' : 'incomplete'}`,
    `steps_count: ${chain.steps.length}`,
    '---',
  ].join('\n');

  return yamlStr;
}

function escapeYaml(value: string): string {
  if (!value) return '""';
  // If value contains special YAML characters, wrap in quotes
  if (/[:\[\]{}#&*!|>'"%@`,]/.test(value) || value.includes('\n')) {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return value;
}

export function generateTitle(chain: ReasoningChain): string {
  if (!chain.problem) return 'Untitled Session';

  // Take first line
  const firstLine = chain.problem.split('\n')[0].trim();

  // Remove markdown formatting (bold, italic, code)
  const cleaned = firstLine
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/^#+\s*/, '')
    .trim();

  if (!cleaned) return 'Untitled Session';

  // Truncate to 60 chars
  if (cleaned.length <= 60) return cleaned;
  return cleaned.slice(0, 57) + '...';
}

export function generateFilename(chain: ReasoningChain): string {
  const date = chain.startTime.split('T')[0]; // YYYY-MM-DD
  const project = chain.project.toLowerCase().replace(/[^a-z0-9가-힣]/g, '-');
  const title = generateTitle(chain)
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w가-힣-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const base = `${date}-${project}-${title}.md`;

  // Truncate to 80 chars (excluding .md)
  if (base.length <= 80) return base;
  const truncated = base.slice(0, 77) + '...';
  return truncated.endsWith('.md') ? truncated : truncated + '.md';
}
