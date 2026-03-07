/**
 * SDK-OMC Team Orchestrator
 *
 * High-level orchestration for team pipeline execution.
 * Coordinates multiple agents through the staged pipeline.
 */

import { readState, writeState, clearState } from '../state';
import { getModelForAgent } from '../routing';
import { getAgent } from '../agents';

/**
 * Team stage definition
 */
type TeamStage = 'team-plan' | 'team-prd' | 'team-exec' | 'team-verify' | 'team-fix';

/**
 * Stage configuration
 */
interface StageConfig {
  name: TeamStage;
  description: string;
  primaryAgents: string[];
  optionalAgents: string[];
  nextStage: TeamStage | 'complete' | 'failed';
  failureStage?: TeamStage | 'failed';
}

/**
 * Pipeline configuration
 */
export const TEAM_PIPELINE: StageConfig[] = [
  {
    name: 'team-plan',
    description: 'Explore and decompose task into subtasks',
    primaryAgents: ['explore', 'planner'],
    optionalAgents: ['analyst', 'architect'],
    nextStage: 'team-prd',
    failureStage: 'failed'
  },
  {
    name: 'team-prd',
    description: 'Define acceptance criteria and scope',
    primaryAgents: ['analyst'],
    optionalAgents: ['critic'],
    nextStage: 'team-exec',
    failureStage: 'team-plan'
  },
  {
    name: 'team-exec',
    description: 'Execute tasks with parallel agents',
    primaryAgents: ['executor'],
    optionalAgents: ['designer', 'build-fixer', 'writer', 'test-engineer', 'deep-executor'],
    nextStage: 'team-verify',
    failureStage: 'team-fix'
  },
  {
    name: 'team-verify',
    description: 'Verify completion and quality',
    primaryAgents: ['verifier'],
    optionalAgents: ['security-reviewer', 'code-reviewer', 'quality-reviewer'],
    nextStage: 'complete',
    failureStage: 'team-fix'
  },
  {
    name: 'team-fix',
    description: 'Fix issues found during verification',
    primaryAgents: ['executor', 'build-fixer'],
    optionalAgents: ['debugger'],
    nextStage: 'team-verify',
    failureStage: 'failed'
  }
];

/**
 * Get stage configuration
 */
export function getStageConfig(stage: TeamStage): StageConfig | undefined {
  return TEAM_PIPELINE.find(s => s.name === stage);
}

/**
 * Get next stage based on current stage and result
 */
export function getNextStage(currentStage: TeamStage, success: boolean): TeamStage | 'complete' | 'failed' {
  const config = getStageConfig(currentStage);
  if (!config) return 'failed';
  return success ? config.nextStage : (config.failureStage || 'failed');
}

/**
 * Get all agents for a stage with their model tiers
 */
export function getStageAgentsWithModels(stage: TeamStage): Array<{
  name: string;
  model: string;
  primary: boolean;
}> {
  const config = getStageConfig(stage);
  if (!config) return [];

  const result: Array<{ name: string; model: string; primary: boolean }> = [];

  for (const agentName of config.primaryAgents) {
    const model = getModelForAgent(agentName);
    result.push({ name: agentName, model, primary: true });
  }

  for (const agentName of config.optionalAgents) {
    const model = getModelForAgent(agentName);
    result.push({ name: agentName, model, primary: false });
  }

  return result;
}

/**
 * Create Task tool call configuration for an agent
 */
export function createAgentTaskCall(
  agentName: string,
  prompt: string,
  workingDirectory: string
): {
  subagentType: string;
  prompt: string;
  model: string;
  description: string;
} {
  const agent = getAgent(agentName);
  const model = getModelForAgent(agentName);

  return {
    subagentType: `oh-my-claudecode:${agentName}`,
    prompt,
    model,
    description: agent?.description || `Run ${agentName} agent`
  };
}

/**
 * Generate stage prompt based on task and context
 */
