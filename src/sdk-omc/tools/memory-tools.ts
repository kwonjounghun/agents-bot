/**
 * SDK-OMC Memory Tools
 *
 * Project memory tools for persisting project-specific information.
 * Memory is stored in .omc/project-memory.json with sections:
 * - techStack: Technologies used
 * - build: Build commands and scripts
 * - conventions: Coding conventions
 * - structure: Project structure notes
 * - notes: Categorized notes
 * - directives: User directives (high priority instructions)
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ToolDefinition } from '../skills';

const MEMORY_FILENAME = 'project-memory.json';

interface ProjectMemory {
  techStack?: string;
  build?: string;
  conventions?: string;
  structure?: string;
  notes?: Record<string, string[]>;
  directives?: Array<{
    directive: string;
    priority?: 'high' | 'normal';
    context?: string;
    addedAt?: string;
  }>;
}

/**
 * Get memory file path
 */
function getMemoryPath(workingDirectory: string): string {
  return path.join(workingDirectory, '.omc', MEMORY_FILENAME);
}

/**
 * Ensure .omc directory exists
 */
function ensureOmcDir(workingDirectory: string): void {
  const omcDir = path.join(workingDirectory, '.omc');
  if (!fs.existsSync(omcDir)) {
    fs.mkdirSync(omcDir, { recursive: true });
  }
}

/**
 * Read project memory
 */
function readMemory(workingDirectory: string): ProjectMemory {
  const memoryPath = getMemoryPath(workingDirectory);

  if (!fs.existsSync(memoryPath)) {
    return {};
  }

  try {
    const content = fs.readFileSync(memoryPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

/**
 * Write project memory
 */
function writeMemory(memory: ProjectMemory, workingDirectory: string): void {
  ensureOmcDir(workingDirectory);
  const memoryPath = getMemoryPath(workingDirectory);
  fs.writeFileSync(memoryPath, JSON.stringify(memory, null, 2), 'utf-8');
}

/**
 * Project Memory Read Tool
 */
export const projectMemoryReadTool: ToolDefinition = {
  name: 'project_memory_read',
  description: 'Read project memory. Can read all sections or a specific section (techStack, build, conventions, structure, notes, directives).',
  inputSchema: {
    type: 'object',
    properties: {
      section: {
        type: 'string',
        enum: ['all', 'techStack', 'build', 'conventions', 'structure', 'notes', 'directives'],
        description: 'Section to read',
        default: 'all'
      }
    }
  },
  handler: async (args, context) => {
    const section = (args.section as string) || 'all';
    const cwd = context?.cwd || process.cwd();
    const memory = readMemory(cwd);

    if (section === 'all') {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(memory, null, 2) || '(empty)'
        }]
      };
    }

    const value = memory[section as keyof ProjectMemory];
    return {
      content: [{
        type: 'text',
        text: `## ${section}\n${JSON.stringify(value, null, 2) || '(empty)'}`
      }]
    };
  }
};

/**
 * Project Memory Write Tool
 */
export const projectMemoryWriteTool: ToolDefinition = {
  name: 'project_memory_write',
  description: 'Write/update project memory. Can replace entirely or merge with existing memory.',
  inputSchema: {
    type: 'object',
    properties: {
      memory: {
        type: 'object',
        description: 'The memory object to write'
      },
      merge: {
        type: 'boolean',
        description: 'If true, merge with existing memory instead of replacing',
        default: true
      }
    },
    required: ['memory']
  },
  handler: async (args, context) => {
    const newMemory = args.memory as ProjectMemory;
    const merge = args.merge !== false;
    const cwd = context?.cwd || process.cwd();

    let finalMemory: ProjectMemory;

    if (merge) {
      const existing = readMemory(cwd);
      finalMemory = { ...existing, ...newMemory };

      // Deep merge notes if both exist
      if (existing.notes && newMemory.notes) {
        finalMemory.notes = { ...existing.notes, ...newMemory.notes };
      }

      // Concatenate directives if both exist
      if (existing.directives && newMemory.directives) {
        finalMemory.directives = [...existing.directives, ...newMemory.directives];
      }
    } else {
      finalMemory = newMemory;
    }

    writeMemory(finalMemory, cwd);

    return {
      content: [{ type: 'text', text: `Project memory ${merge ? 'merged' : 'replaced'}` }]
    };
  }
};

/**
 * Project Memory Add Note Tool
 */
export const projectMemoryAddNoteTool: ToolDefinition = {
  name: 'project_memory_add_note',
  description: 'Add a custom note to project memory. Notes are categorized and persisted across sessions.',
  inputSchema: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        description: 'Note category (e.g., "build", "test", "deploy", "env", "architecture")'
      },
      content: {
        type: 'string',
        description: 'Note content'
      }
    },
    required: ['category', 'content']
  },
  handler: async (args, context) => {
    const category = args.category as string;
    const content = args.content as string;
    const cwd = context?.cwd || process.cwd();

    const memory = readMemory(cwd);

    if (!memory.notes) {
      memory.notes = {};
    }

    if (!memory.notes[category]) {
      memory.notes[category] = [];
    }

    memory.notes[category].push(content);
    writeMemory(memory, cwd);

    return {
      content: [{
        type: 'text',
        text: `Note added to category: ${category}`
      }]
    };
  }
};

/**
 * Project Memory Add Directive Tool
 */
export const projectMemoryAddDirectiveTool: ToolDefinition = {
  name: 'project_memory_add_directive',
  description: 'Add a user directive to project memory. Directives are instructions that persist across sessions and survive compaction.',
  inputSchema: {
    type: 'object',
    properties: {
      directive: {
        type: 'string',
        description: 'The directive (e.g., "Always use TypeScript strict mode")'
      },
      priority: {
        type: 'string',
        enum: ['high', 'normal'],
        description: 'Priority level',
        default: 'normal'
      },
      context: {
        type: 'string',
        description: 'Optional context for when this directive applies'
      }
    },
    required: ['directive']
  },
  handler: async (args, context) => {
    const directive = args.directive as string;
    const priority = (args.priority as 'high' | 'normal') || 'normal';
    const directiveContext = args.context as string | undefined;
    const cwd = context?.cwd || process.cwd();

    const memory = readMemory(cwd);

    if (!memory.directives) {
      memory.directives = [];
    }

    memory.directives.push({
      directive,
      priority,
      context: directiveContext,
      addedAt: new Date().toISOString()
    });

    writeMemory(memory, cwd);

    return {
      content: [{
        type: 'text',
        text: `Directive added (priority: ${priority}): ${directive}`
      }]
    };
  }
};

/**
 * Project Memory Clear Section Tool
 */
export const projectMemoryClearSectionTool: ToolDefinition = {
  name: 'project_memory_clear_section',
  description: 'Clear a specific section of project memory.',
  inputSchema: {
    type: 'object',
    properties: {
      section: {
        type: 'string',
        enum: ['techStack', 'build', 'conventions', 'structure', 'notes', 'directives'],
        description: 'Section to clear'
      }
    },
    required: ['section']
  },
  handler: async (args, context) => {
    const section = args.section as keyof ProjectMemory;
    const cwd = context?.cwd || process.cwd();

    const memory = readMemory(cwd);
    delete memory[section];
    writeMemory(memory, cwd);

    return {
      content: [{ type: 'text', text: `Section cleared: ${section}` }]
    };
  }
};

/**
 * All memory tools
 */
export const memoryTools: ToolDefinition[] = [
  projectMemoryReadTool,
  projectMemoryWriteTool,
  projectMemoryAddNoteTool,
  projectMemoryAddDirectiveTool,
  projectMemoryClearSectionTool
];
