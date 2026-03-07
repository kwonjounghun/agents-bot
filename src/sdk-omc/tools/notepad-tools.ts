/**
 * SDK-OMC Notepad Tools
 *
 * Session memory tools for persisting notes across conversation turns.
 * Notes are stored in .omc/notepad.md with sections:
 * - Priority: Always loaded (max 500 chars)
 * - Working: Timestamped entries, auto-pruned after 7 days
 * - Manual: Permanent entries, never auto-pruned
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ToolDefinition } from '../skills';

const NOTEPAD_FILENAME = 'notepad.md';

interface NotepadSections {
  priority: string;
  working: string[];
  manual: string[];
}

/**
 * Get notepad file path
 */
function getNotepadPath(workingDirectory: string): string {
  return path.join(workingDirectory, '.omc', NOTEPAD_FILENAME);
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
 * Parse notepad content into sections
 */
function parseNotepad(content: string): NotepadSections {
  const sections: NotepadSections = {
    priority: '',
    working: [],
    manual: []
  };

  let currentSection: 'priority' | 'working' | 'manual' | null = null;
  const lines = content.split('\n');

  for (const line of lines) {
    if (line.startsWith('## Priority Context')) {
      currentSection = 'priority';
      continue;
    } else if (line.startsWith('## Working Memory')) {
      currentSection = 'working';
      continue;
    } else if (line.startsWith('## Manual Notes')) {
      currentSection = 'manual';
      continue;
    }

    if (currentSection === 'priority') {
      sections.priority += line + '\n';
    } else if (currentSection === 'working' && line.trim()) {
      sections.working.push(line);
    } else if (currentSection === 'manual' && line.trim()) {
      sections.manual.push(line);
    }
  }

  sections.priority = sections.priority.trim();
  return sections;
}

/**
 * Format notepad sections to markdown
 */
function formatNotepad(sections: NotepadSections): string {
  let content = '# Session Notepad\n\n';

  content += '## Priority Context\n';
  content += sections.priority + '\n\n';

  content += '## Working Memory\n';
  for (const entry of sections.working) {
    content += entry + '\n';
  }
  content += '\n';

  content += '## Manual Notes\n';
  for (const entry of sections.manual) {
    content += entry + '\n';
  }

  return content;
}

/**
 * Read notepad content
 */
function readNotepad(workingDirectory: string): NotepadSections {
  const notepadPath = getNotepadPath(workingDirectory);

  if (!fs.existsSync(notepadPath)) {
    return { priority: '', working: [], manual: [] };
  }

  const content = fs.readFileSync(notepadPath, 'utf-8');
  return parseNotepad(content);
}

/**
 * Write notepad content
 */
function writeNotepad(sections: NotepadSections, workingDirectory: string): void {
  ensureOmcDir(workingDirectory);
  const notepadPath = getNotepadPath(workingDirectory);
  const content = formatNotepad(sections);
  fs.writeFileSync(notepadPath, content, 'utf-8');
}

/**
 * Notepad Read Tool
 */
export const notepadReadTool: ToolDefinition = {
  name: 'notepad_read',
  description: 'Read notepad content. Can read all sections or a specific section (priority, working, manual).',
  inputSchema: {
    type: 'object',
    properties: {
      section: {
        type: 'string',
        enum: ['all', 'priority', 'working', 'manual'],
        description: 'Section to read',
        default: 'all'
      }
    }
  },
  handler: async (args, context) => {
    const section = (args.section as string) || 'all';
    const cwd = context?.cwd || process.cwd();
    const sections = readNotepad(cwd);

    if (section === 'priority') {
      return {
        content: [{ type: 'text', text: `## Priority Context\n${sections.priority || '(empty)'}` }]
      };
    } else if (section === 'working') {
      return {
        content: [{
          type: 'text',
          text: `## Working Memory\n${sections.working.length > 0 ? sections.working.join('\n') : '(empty)'}`
        }]
      };
    } else if (section === 'manual') {
      return {
        content: [{
          type: 'text',
          text: `## Manual Notes\n${sections.manual.length > 0 ? sections.manual.join('\n') : '(empty)'}`
        }]
      };
    } else {
      return {
        content: [{ type: 'text', text: formatNotepad(sections) }]
      };
    }
  }
};

/**
 * Notepad Write Priority Tool
 */
export const notepadWritePriorityTool: ToolDefinition = {
  name: 'notepad_write_priority',
  description: 'Write to Priority Context section. REPLACES existing content. Keep under 500 chars - always loaded at session start.',
  inputSchema: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'Content to write (recommend under 500 chars)'
      }
    },
    required: ['content']
  },
  handler: async (args, context) => {
    const content = args.content as string;
    const cwd = context?.cwd || process.cwd();

    if (content.length > 500) {
      return {
        content: [{
          type: 'text',
          text: `Warning: Content exceeds 500 chars (${content.length}). Consider shortening for optimal performance.`
        }]
      };
    }

    const sections = readNotepad(cwd);
    sections.priority = content;
    writeNotepad(sections, cwd);

    return {
      content: [{ type: 'text', text: `Priority context updated (${content.length} chars)` }]
    };
  }
};

