# Agent Meeting Visualizer 🤖💬

데스크톱 위젯 앱으로 Claude 에이전트들이 회의실에서 대화하는 것처럼 시각화합니다.

## Features

- **Desktop Widgets**: 프레임리스 투명 창으로 각 에이전트 표시
- **Character Avatars**: 각 에이전트 유형별 고유 캐릭터 (🦉 Planner, 🤖 Executor, 🔍 Reviewer 등)
- **Speech Bubbles**: 실시간 스트리밍되는 추론/대화 내용
- **Dynamic Spawning**: 에이전트 추가 시 새 위젯 자동 생성
- **Meeting Room Layout**: 에이전트들이 원형 배치로 표시

## Quick Start

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Package for distribution
npm run build:mac    # macOS
npm run build:win    # Windows
npm run build:linux  # Linux
```

## Usage

1. 앱을 실행하면 Control Panel이 나타납니다
2. Task Description에 에이전트들이 논의할 주제를 입력합니다
3. 참여할 에이전트들을 선택합니다 (Planner, Executor, Reviewer 등)
4. "Start Meeting" 버튼을 클릭합니다
5. 에이전트들이 위젯으로 나타나 서로 대화를 시작합니다!

## Agent Types

| Agent | Character | Role |
|-------|-----------|------|
| 🦉 Oliver | Planner | Strategic Planning |
| 🤖 Robo | Executor | Implementation |
| 🔍 Detective | Reviewer | Code Review |
| 🎨 Artie | Designer | UI/UX Design |
| 🔧 Fix-it | Debugger | Bug Fixing |
| 🏗️ Builder | Architect | System Design |

## Architecture

```
agents-bot/
├── src/
│   ├── main/           # Electron main process
│   ├── preload/        # Context bridge
│   ├── renderer/       # React UI
│   └── shared/         # Shared types
└── resources/          # Assets
```

## Tech Stack

- **Electron** - Desktop app framework
- **React** - UI components
- **TypeScript** - Type safety
- **Vite** - Fast bundler
- **Framer Motion** - Animations
- **TailwindCSS** - Styling
- **Claude Agent SDK** - AI orchestration

## Claude Agent SDK Integration

실제 Claude Agent SDK를 사용하려면 `src/main/agentOrchestrator.ts`에서 시뮬레이션 코드를 실제 SDK로 교체하세요:

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

// Replace simulatedQuery with actual SDK
for await (const message of query({
  prompt: task,
  options: {
    includePartialMessages: true,
    allowedTools: ["Read", "Write", "Edit", "Bash"]
  }
})) {
  // Handle streaming messages
}
```

## License

MIT
