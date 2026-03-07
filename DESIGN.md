# Claude Agent Desktop - Design Document

## Overview

Claude Agent SDK를 사용하여 명령을 보내고 응답을 받는 간단한 Electron 데스크톱 앱입니다.

## Core Features

1. **Single Window UI**: 프롬프트 입력과 응답 표시를 위한 단일 창
2. **Claude Agent SDK Integration**: `@anthropic-ai/claude-agent-sdk`를 통한 직접 통신
3. **Streaming Responses**: 실시간 스트리밍 응답 표시
4. **Tool Use Indicators**: 도구 사용 시 시각적 피드백
5. **Directory Selection**: 작업 디렉토리 선택 기능

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Main Process                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              ClaudeAgentService                      │    │
│  │  - query() via @anthropic-ai/claude-agent-sdk       │    │
│  │  - Stream SDK messages                               │    │
│  │  - Emit events to renderer                           │    │
│  └─────────────────────────────────────────────────────┘    │
│                          │                                   │
│                   IPC Bridge                                 │
│                          ▼                                   │
├─────────────────────────────────────────────────────────────┤
│                   Renderer Process                           │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                    App.tsx                           │    │
│  │  - Prompt input                                      │    │
│  │  - Messages display                                  │    │
│  │  - Status indicators                                 │    │
│  │  - Tool use feedback                                 │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Tech Stack

- **Electron**: v28+ (Desktop application framework)
- **React**: UI components with TypeScript
- **Claude Agent SDK**: `@anthropic-ai/claude-agent-sdk`
- **electron-vite**: Fast bundling for Electron
- **Framer Motion**: Smooth animations
- **TailwindCSS**: Styling

## Project Structure

```
agents-bot/
├── package.json
├── electron.vite.config.ts
├── tsconfig.json
├── tailwind.config.js
├── postcss.config.js
├── src/
│   ├── main/                      # Electron main process
│   │   ├── index.ts               # App entry, IPC handlers
│   │   └── claudeAgentService.ts  # Claude SDK integration
│   ├── preload/
│   │   └── index.ts               # Context bridge (claudeAPI)
│   ├── renderer/                  # React app
│   │   ├── index.html
│   │   └── src/
│   │       ├── App.tsx            # Main UI component
│   │       ├── main.tsx           # React entry
│   │       └── index.css          # Tailwind styles
│   └── shared/
│       └── types.ts               # Shared types
└── DESIGN.md
```

## Message Flow

1. User enters prompt in text area
2. Renderer sends `control:send-prompt` via IPC
3. Main process calls Claude Agent SDK `query()`
4. SDK streams messages back (text, thinking, tool_use, result)
5. Main process forwards events to renderer via IPC
6. Renderer updates UI in real-time

## IPC Channels

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `agent:message` | Main → Renderer | Stream message chunk |
| `agent:status` | Main → Renderer | Status update (thinking, responding, etc.) |
| `agent:tool-use` | Main → Renderer | Tool being used |
| `agent:error` | Main → Renderer | Error occurred |
| `agent:result` | Main → Renderer | Query completed |
| `control:send-prompt` | Renderer → Main | Send prompt to Claude |
| `control:stop` | Renderer → Main | Stop current query |
| `dialog:select-directory` | Renderer → Main | Select working directory |

## SDK Integration

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

const queryIterator = query({
  prompt: userPrompt,
  options: {
    cwd: workingDirectory,
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    includePartialMessages: true,
  }
});

for await (const message of queryIterator) {
  // Process: assistant, stream_event, result, etc.
}
```

## Status Types

| Status | Description |
|--------|-------------|
| `idle` | Ready for input |
| `thinking` | Processing/thinking |
| `responding` | Streaming text response |
| `using_tool` | Executing a tool |
| `complete` | Query finished |
| `error` | Error occurred |
