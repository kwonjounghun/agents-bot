// JSONL transcript entry from Claude Code (~/.claude/projects/*/*.jsonl)
export interface TranscriptEntry {
  type: 'user' | 'assistant' | 'progress';
  sessionId: string;
  agentId: string;
  timestamp: string;
  cwd: string;
  gitBranch?: string;
  slug?: string;
  message: {
    role?: 'user' | 'assistant';
    model?: string;
    content: string | ContentBlock[];
  };
}

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

// Parsed reasoning chain
export interface ReasoningChain {
  sessionId: string;
  agentId: string;
  project: string;
  branch: string;
  model: string;
  startTime: string;
  endTime: string;
  problem: string;
  steps: ReasoningStep[];
  conclusion: string;
  toolsUsed: string[];
  tags: string[];
}

export interface ReasoningStep {
  index: number;
  type: 'thinking' | 'tool_call' | 'tool_result' | 'conclusion';
  content: string;
  toolName?: string;
  toolInput?: string;
  timestamp?: string;
}

// Obsidian config
export interface ObsidianConfig {
  apiUrl: string;
  apiKey: string;
  vaultPath: string;  // path within vault, e.g. "AI Sessions"
}

// App config
export interface AppConfig {
  obsidian: ObsidianConfig;
  claudeProjectsDir: string;
  syncedSessions: Record<string, string>; // sessionId -> sync timestamp
}
