/**
 * SDK-OMC Tools Index
 *
 * Export all tool definitions for use with MCP servers.
 */

// Notepad tools (session memory)
export {
  notepadTools,
  notepadReadTool,
  notepadWritePriorityTool,
  notepadWriteWorkingTool,
  notepadWriteManualTool,
  notepadPruneTool,
  notepadStatsTool
} from './notepad-tools';

// Memory tools (project memory)
export {
  memoryTools,
  projectMemoryReadTool,
  projectMemoryWriteTool,
  projectMemoryAddNoteTool,
  projectMemoryAddDirectiveTool,
  projectMemoryClearSectionTool
} from './memory-tools';

// Trace tools (execution traces)
export {
  traceTools,
  traceTimelineTool,
  traceSummaryTool,
  traceLogTool,
  traceClearTool
} from './trace-tools';

// LSP tools (code intelligence)
export {
  lspTools,
  lspHoverTool,
  lspGotoDefinitionTool,
  lspFindReferencesTool,
  lspDocumentSymbolsTool,
  lspDiagnosticsTool
} from './lsp-tools';

// AST tools (structural code search/replace)
export {
  astTools,
  astGrepSearchTool,
  astGrepReplaceTool
} from './ast-tools';

// Team tools (multi-agent orchestration)
export {
  teamTools,
  teamCreateTool,
  teamAddTaskTool,
  teamAssignTaskTool,
  teamCompleteTaskTool,
  teamTransitionTool,
  teamStatusTool,
  teamDeleteTool,
  teamSendMessageTool
} from './team-tools';

// Team orchestrator (pipeline execution)
export {
  TEAM_PIPELINE,
  getStageConfig,
  getNextStage,
  getStageAgentsWithModels,
  createAgentTaskCall,
  generateStagePrompt,
  createOrchestrationInstructions,
  DEFAULT_ORCHESTRATOR_CONFIG
} from './team-orchestrator';

// Import tool arrays
import { notepadTools } from './notepad-tools';
import { memoryTools } from './memory-tools';
import { traceTools } from './trace-tools';
import { lspTools } from './lsp-tools';
import { astTools } from './ast-tools';
import { teamTools } from './team-tools';
import type { ToolDefinition } from '../skills';

/**
 * All additional tools combined
 */
export const allAdditionalTools: ToolDefinition[] = [
  ...notepadTools,
  ...memoryTools,
  ...traceTools,
  ...lspTools,
  ...astTools,
  ...teamTools
];

/**
 * Get all tool names for allowedTools configuration
 */
export function getAllAdditionalToolNames(prefix: string = 'mcp__omc-tools__'): string[] {
  return allAdditionalTools.map(tool => `${prefix}${tool.name}`);
}
