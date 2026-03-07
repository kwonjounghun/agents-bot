export interface AgentConfig {
  color: string;
  emoji: string;
  name: string;
  description: string;
}

// Predefined agent configurations (OMC compatible)
export const KNOWN_AGENTS: Record<string, AgentConfig> = {
  // Core agents
  planner: { color: '#8B5CF6', emoji: '🗺️', name: 'Planner', description: 'Strategic planning and task decomposition' },
  executor: { color: '#3B82F6', emoji: '⚡', name: 'Executor', description: 'Code implementation and execution' },
  reviewer: { color: '#10B981', emoji: '🔍', name: 'Reviewer', description: 'Code review and quality assurance' },
  designer: { color: '#EC4899', emoji: '🎨', name: 'Designer', description: 'UI/UX design and architecture' },
  debugger: { color: '#F97316', emoji: '🐛', name: 'Debugger', description: 'Bug investigation and fixes' },
  architect: { color: '#14B8A6', emoji: '🏗️', name: 'Architect', description: 'System design and structure' },

  // OMC extended agents
  analyst: { color: '#6366F1', emoji: '📊', name: 'Analyst', description: 'Requirements and data analysis' },
  explore: { color: '#22D3EE', emoji: '🔭', name: 'Explorer', description: 'Codebase exploration and discovery' },
  explorer: { color: '#22D3EE', emoji: '🔭', name: 'Explorer', description: 'Codebase exploration and discovery' }, // alias
  verifier: { color: '#84CC16', emoji: '✅', name: 'Verifier', description: 'Verification and validation' },
  critic: { color: '#EF4444', emoji: '🎯', name: 'Critic', description: 'Critical review and challenge' },
  'test-engineer': { color: '#A855F7', emoji: '🧪', name: 'Test Engineer', description: 'Test strategy and coverage' },
  'security-reviewer': { color: '#DC2626', emoji: '🔐', name: 'Security Reviewer', description: 'Security vulnerability detection' },
  'quality-reviewer': { color: '#059669', emoji: '💎', name: 'Quality Reviewer', description: 'Code quality and maintainability' },
  'code-reviewer': { color: '#0891B2', emoji: '📝', name: 'Code Reviewer', description: 'Comprehensive code review' },
  'build-fixer': { color: '#EA580C', emoji: '🔧', name: 'Build Fixer', description: 'Build and compilation fixes' },
  writer: { color: '#7C3AED', emoji: '✍️', name: 'Writer', description: 'Documentation and technical writing' },
  scientist: { color: '#2563EB', emoji: '🔬', name: 'Scientist', description: 'Data analysis and research' },
  'deep-executor': { color: '#1D4ED8', emoji: '🚀', name: 'Deep Executor', description: 'Complex autonomous execution' },
  'qa-tester': { color: '#9333EA', emoji: '🎮', name: 'QA Tester', description: 'Interactive testing specialist' },
  'document-specialist': { color: '#0D9488', emoji: '📚', name: 'Doc Specialist', description: 'External documentation lookup' },
};

// Color palette for dynamic agents
const DYNAMIC_COLORS = [
  '#F472B6', '#FB923C', '#FBBF24', '#A3E635', '#4ADE80',
  '#2DD4BF', '#38BDF8', '#818CF8', '#C084FC', '#F87171'
];

// Emoji palette for dynamic agents
const DYNAMIC_EMOJIS = ['🤖', '💡', '🎯', '⭐', '🔥', '💪', '🎨', '🛠️', '📦', '🌟'];

// Get config for any role (known or dynamic)
export function getAgentConfig(role: string): AgentConfig {
  // Check if it's a known agent
  const lowerRole = role.toLowerCase().replace(/[-_]/g, '-');
  if (KNOWN_AGENTS[lowerRole]) {
    return KNOWN_AGENTS[lowerRole];
  }

  // Generate consistent config for unknown roles based on role name hash
  const hash = role.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const colorIndex = hash % DYNAMIC_COLORS.length;
  const emojiIndex = hash % DYNAMIC_EMOJIS.length;

  // Capitalize first letter of each word
  const name = role
    .replace(/[-_]/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  return {
    color: DYNAMIC_COLORS[colorIndex],
    emoji: DYNAMIC_EMOJIS[emojiIndex],
    name,
    description: `${name} agent`
  };
}

// Legacy export for backward compatibility
export const AGENT_CONFIG = new Proxy({} as Record<string, AgentConfig>, {
  get: (_, prop: string) => getAgentConfig(prop)
});
