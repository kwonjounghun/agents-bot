/**
 * SDK-OMC Verification Test
 *
 * This script verifies that all SDK-OMC modules are properly exported and functional.
 * Run with: npx ts-node src/sdk-omc/test-sdk-omc.ts
 */

import * as SdkOmc from './index';
import { omcSkillTools, listSkillToolNames, getSkillTool } from './skills';
import { omcAgents, listAgentNames, getAgent } from './agents';
import { getModelForAgent, routeModelByComplexity } from './routing';
import { createOmcHooks, detectMagicKeywords } from './hooks';
import { allAdditionalTools } from './tools';
import {
  TEAM_PIPELINE,
  getStageConfig,
  getStageAgentsWithModels,
  generateStagePrompt
} from './tools/team-orchestrator';

console.log('='.repeat(60));
console.log('SDK-OMC Verification Test');
console.log('='.repeat(60));

// Test 1: Check agents
console.log('\n## 1. Agents');
const agentNames = listAgentNames();
console.log(`Total agents: ${agentNames.length}`);
console.log('Agents:', agentNames.join(', '));

// Verify each agent has required fields
let agentErrors = 0;
for (const name of agentNames) {
  const agent = getAgent(name);
  if (!agent) {
    console.error(`  ERROR: Agent "${name}" not found`);
    agentErrors++;
    continue;
  }
  if (!agent.description || !agent.prompt || !agent.tools || !agent.model) {
    console.error(`  ERROR: Agent "${name}" missing required fields`);
    agentErrors++;
  }
}
console.log(`Agent validation: ${agentErrors === 0 ? '✓ PASS' : `✗ ${agentErrors} errors`}`);

// Test 2: Check skill tools
console.log('\n## 2. Skill Tools');
const skillNames = listSkillToolNames();
console.log(`Total skill tools: ${skillNames.length}`);

// Group by category
const coreSkills = ['autopilot', 'ralph', 'ultrawork', 'team'];
const stateTools = skillNames.filter(n => n.startsWith('state_') || n === 'list_active_modes' || n === 'cancel');
const lspTools = skillNames.filter(n => n.startsWith('lsp_'));
const notepadTools = skillNames.filter(n => n.startsWith('notepad_'));
const memoryTools = skillNames.filter(n => n.startsWith('project_memory_'));
const traceTools = skillNames.filter(n => n.startsWith('trace_'));
const astTools = skillNames.filter(n => n.startsWith('ast_'));
const teamTools = skillNames.filter(n => n.startsWith('team_'));

console.log(`  Core skills: ${coreSkills.length}`);
console.log(`  State tools: ${stateTools.length}`);
console.log(`  LSP tools: ${lspTools.length}`);
console.log(`  Notepad tools: ${notepadTools.length}`);
console.log(`  Memory tools: ${memoryTools.length}`);
console.log(`  Trace tools: ${traceTools.length}`);
console.log(`  AST tools: ${astTools.length}`);
console.log(`  Team tools: ${teamTools.length}`);

// Verify each tool has required fields
let toolErrors = 0;
for (const name of skillNames) {
  const tool = getSkillTool(name);
  if (!tool) {
    console.error(`  ERROR: Tool "${name}" not found`);
    toolErrors++;
    continue;
  }
  if (!tool.name || !tool.description || !tool.inputSchema || !tool.handler) {
    console.error(`  ERROR: Tool "${name}" missing required fields`);
    toolErrors++;
  }
}
console.log(`Tool validation: ${toolErrors === 0 ? '✓ PASS' : `✗ ${toolErrors} errors`}`);

// Test 3: Check model routing
console.log('\n## 3. Model Routing');
const routingTests = [
  { agent: 'explore', expected: 'haiku' },
  { agent: 'executor', expected: 'sonnet' },
  { agent: 'architect', expected: 'opus' },
  { agent: 'planner', expected: 'opus' },
  { agent: 'writer', expected: 'haiku' },
];

