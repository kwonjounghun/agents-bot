/**
 * SDK-OMC Trace Tools
 *
 * Execution trace tools for tracking agent flow and session history.
 * Traces are stored in .omc/logs/ directory.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ToolDefinition } from '../skills';

const TRACE_DIR = 'logs';
const TRACE_FILENAME = 'trace.jsonl';

interface TraceEvent {
  timestamp: string;
  type: 'hook' | 'skill' | 'agent' | 'tool' | 'mode';
  name: string;
  action: 'start' | 'end' | 'error';
  details?: Record<string, unknown>;
  duration_ms?: number;
}

interface TraceSummary {
  totalEvents: number;
  byType: Record<string, number>;
  byName: Record<string, number>;
  errors: number;
  startTime?: string;
  endTime?: string;
  totalDuration_ms?: number;
}

/**
 * Get trace directory path
 */
function getTraceDir(workingDirectory: string): string {
  return path.join(workingDirectory, '.omc', TRACE_DIR);
}

/**
 * Get trace file path
 */
function getTracePath(workingDirectory: string, sessionId?: string): string {
  const dir = getTraceDir(workingDirectory);
  const filename = sessionId ? `trace-${sessionId}.jsonl` : TRACE_FILENAME;
  return path.join(dir, filename);
}

/**
 * Ensure trace directory exists
 */
function ensureTraceDir(workingDirectory: string): void {
  const traceDir = getTraceDir(workingDirectory);
  if (!fs.existsSync(traceDir)) {
    fs.mkdirSync(traceDir, { recursive: true });
  }
}

/**
 * Read trace events
 */
function readTraceEvents(workingDirectory: string, sessionId?: string): TraceEvent[] {
  const tracePath = getTracePath(workingDirectory, sessionId);

  if (!fs.existsSync(tracePath)) {
    return [];
  }

  const content = fs.readFileSync(tracePath, 'utf-8');
  const lines = content.trim().split('\n').filter(line => line.trim());

  return lines.map(line => {
    try {
      return JSON.parse(line) as TraceEvent;
    } catch {
      return null;
    }
  }).filter((event): event is TraceEvent => event !== null);
}

/**
 * Append trace event
 */
function appendTraceEvent(event: TraceEvent, workingDirectory: string, sessionId?: string): void {
  ensureTraceDir(workingDirectory);
  const tracePath = getTracePath(workingDirectory, sessionId);
  const line = JSON.stringify(event) + '\n';
  fs.appendFileSync(tracePath, line, 'utf-8');
}

/**
 * Trace Timeline Tool
 */
export const traceTimelineTool: ToolDefinition = {
  name: 'trace_timeline',
  description: 'Show chronological agent flow trace timeline. Displays hooks, keywords, skills, agents, and tools in time order.',
  inputSchema: {
    type: 'object',
    properties: {
      filter: {
        type: 'string',
        enum: ['all', 'hooks', 'skills', 'agents', 'tools', 'modes'],
        description: 'Filter by event type',
        default: 'all'
      },
      last: {
        type: 'number',
        description: 'Show only the last N events',
        default: 50
      },
      sessionId: {
        type: 'string',
        description: 'Specific session ID to read traces from'
      }
    }
  },
  handler: async (args, context) => {
    const filter = (args.filter as string) || 'all';
    const last = (args.last as number) || 50;
    const sessionId = args.sessionId as string | undefined;
    const cwd = context?.cwd || process.cwd();

    let events = readTraceEvents(cwd, sessionId);

    // Filter by type
    if (filter !== 'all') {
      const typeMap: Record<string, string> = {
        'hooks': 'hook',
        'skills': 'skill',
        'agents': 'agent',
        'tools': 'tool',
        'modes': 'mode'
      };
      const targetType = typeMap[filter] || filter;
      events = events.filter(e => e.type === targetType);
    }

    // Get last N events
    events = events.slice(-last);

    if (events.length === 0) {
      return {
        content: [{ type: 'text', text: 'No trace events found.' }]
      };
    }

    // Format timeline
    const lines = events.map(event => {
      const time = event.timestamp.split('T')[1]?.slice(0, 8) || event.timestamp;
      const icon = getEventIcon(event.type);
      const action = event.action === 'error' ? ' ERROR' : event.action === 'end' ? ' done' : '';
      const duration = event.duration_ms ? ` (${event.duration_ms}ms)` : '';
      return `[${time}] ${icon} ${event.name}${action}${duration}`;
    });

    return {
      content: [{
        type: 'text',
        text: `## Trace Timeline (${events.length} events)\n\n${lines.join('\n')}`
      }]
    };
  }
};

/**
 * Get icon for event type
 */
function getEventIcon(type: string): string {
  const icons: Record<string, string> = {
    'hook': 'H',
    'skill': 'S',
    'agent': 'A',
    'tool': 'T',
    'mode': 'M'
  };
  return `[${icons[type] || '?'}]`;
}

/**
 * Trace Summary Tool
 */