export function generateStagePrompt(
  stage: TeamStage,
  taskDescription: string,
  context?: {
    previousResults?: string;
    planSummary?: string;
    prdSummary?: string;
    issues?: string[];
  }
): string {
  const prompts: Record<TeamStage, string> = {
    'team-plan': `## Team Plan Stage

Task: ${taskDescription}

Your job is to:
1. Explore the codebase to understand current state
2. Identify files and components involved
3. Break down the task into specific subtasks
4. Estimate complexity and dependencies

Output a structured plan with:
- List of files to modify/create
- Ordered subtasks with descriptions
- Identified risks or blockers
${context?.previousResults ? `\nPrevious context:\n${context.previousResults}` : ''}`,

    'team-prd': `## Team PRD Stage

Task: ${taskDescription}
${context?.planSummary ? `\nPlan Summary:\n${context.planSummary}` : ''}

Your job is to:
1. Define clear acceptance criteria
2. Specify expected behavior
3. Identify edge cases
4. Set quality requirements

Output:
- Numbered acceptance criteria
- Test scenarios
- Definition of done`,

    'team-exec': `## Team Execution Stage

Task: ${taskDescription}
${context?.planSummary ? `\nPlan:\n${context.planSummary}` : ''}
${context?.prdSummary ? `\nAcceptance Criteria:\n${context.prdSummary}` : ''}

Your job is to:
1. Implement the required changes
2. Follow existing patterns and conventions
3. Write clean, well-tested code
4. Update documentation if needed

Focus on incremental, reviewable changes.`,

    'team-verify': `## Team Verification Stage

Task: ${taskDescription}
${context?.prdSummary ? `\nAcceptance Criteria:\n${context.prdSummary}` : ''}

Your job is to:
1. Verify all acceptance criteria are met
2. Run tests and check coverage
3. Review code quality and security
4. Collect evidence of completion

Report:
- Pass/fail for each criterion
- Test results
- Issues found (if any)`,

    'team-fix': `## Team Fix Stage

Task: ${taskDescription}
${context?.issues ? `\nIssues to fix:\n${context.issues.map((i, idx) => `${idx + 1}. ${i}`).join('\n')}` : ''}

Your job is to:
1. Address each issue found during verification
2. Fix bugs and errors
3. Improve code quality
4. Re-run affected tests

After fixes, the team will return to verification.`
  };

  return prompts[stage];
}

/**
 * Orchestration result
 */
export interface OrchestrationResult {
  success: boolean;
  stage: TeamStage;
  agentResults: Array<{
    agent: string;
    success: boolean;
    output?: string;
    error?: string;
  }>;
  nextStage: TeamStage | 'complete' | 'failed';
  issues?: string[];
}

/**
 * Team orchestrator configuration
 */
export interface TeamOrchestratorConfig {
  maxFixLoops: number;
  parallelExecution: boolean;
  useOpusForCritical: boolean;
  debug: boolean;
}

export const DEFAULT_ORCHESTRATOR_CONFIG: TeamOrchestratorConfig = {
  maxFixLoops: 3,
  parallelExecution: true,
  useOpusForCritical: true,
  debug: false
};

/**
 * Create orchestration instructions for SDK usage
 */
export function createOrchestrationInstructions(
  stage: TeamStage,
  taskDescription: string,
  config: TeamOrchestratorConfig = DEFAULT_ORCHESTRATOR_CONFIG
): string {
  const stageConfig = getStageConfig(stage);
  if (!stageConfig) return '';

  const agents = getStageAgentsWithModels(stage);
  const primaryAgents = agents.filter(a => a.primary);

  let instructions = `## Stage: ${stage}

${stageConfig.description}

### Agents to Invoke

`;

  for (const agent of primaryAgents) {
    instructions += `- **${agent.name}** (model: ${agent.model}) - Required\n`;
  }

  if (config.parallelExecution && primaryAgents.length > 1) {
    instructions += `
### Execution Mode: Parallel

Invoke all primary agents in parallel using the Task tool.
Example:
\`\`\`
Task(subagent_type="oh-my-claudecode:${primaryAgents[0].name}", model="${primaryAgents[0].model}", prompt="...")
Task(subagent_type="oh-my-claudecode:${primaryAgents[1]?.name || primaryAgents[0].name}", model="${primaryAgents[1]?.model || primaryAgents[0].model}", prompt="...")
\`\`\`
`;
  } else {
    instructions += `
### Execution Mode: Sequential

Invoke agents one at a time, passing results forward.
`;
  }

  instructions += `
### Next Steps

- On success: Transition to **${stageConfig.nextStage}**
- On failure: Transition to **${stageConfig.failureStage || 'failed'}**

Use \`team_transition\` to move to the next stage when complete.
`;

  return instructions;
}