/**
 * Notepad Write Working Tool
 */
export const notepadWriteWorkingTool: ToolDefinition = {
  name: 'notepad_write_working',
  description: 'Add an entry to Working Memory section. Entries are timestamped and auto-pruned after 7 days.',
  inputSchema: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'Content to add as a new entry'
      }
    },
    required: ['content']
  },
  handler: async (args, context) => {
    const content = args.content as string;
    const cwd = context?.cwd || process.cwd();

    const timestamp = new Date().toISOString();
    const entry = `- [${timestamp}] ${content}`;

    const sections = readNotepad(cwd);
    sections.working.push(entry);
    writeNotepad(sections, cwd);

    return {
      content: [{ type: 'text', text: `Working memory entry added` }]
    };
  }
};

/**
 * Notepad Write Manual Tool
 */
export const notepadWriteManualTool: ToolDefinition = {
  name: 'notepad_write_manual',
  description: 'Add an entry to Manual Notes section. Content is never auto-pruned.',
  inputSchema: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'Content to add as a new entry'
      }
    },
    required: ['content']
  },
  handler: async (args, context) => {
    const content = args.content as string;
    const cwd = context?.cwd || process.cwd();

    const entry = `- ${content}`;

    const sections = readNotepad(cwd);
    sections.manual.push(entry);
    writeNotepad(sections, cwd);

    return {
      content: [{ type: 'text', text: `Manual note added` }]
    };
  }
};

/**
 * Notepad Prune Tool
 */
export const notepadPruneTool: ToolDefinition = {
  name: 'notepad_prune',
  description: 'Prune Working Memory entries older than N days (default: 7 days).',
  inputSchema: {
    type: 'object',
    properties: {
      daysOld: {
        type: 'number',
        description: 'Remove entries older than this many days',
        default: 7
      }
    }
  },
  handler: async (args, context) => {
    const daysOld = (args.daysOld as number) || 7;
    const cwd = context?.cwd || process.cwd();

    const sections = readNotepad(cwd);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const originalCount = sections.working.length;
    sections.working = sections.working.filter(entry => {
      const match = entry.match(/\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);
      if (!match) return true; // Keep entries without valid timestamp

      const entryDate = new Date(match[1]);
      return entryDate > cutoffDate;
    });

    const prunedCount = originalCount - sections.working.length;
    writeNotepad(sections, cwd);

    return {
      content: [{
        type: 'text',
        text: `Pruned ${prunedCount} entries older than ${daysOld} days. ${sections.working.length} entries remaining.`
      }]
    };
  }
};

/**
 * Notepad Stats Tool
 */
export const notepadStatsTool: ToolDefinition = {
  name: 'notepad_stats',
  description: 'Get statistics about the notepad (size, entry count, oldest entry).',
  inputSchema: {
    type: 'object',
    properties: {}
  },
  handler: async (args, context) => {
    const cwd = context?.cwd || process.cwd();
    const notepadPath = getNotepadPath(cwd);

    if (!fs.existsSync(notepadPath)) {
      return {
        content: [{ type: 'text', text: 'No notepad file exists yet.' }]
      };
    }

    const sections = readNotepad(cwd);
    const stats = fs.statSync(notepadPath);

    let oldestEntry = 'N/A';
    for (const entry of sections.working) {
      const match = entry.match(/\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);
      if (match) {
        if (oldestEntry === 'N/A' || match[1] < oldestEntry) {
          oldestEntry = match[1];
        }
      }
    }

    return {
      content: [{
        type: 'text',
        text: `Notepad Statistics:
- File size: ${stats.size} bytes
- Priority context: ${sections.priority.length} chars
- Working memory entries: ${sections.working.length}
- Manual notes: ${sections.manual.length}
- Oldest working entry: ${oldestEntry}`
      }]
    };
  }
};

/**
 * All notepad tools
 */
export const notepadTools: ToolDefinition[] = [
  notepadReadTool,
  notepadWritePriorityTool,
  notepadWriteWorkingTool,
  notepadWriteManualTool,
  notepadPruneTool,
  notepadStatsTool
];