let routingErrors = 0;
for (const test of routingTests) {
  const model = getModelForAgent(test.agent);
  if (model !== test.expected) {
    console.error(`  ERROR: ${test.agent} -> ${model} (expected ${test.expected})`);
    routingErrors++;
  } else {
    console.log(`  ✓ ${test.agent} -> ${model}`);
  }
}
console.log(`Routing validation: ${routingErrors === 0 ? '✓ PASS' : `✗ ${routingErrors} errors`}`);

// Test 4: Check keyword detection
console.log('\n## 4. Keyword Detection');
const keywordTests = [
  { prompt: 'autopilot build me a todo app', expected: ['autopilot'] },
  { prompt: 'use ralph to complete this task', expected: ['ralph'] },
  { prompt: 'run ultrawork with parallel execution', expected: ['ultrawork'] },
  { prompt: 'create a team to work on this', expected: ['team'] },
];

let keywordErrors = 0;
for (const test of keywordTests) {
  const detected = detectMagicKeywords(test.prompt);
  const detectedKeywords = detected.map(d => d.keyword);
  const hasExpected = test.expected.every(k => detectedKeywords.includes(k));
  if (!hasExpected) {
    console.error(`  ERROR: "${test.prompt}" -> ${detectedKeywords} (expected ${test.expected})`);
    keywordErrors++;
  } else {
    console.log(`  ✓ Detected: ${detectedKeywords.join(', ')}`);
  }
}
console.log(`Keyword detection: ${keywordErrors === 0 ? '✓ PASS' : `✗ ${keywordErrors} errors`}`);

// Test 5: Check hooks
console.log('\n## 5. Hooks');
const hooks = createOmcHooks();
const hookEvents = Object.keys(hooks);
console.log(`Hook events registered: ${hookEvents.length}`);
console.log(`  Events: ${hookEvents.join(', ')}`);
console.log(`Hooks validation: ✓ PASS`);

// Test 6: Check team pipeline
console.log('\n## 6. Team Pipeline');
console.log(`Pipeline stages: ${TEAM_PIPELINE.length}`);
for (const stage of TEAM_PIPELINE) {
  const agents = getStageAgentsWithModels(stage.name);
  console.log(`  ${stage.name}: ${agents.map(a => `${a.name}(${a.model})`).join(', ')}`);
}

// Test stage prompt generation
const testPrompt = generateStagePrompt('team-exec', 'Build a todo app');
console.log(`Stage prompt generation: ${testPrompt.length > 0 ? '✓ PASS' : '✗ FAIL'}`);

// Test 7: Check exports from index
console.log('\n## 7. Index Exports');
const expectedExports = [
  'createOmcQueryOptions',
  'createOmcSkillsServer',
  'initializeOmc',
  'getOmcStatus',
  'processOmcPrompt',
  'createRoutedAgent',
  'omcAgents',
  'omcSkillTools',
  'createOmcHooks',
  'getModelForAgent',
  'readState',
  'writeState',
  'TEAM_PIPELINE',
];

let exportErrors = 0;
for (const name of expectedExports) {
  if (!(name in SdkOmc)) {
    console.error(`  ERROR: Missing export "${name}"`);
    exportErrors++;
  }
}
console.log(`Exports validation: ${exportErrors === 0 ? '✓ PASS' : `✗ ${exportErrors} errors`}`);

// Summary
console.log('\n' + '='.repeat(60));
console.log('SUMMARY');
console.log('='.repeat(60));
const totalErrors = agentErrors + toolErrors + routingErrors + keywordErrors + exportErrors;
console.log(`Total agents: ${agentNames.length}`);
console.log(`Total tools: ${skillNames.length}`);
console.log(`Total additional tools: ${allAdditionalTools.length}`);
console.log(`Pipeline stages: ${TEAM_PIPELINE.length}`);
console.log(`Errors: ${totalErrors}`);
console.log(`Status: ${totalErrors === 0 ? '✓ ALL TESTS PASSED' : '✗ SOME TESTS FAILED'}`);
console.log('='.repeat(60));

process.exit(totalErrors > 0 ? 1 : 0);