export const traceSummaryTool: ToolDefinition = {
  name: 'trace_summary',
  description: 'Show aggregate statistics for an agent flow trace session. Includes hook stats, skill activations, mode transitions, and tool usage.',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'Specific session ID to summarize'
      }
    }
  },
  handler: async (args, context) => {
    const sessionId = args.sessionId as string | undefined;
    const cwd = context?.cwd || process.cwd();

    const events = readTraceEvents(cwd, sessionId);

    if (events.length === 0) {
      return {
        content: [{ type: 'text', text: 'No trace events found.' }]
      };
    }

    // Build summary
    const summary: TraceSummary = {
      totalEvents: events.length,
      byType: {},
      byName: {},
      errors: 0
    };

    for (const event of events) {
      // Count by type
      summary.byType[event.type] = (summary.byType[event.type] || 0) + 1;

      // Count by name
      summary.byName[event.name] = (summary.byName[event.name] || 0) + 1;

      // Count errors
      if (event.action === 'error') {
        summary.errors++;
      }

      // Track time range
      if (!summary.startTime || event.timestamp < summary.startTime) {
        summary.startTime = event.timestamp;
      }
      if (!summary.endTime || event.timestamp > summary.endTime) {
        summary.endTime = event.timestamp;
      }
    }

    // Calculate total duration
    if (summary.startTime && summary.endTime) {
      const start = new Date(summary.startTime).getTime();
      const end = new Date(summary.endTime).getTime();
      summary.totalDuration_ms = end - start;
    }

    // Format summary
    const typeLines = Object.entries(summary.byType)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => `  ${type}: ${count}`);

    const topNames = Object.entries(summary.byName)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => `  ${name}: ${count}`);

    return {
      content: [{
        type: 'text',
        text: `## Trace Summary

**Total Events**: ${summary.totalEvents}
**Errors**: ${summary.errors}
**Duration**: ${summary.totalDuration_ms ? `${(summary.totalDuration_ms / 1000).toFixed(1)}s` : 'N/A'}
**Time Range**: ${summary.startTime || 'N/A'} - ${summary.endTime || 'N/A'}

### By Type
${typeLines.join('\n')}

### Top 10 Most Frequent
${topNames.join('\n')}`
      }]
    };
  }
};

/**
 * Trace Log Tool (for programmatic logging)
 */
export const traceLogTool: ToolDefinition = {
  name: 'trace_log',
  description: 'Log a trace event for the current session.',
  inputSchema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['hook', 'skill', 'agent', 'tool', 'mode'],
        description: 'Event type'
      },
      name: {
        type: 'string',
        description: 'Event name'
      },
      action: {
        type: 'string',
        enum: ['start', 'end', 'error'],
        description: 'Event action'
      },
      details: {
        type: 'object',
        description: 'Additional details'
      },
      sessionId: {
        type: 'string',
        description: 'Session ID for the trace'
      }
    },
    required: ['type', 'name', 'action']
  },
  handler: async (args, context) => {
    const event: TraceEvent = {
      timestamp: new Date().toISOString(),
      type: args.type as TraceEvent['type'],
      name: args.name as string,
      action: args.action as TraceEvent['action'],
      details: args.details as Record<string, unknown> | undefined
    };

    const cwd = context?.cwd || process.cwd();
    const sessionId = args.sessionId as string | undefined;

    appendTraceEvent(event, cwd, sessionId);

    return {
      content: [{ type: 'text', text: `Trace event logged: ${event.type}/${event.name}/${event.action}` }]
    };
  }
};

/**
 * Trace Clear Tool
 */
export const traceClearTool: ToolDefinition = {
  name: 'trace_clear',
  description: 'Clear trace logs for a session or all sessions.',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'Specific session ID to clear (omit to clear all)'
      }
    }
  },
  handler: async (args, context) => {
    const sessionId = args.sessionId as string | undefined;
    const cwd = context?.cwd || process.cwd();

    if (sessionId) {
      const tracePath = getTracePath(cwd, sessionId);
      if (fs.existsSync(tracePath)) {
        fs.unlinkSync(tracePath);
        return {
          content: [{ type: 'text', text: `Cleared trace for session: ${sessionId}` }]
        };
      }
      return {
        content: [{ type: 'text', text: `No trace found for session: ${sessionId}` }]
      };
    }

    // Clear all traces
    const traceDir = getTraceDir(cwd);
    if (fs.existsSync(traceDir)) {
      const files = fs.readdirSync(traceDir).filter(f => f.endsWith('.jsonl'));
      for (const file of files) {
        fs.unlinkSync(path.join(traceDir, file));
      }
      return {
        content: [{ type: 'text', text: `Cleared ${files.length} trace files` }]
      };
    }

    return {
      content: [{ type: 'text', text: 'No trace files to clear' }]
    };
  }
};

/**
 * All trace tools
 */
export const traceTools: ToolDefinition[] = [
  traceTimelineTool,
  traceSummaryTool,
  traceLogTool,
  traceClearTool
];
