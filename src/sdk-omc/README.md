# SDK-OMC: Oh-My-ClaudeCode for Claude Agent SDK

SDK-native implementation of oh-my-claudecode core features. Use OMC capabilities directly with the Claude Agent SDK without requiring external CLI installation.

## Features

- **17 Specialized Agents**: explore, planner, executor, architect, debugger, verifier, and more
- **Model Routing**: Automatic model selection (haiku/sonnet/opus) based on agent type and task complexity
- **Skills**: autopilot, ralph, ultrawork, team - implemented as MCP tools
- **Hooks**: Keyword detection, mode protection, agent coordination
- **State Management**: Persistent mode state for long-running workflows

## Quick Start

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';
import { createOmcQueryOptions, omcAgents } from '../sdk-omc';

// Get OMC-enabled query options
const omcOptions = createOmcQueryOptions({
  enableAgents: true,
  enableSkills: true,
  enableHooks: true,
  workingDirectory: process.cwd()
});

// Use with SDK query
for await (const message of query({
  prompt: 'Build a REST API for user management',
  options: {
    ...omcOptions,
    // Your additional options
  }
})) {
  // Process messages
}
```

## Agents

### Build/Analysis Lane
- `explore` (haiku) - Codebase discovery and file mapping
- `planner` (opus) - Strategic planning and task decomposition
- `executor` (sonnet) - Code implementation and refactoring
- `deep-executor` (opus) - Complex autonomous tasks
- `architect` (opus) - System design and boundaries
- `debugger` (sonnet) - Root-cause analysis
- `verifier` (sonnet) - Completion verification
- `analyst` (opus) - Requirements clarity

### Review Lane
- `code-reviewer` (opus) - Comprehensive code review
- `security-reviewer` (sonnet) - Security vulnerability detection
- `quality-reviewer` (sonnet) - Logic defects and maintainability

### Domain Specialists
- `designer` (sonnet) - UI/UX architecture
- `test-engineer` (sonnet) - Test strategy and coverage
- `writer` (haiku) - Documentation
- `qa-tester` (sonnet) - Interactive validation
- `scientist` (sonnet) - Data analysis
- `document-specialist` (sonnet) - External documentation lookup

### Coordination
- `critic` (opus) - Plan and design challenge

## Skills (MCP Tools)

When enableSkills is true, these tools are available:

- `mcp__omc-skills__autopilot` - Full autonomous execution
- `mcp__omc-skills__ralph` - Persistent loop until completion
- `mcp__omc-skills__ultrawork` - Parallel agent execution
- `mcp__omc-skills__team` - Coordinated multi-agent execution
- `mcp__omc-skills__state_read` - Read mode state
- `mcp__omc-skills__state_write` - Write mode state
- `mcp__omc-skills__state_clear` - Clear mode state
- `mcp__omc-skills__list_active_modes` - List active modes
- `mcp__omc-skills__cancel` - Cancel active modes

## Hooks

### Keyword Detection (UserPromptSubmit)
Detects magic keywords in prompts and injects appropriate context:
- `autopilot` - Activates autopilot mode
- `ralph` - Activates persistent loop mode
- `team` - Activates multi-agent coordination
- `ultrawork` - Activates parallel execution
- `@executor`, `@architect`, etc. - Agent references

### Mode Protection (Stop)
Prevents stopping while persistent modes (autopilot, ralph, team) are active.

### Coordination (SubagentStart/SubagentStop)
Tracks agent lifecycle for coordination and UI updates.

## Model Routing

Automatic model selection based on:
1. **Agent type**: Each agent has a default model tier
2. **Task complexity**: Keywords trigger escalation/simplification
3. **Manual override**: Specify model in agent configuration

```typescript
import { getModelForAgent, routeModelByComplexity } from '../sdk-omc';

// Get model for an agent
const model = getModelForAgent('architect'); // 'opus'

// Route by task description
const tier = routeModelByComplexity('design the system architecture'); // 'opus'
```

## State Management

```typescript
import { readState, writeState, listActiveModes } from '../sdk-omc';

// Check active modes
const modes = await listActiveModes('/path/to/project');

// Read specific mode state
const state = await readState('autopilot', '/path/to/project');

// Write state
await writeState('autopilot', { active: true, iteration: 1 }, '/path/to/project');
```

## Integration with ClaudeAgentService

```typescript
const service = new ClaudeAgentService();

// Enable SDK-OMC mode
service.enableSdkOmc();

// Initialize
await service.initSdkOmc('/path/to/project');

// Get agents for configuration
const agents = service.getSdkOmcAgents();

// Process prompt for keywords
const processed = service.processSdkOmcPrompt('Use autopilot to build this');
console.log(processed.suggestedMode); // 'autopilot'
console.log(processed.modelTier); // 'opus'
```

## Comparison with External OMC

| Feature | SDK-OMC | External OMC |
|---------|---------|--------------|
| Installation | Built-in | Requires ~/.claude/plugins |
| Dependencies | None | OMC npm package |
| Agents | 17 | 17 |
| Skills | 9 (as MCP tools) | 30+ (full skill system) |
| Hooks | 4 types | 18+ types |
| State | File-based | File-based |
| MCP Tools | Skills only | LSP, AST, Python REPL, etc. |

SDK-OMC provides core OMC functionality for SDK-only usage. For full OMC features, use the external oh-my-claudecode plugin.
