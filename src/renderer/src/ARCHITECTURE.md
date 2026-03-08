# Widget Architecture

## Overview

This codebase implements a 3-layer architecture for agent widgets, with clear separation between sub-agent widgets (polling-based) and leader widgets (stream-based).

## Directory Structure

```
src/renderer/src/
├── shared/                 # Shared module (types, components, hooks)
│   ├── types/              # Common type definitions
│   ├── components/         # Reusable UI components
│   ├── hooks/              # Shared hooks (useMessageAccumulator)
│   └── utils/              # Utility functions
│
├── subagent/               # Sub-agent widget module
│   ├── data/               # SDK Layer (polling-based)
│   │   ├── types.ts
│   │   └── useSubagentDataSource.ts
│   ├── hooks/              # Business Logic Layer
│   │   ├── useSubagentState.ts
│   │   └── useSubagentMessages.ts
│   ├── components/         # View Layer
│   │   ├── SubagentAvatar.tsx
│   │   ├── SubagentBubble.tsx
│   │   └── SubagentStatus.tsx
│   └── SubagentWidget.tsx  # Main component
│
├── leader/                 # Leader widget module
│   ├── data/               # SDK Layer (stream-based)
│   │   ├── types.ts
│   │   ├── useLeaderDataSource.ts
│   │   └── useLeaderCommands.ts
│   ├── hooks/              # Business Logic Layer
│   │   ├── useLeaderState.ts
│   │   ├── useLeaderMessages.ts
│   │   └── useSubagentTracking.ts
│   ├── components/         # View Layer
│   │   ├── LeaderHeader.tsx
│   │   ├── LeaderStatusBar.tsx
│   │   ├── LeaderMessageList.tsx
│   │   ├── LeaderInput.tsx
│   │   └── SubagentOverview.tsx
│   └── LeaderWidget.tsx    # Main component
│
└── [Legacy files]          # @deprecated - kept for backward compatibility
    ├── Widget.tsx
    ├── LeaderWidget.tsx
    └── hooks/useMessageAccumulator.ts
```

## Architecture Layers

### 1. SDK Layer (Data)

Responsible for IPC communication with the main process.

| Module | File | Data Source | Description |
|--------|------|-------------|-------------|
| Sub-agent | `useSubagentDataSource.ts` | TranscriptWatcher polling | Polls JSONL files (claude-esp style) |
| Leader | `useLeaderDataSource.ts` | SDK stream | Direct stream from ClaudeAgentService |
| Leader | `useLeaderCommands.ts` | IPC send | Commands to main process |

### 2. Business Logic Layer (Hooks)

Manages state and data transformation.

| Module | Hook | Responsibility |
|--------|------|----------------|
| Shared | `useMessageAccumulator` | Core message accumulation logic |
| Sub-agent | `useSubagentState` | Agent identity and status |
| Sub-agent | `useSubagentMessages` | Message handling + auto-clear on idle |
| Leader | `useLeaderState` | Leader identity, status, processing |
| Leader | `useLeaderMessages` | Message handling for leader |
| Leader | `useSubagentTracking` | Track sub-agent statuses |

### 3. View Layer (Components)

Pure presentational components.

**Shared Components:**
- `StatusIndicator` - Status dot with animation
- `ThinkingDots` - Bouncing dots animation
- `StreamingIndicator` - Inline streaming dots

**Sub-agent Components:**
- `SubagentAvatar` - Avatar with glow effect
- `SubagentBubble` - Speech bubble container
- `SubagentStatus` - Role badge + status

**Leader Components:**
- `LeaderHeader` - Header with badge and close button
- `LeaderStatusBar` - Status bar with sub-agent count
- `SubagentOverview` - Sub-agent status pills
- `LeaderMessageList` - Scrollable message area
- `LeaderInput` - Command input form

## Data Flow

### Sub-agent Widget (Polling)

```
TranscriptWatcher (Main Process)
    │ polls JSONL files (claude-esp style)
    ↓
WidgetManager.sendMessageToWidget()
    │ IPC: widget:message, widget:status
    ↓
window.widgetAPI (Preload)
    │
    ↓
useSubagentDataSource (SDK Layer)
    │ subscribes to IPC events
    ↓
useSubagentMessages (Business Logic)
    │ accumulates messages, auto-clears on idle
    ↓
SubagentWidget (View)
    │
    ↓
SubagentAvatar, SubagentBubble, SubagentStatus
```

### Leader Widget (Streaming)

```
ClaudeAgentService (Main Process)
    │ SDK stream directly
    ↓
LeaderAgentManager
    │ IPC: leader:message, leader:status, etc.
    ↓
window.leaderAPI (Preload)
    │
    ↓
useLeaderDataSource (SDK Layer)
    │ subscribes to IPC events
    ↓
useLeaderState, useLeaderMessages, useSubagentTracking (Business Logic)
    │ manages state and messages
    ↓
LeaderWidget (View)
    │
    ↓
LeaderHeader, LeaderMessageList, LeaderInput, SubagentOverview
```

## Key Differences

| Aspect | Sub-agent | Leader |
|--------|-----------|--------|
| Data Source | JSONL polling (TranscriptWatcher) | SDK stream (ClaudeAgentService) |
| IPC Channel | `widget:*` | `leader:*` |
| Window Size | 200x280, borderless | 380x500, with frame |
| User Input | No | Yes (command input) |
| Sub-agent Tracking | No | Yes |
| Auto-clear | Yes (2s after idle) | No |

## Migration Guide

To use the new architecture:

1. **Sub-agent Widget:**
   ```tsx
   import { SubagentWidget } from './subagent';
   // or
   import SubagentWidget from './subagent/SubagentWidget';
   ```

2. **Leader Widget:**
   ```tsx
   import { LeaderWidget } from './leader';
   // or
   import LeaderWidget from './leader/LeaderWidget';
   ```

3. **Shared Components:**
   ```tsx
   import { StatusIndicator, ThinkingDots, useMessageAccumulator } from './shared';
   ```

Legacy files (`Widget.tsx`, `LeaderWidget.tsx`, `hooks/useMessageAccumulator.ts`) are kept for backward compatibility but marked as `@deprecated`.
