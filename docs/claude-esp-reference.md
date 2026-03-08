# Claude ESP - 서브에이전트 감시 및 추론 과정 확인 참고 문서

> **Source**: https://github.com/phiat/claude-esp
> **Version**: v0.3.1 (Go 1.24.4)
> **License**: MIT

## 개요

Claude ESP ("Extrasensory Perception")는 Claude Code의 내부 동작을 실시간으로 스트리밍하는 Go 기반 터미널 UI 도구입니다.
Thinking 블록, 도구 호출, 도구 결과, 서브에이전트 활동을 별도 터미널 창에서 모니터링할 수 있습니다.

핵심 원리: Claude Code가 디스크에 기록하는 **JSONL 트랜스크립트 파일을 tail**하여 메인 세션에 전혀 개입하지 않고 관찰합니다.

---

## 아키텍처 구조

```
claude-esp/
├── main.go                    # 진입점, CLI 플래그, TUI 부트스트랩
├── internal/
│   ├── parser/
│   │   └── parser.go          # JSONL 라인 파서, StreamItem 생성
│   ├── watcher/
│   │   └── watcher.go         # 파일시스템 모니터, 세션/에이전트 발견
│   └── tui/
│       ├── model.go           # Bubbletea Model - watcher와 UI 연결
│       ├── stream.go          # 스트림 뷰포트 - 아이템 렌더링
│       ├── tree.go            # 트리 뷰 - 세션/에이전트/백그라운드 태스크
│       └── styles.go          # Lipgloss 스타일링
```

---

## 1. 데이터 소스: Claude Code 트랜스크립트 저장 구조

Claude Code는 모든 대화 턴을 디스크의 JSONL 파일에 기록합니다:

```
~/.claude/projects/<encoded-project-path>/<session-id>.jsonl           # 메인 세션
~/.claude/projects/<encoded-project-path>/<session-id>/subagents/agent-<id>.jsonl  # 서브에이전트
~/.claude/projects/<encoded-project-path>/<session-id>/tool-results/<tool-id>.txt  # 백그라운드 태스크
```

### 핵심 사항
- `.jsonl` 파일의 각 줄은 하나의 API 턴을 나타내는 JSON 객체
- 서브에이전트 트랜스크립트는 부모 세션 ID 이름의 `subagents/` 하위 디렉토리에 저장
- 백그라운드 태스크 출력(장기 실행 `Bash` 명령, `Task` 도구 호출)은 `tool-results/<toolID>.txt`에 기록
- `CLAUDE_HOME` 환경 변수로 `~/.claude` 경로 오버라이드 가능

---

## 2. JSONL 메시지 포맷 (parser.go)

### 최상위 구조

```go
type RawMessage struct {
    Type      string          `json:"type"`       // "assistant" 또는 "user"
    AgentID   string          `json:"agentId,omitempty"`
    SessionID string          `json:"sessionId"`
    Timestamp string          `json:"timestamp"`  // RFC3339
    Message   json.RawMessage `json:"message"`    // 중첩 메시지 객체
}
```

### Assistant 메시지 (`type == "assistant"`)

```go
type AssistantMessage struct {
    Role    string         `json:"role"`    // "assistant"
    Content []ContentBlock `json:"content"`
}

type ContentBlock struct {
    Type     string          `json:"type"`              // "thinking", "text", "tool_use"
    Text     string          `json:"text,omitempty"`
    Thinking string          `json:"thinking,omitempty"`
    ID       string          `json:"id,omitempty"`      // tool_use ID (tool_result와 상관관계)
    Name     string          `json:"name,omitempty"`    // 도구 이름, 예: "Bash", "Read"
    Input    json.RawMessage `json:"input,omitempty"`   // 도구별 입력
}
```

**세 가지 콘텐츠 블록 타입:**
| 타입 | 설명 |
|------|------|
| `thinking` | 확장된 사고 콘텐츠 (추론 과정) |
| `text` | 최종 텍스트 응답 (TUI에서 기본적으로 숨김) |
| `tool_use` | 이름, ID, 입력 파라미터가 있는 도구 호출 |

### User 메시지 (`type == "user"`) - 도구 결과

```go
type ToolResult struct {
    Type      string          `json:"type"`         // "tool_result"
    ToolUseID string          `json:"tool_use_id"`  // tool_use ID와 상관관계
    Content   json.RawMessage `json:"content"`      // 문자열 또는 [{type,text}] 배열
    IsError   bool            `json:"is_error"`
}
```

도구 결과 콘텐츠는 두 가지 포맷:
- **빌트인 도구** (Bash, Read, Write 등): 일반 JSON 문자열
- **MCP 도구**: 콘텐츠 블록 배열: `[{"type": "text", "text": "..."}]`

---

## 3. StreamItem 생성 (parser.go)

파서는 원시 JSONL 라인을 `StreamItem` 객체로 변환합니다:

```go
type StreamItem struct {
    Type      StreamItemType  // "thinking", "tool_input", "tool_output", "text"
    SessionID string
    AgentID   string          // 비어있음 = 메인 세션, 값 있음 = 서브에이전트
    AgentName string          // "Main" 또는 "Agent-abc1234" (ID의 처음 7자)
    Timestamp time.Time
    Content   string
    ToolName  string          // tool_input/tool_output 항목용
    ToolID    string          // tool_input과 해당 tool_output 상관관계
}
```

### 도구 입력 포맷팅

| 도구 | 표시 포맷 |
|------|-----------|
| `Bash` | `<command>\n  # <description>` |
| `Read` | `<file_path>` |
| `Write` | `<file_path> (N bytes)` |
| `Edit` | `<file_path>` |
| `Glob` | `<pattern> in <path>` |
| `Grep` | `/<pattern>/ in <path>` |
| `WebFetch` | `<prompt>` |
| `WebSearch` | `<query>` |
| `Task` | `<prompt>` |
| unknown | raw JSON |

---

## 4. Watcher: 파일시스템 모니터링 (watcher.go)

`Watcher` 구조체는 핵심 모니터링 엔진입니다. 5개의 출력 채널을 소유합니다:

```go
type Watcher struct {
    Items             chan parser.StreamItem       // 파싱된 콘텐츠 스트림
    Errors            chan error
    NewAgent          chan NewAgentMsg             // 새 서브에이전트 발견
    NewSession        chan NewSessionMsg           // 새 세션 발견
    NewBackgroundTask chan NewBackgroundTaskMsg    // 새 백그라운드 태스크 발견
}
```

### 세션 모델

```go
type Session struct {
    ID              string
    ProjectPath     string
    MainFile        string
    Subagents       map[string]string          // agentID -> .jsonl 파일 경로
    BackgroundTasks map[string]*BackgroundTask // toolID -> 태스크 정보
    mu              sync.RWMutex
}

type BackgroundTask struct {
    ToolID        string  // 예: "toolu_01XYZ"
    ParentAgentID string  // 어떤 에이전트가 생성했는지 (비어있음 = 메인)
    ToolName      string  // 예: "Bash: npm install"
    OutputPath    string  // tool-results/<id>.txt 경로
    IsComplete    bool
}
```

### 두 가지 감시 모드

#### fsnotify 모드 (기본값)
```go
func (w *Watcher) watchLoopFsnotify() {
    // OS 네이티브 알림 사용 (Linux: inotify, macOS: kqueue/FSEvents)
    // Claude Code가 파일에 추가할 때 즉시 이벤트 도착
    // 빠른 추가를 합치기 위해 50ms에서 디바운스
}
```

#### 폴링 모드 (폴백)
```go
func (w *Watcher) watchLoopPolling() {
    // 500ms마다 틱 (설정 가능)
    // inotify/kqueue를 지원하지 않는 파일시스템에서 사용
}
```

### 쓰기 디바운싱 (fsnotify 전용)

```go
const DebounceInterval = 50 * time.Millisecond

func (w *Watcher) handleFsWrite(path string) {
    // 파일이 속한 세션/에이전트 조회
    ctx, ok := w.fileContexts[path]
    // 파일별 타이머 재설정 또는 생성; 50ms 정지 후에만 읽기
    if timer, exists := w.debounceTimers[path]; exists {
        timer.Reset(DebounceInterval)
        return
    }
    w.debounceTimers[path] = time.AfterFunc(DebounceInterval, func() {
        w.readFile(path, ctx.sessionID, ctx.agentID)
    })
}
```

### 파일 위치 추적 (tail -f 패턴)

```go
func (w *Watcher) readFile(path, sessionID, agentID string) {
    file, _ := os.Open(path)
    defer file.Close()

    // 마지막 알려진 위치로 시크
    pos, exists := w.filePositions[path]
    if exists {
        file.Seek(pos, 0)
    }

    scanner := bufio.NewScanner(file)
    scanner.Buffer(buf, 1MB)  // 큰 JSON 라인 처리

    for scanner.Scan() {
        items, _ := parser.ParseLine(scanner.Text())
        for _, item := range items {
            item.SessionID = sessionID
            if agentID != "" && item.AgentID == "" {
                item.AgentID = agentID
                item.AgentName = fmt.Sprintf("Agent-%s", agentID[:7])
            }
            w.Items <- item
        }
    }

    // 새 위치 저장
    newPos, _ := file.Seek(0, 1)
    w.filePositions[path] = newPos
}
```

### 서브에이전트 발견

두 가지 방식으로 서브에이전트 발견:

1. **세션 빌드 시점**: `buildSession()`이 `<session-id>/subagents/` 디렉토리 읽기
2. **런타임**:
   - 폴링 모드: `checkForNewSubagents()`가 매 틱마다 subagents 디렉토리 폴링
   - fsnotify 모드: `handleNewSubagentFile()`이 CREATE 이벤트에 발화

### 백그라운드 태스크 발견

```go
// tool-results/ 디렉토리에서 .txt 파일 스캔
// 각 .txt 파일명이 tool ID (예: toolu_01XYZ.txt)

// 어떤 에이전트가 도구를 생성했는지 찾기
func (w *Watcher) findBackgroundTaskParent(toolID string) {
    // 모든 JSONL 파일에서 tool ID와 "type":"tool_use"를
    // 모두 포함하는 라인을 문자열 스캔
}

// 완료 여부 판단
func (w *Watcher) isBackgroundTaskComplete(toolID string) bool {
    // 세션의 모든 JSONL 파일에서 tool ID와 "tool_result"를
    // 모두 포함하는 라인 스캔
}
```

---

## 5. TUI 이벤트 루프 (model.go)

Bubbletea 프레임워크의 Model-Update-View 패턴 사용:

```go
type Model struct {
    tree         *TreeView
    stream       *StreamView
    watcher      *watcher.Watcher
    focus        Focus      // FocusTree 또는 FocusStream
    showTree     bool
    width, height int
}
```

### 채널 폴링 (논블로킹)

```go
func (m *Model) pollWatcher() tea.Cmd {
    return func() tea.Msg {
        select {
        case item := <-m.watcher.Items:
            return streamItemMsg(item)
        case agent := <-m.watcher.NewAgent:
            return newAgentMsg(agent)
        case session := <-m.watcher.NewSession:
            return newSessionMsg(session)
        case task := <-m.watcher.NewBackgroundTask:
            return newBackgroundTaskMsg(task)
        default:
            return nil
        }
    }
}
```

---

## 6. StreamView: 아이템 렌더링 (stream.go)

```go
type StreamView struct {
    viewport       viewport.Model
    items          []parser.StreamItem
    seenToolIDs    map[string]bool     // ToolID로 중복 제거
    showThinking   bool                // 기본: true
    showToolInput  bool                // 기본: true
    showToolOutput bool                // 기본: true
    showText       bool                // 기본: false
    autoScroll     bool                // 기본: true
    maxLines       int                 // 아이템당 최대 50줄
}
```

### 핵심 동작
- **중복 제거**: 비어있지 않은 `ToolID`를 가진 아이템은 중복 제거
- **메모리 제한**: 최대 1000개 아이템 유지 (`MaxStreamItems`)
- **아이템별 자르기**: 각 아이템은 50줄로 제한
- **필터 적용**: 타입 필터 + 세션/에이전트 활성화/비활성화
- **자동 스크롤**: 활성화 시 매 업데이트 후 `viewport.GotoBottom()` 호출

### 렌더링 포맷

```
<AgentName> » 🧠 Thinking          (보라색)
<들여쓰기된 사고 내용>
──────────────────────────────────────────────────────────────

<AgentName> » 🔧 Bash              (노란색)
<명령어>
──────────────────────────────────────────────────────────────

<AgentName> » 📤 Output            (초록색)
<도구 결과>
──────────────────────────────────────────────────────────────
```

---

## 7. TreeView: 세션/에이전트 계층 구조 (tree.go)

### 노드 타입

```go
const (
    NodeTypeRoot           // 숨겨진 루트
    NodeTypeSession        // Claude 세션 (최상위)
    NodeTypeMain           // 세션 내 메인 대화
    NodeTypeAgent          // 세션 내 서브에이전트
    NodeTypeBackgroundTask // 백그라운드 도구 실행
)
```

### 구조 예시
```
Session (프로젝트 이름)
  └─ Main
       └─ ⏳ Bash: npm install    (백그라운드 태스크)
  └─ Agent-abc1234
       └─ ✓  Task: write tests   (완료된 백그라운드 태스크)
```

---

## 8. 핵심 상수 참조

| 상수 | 값 | 목적 |
|------|-----|------|
| `DefaultPollInterval` | 500ms | 폴백 폴링 주기 |
| `DebounceInterval` | 50ms | fsnotify 쓰기 합치기 |
| `AutoSkipLineThreshold` | 100줄 | 히스토리 자동 스킵 트리거 |
| `KeepRecentLines` | 10 | 자동 스킵 시 유지 줄 수 |
| `DefaultActiveWindow` | 5분 | 세션 발견용 최근성 |
| `RecentActivityThreshold` | 2분 | 세션 목록의 "활성" 마커 |
| `ItemChannelBuffer` | 100 | Items 채널 버퍼 크기 |
| `MaxStreamItems` | 1000 | 스트림 뷰 최대 아이템 |
| `MaxLinesPerItem` | 50 | 아이템당 줄 자르기 |
| `ScannerMaxBufferSize` | 1MB | 최대 JSONL 라인 크기 |
| `CleanupInterval` | 5분 | 오래된 파일 위치 정리 |

---

## 9. 동시성 모델

세 개의 고루틴 + Bubbletea 이벤트 루프 고루틴:

1. **watchLoopFsnotify / watchLoopPolling** - 파일 읽기 및 채널 전송
2. **디바운스 타이머** - 활발히 쓰이는 파일당 하나의 `time.AfterFunc` 고루틴
3. **Bubbletea 런타임** - `Update`/`View` 사이클 및 `pollWatcher` 명령 구동

### 공유 상태 보호

| 뮤텍스 | 보호 대상 |
|--------|-----------|
| `sessionsMu sync.RWMutex` | `sessions` 맵 |
| `filePosMu sync.RWMutex` | `filePositions` |
| `fileCtxMu sync.RWMutex` | `fileContexts` (경로->세션 매핑) |
| `debounceMu sync.Mutex` | `debounceTimers` |
| `session.mu sync.RWMutex` | `Subagents` 및 `BackgroundTasks` 맵 |
| `atomic.Bool` | `watchActive`, `skipHistory` |

---

## 10. 서브에이전트 모니터링 핵심 패턴

### 패턴 1: 바이트 오프셋 추적을 통한 JSONL tail

```go
// 마지막 위치 추적으로 새 콘텐츠만 읽기
pos := filePositions[path]
file.Seek(pos, 0)  // 마지막 위치로 이동
// ... 새 라인 읽기 ...
newPos, _ := file.Seek(0, 1)  // 현재 위치
filePositions[path] = newPos
```

### 패턴 2: fsnotify + 폴링 폴백

```go
// 시작 시 fsnotify.NewWatcher() 시도
// 실패하면 ticker로 폴백
// fsnotify: 밀리초 이하 지연
// 폴링: 호환성 보장
```

### 패턴 3: 파일별 타이머로 쓰기 디바운싱

```go
// Claude Code는 빠른 버스트로 여러 바이트 추가 가능
// 파일당 time.AfterFunc(50ms, readFunc) 사용
// 새 쓰기 이벤트마다 타이머 재설정
// 버스트 쓰기를 단일 읽기로 합치기
```

### 패턴 4: JSON 콘텐츠가 아닌 파일 경로에서 AgentID

```go
// 서브에이전트 JSONL 파일은 JSON에 agentId를 포함할 수도 있고 아닐 수도 있음
// watcher는 파일 경로에서 에이전트 ID 해결
// /subagents/agent-<id>.jsonl
// 필요시 JSON 필드 오버라이드
```

### 패턴 5: ToolID를 통한 도구 입력/출력 상관관계

```go
// tool_use의 ContentBlock.ID == 다음 user 메시지의 ToolResult.ToolUseID
// 요청(도구 입력)과 응답(도구 출력) 상관관계의 키
// 스트림 뷰는 이 ID로 중복 제거
```

### 패턴 6: tool-results/ 디렉토리를 통한 백그라운드 태스크 감지

```go
// Claude Code는 백그라운드 태스크 출력을
// <session-id>/tool-results/<toolID>.txt에 기록
// 완료는 해당 tool ID를 포함하는 tool_result를 JSONL에서 스캔하여 판단
// inotify CREATE 이벤트 패턴 - 새 .txt 파일 감시 후 JSONL 스캔
```

### 패턴 7: 핫 패스용 경량 JSON 필드 추출

```go
// extractToolNameFromLine()에서 watcher는
// 특정 tool ID를 많은 라인에서 스캔할 때
// 전체 json.Unmarshal 대신 .Contains()와 .Index() 사용
// 매치가 발견될 때만 전체 파싱 수행
```

### 패턴 8: 파일시스템 계층을 미러링하는 계층적 에이전트 트리

```
# 파일시스템 레이아웃이 에이전트 계층을 직접 미러링
<session>.jsonl                    → 메인 에이전트
<session>/subagents/agent-X.jsonl  → 서브에이전트 X

# 트리 뷰는 동일한 부모-자식 관계로 이 구조 미러링
```

---

## TypeScript/Node.js 구현 예시

agents-bot 프로젝트에서 사용할 수 있는 TypeScript 구현 예시:

```typescript
import { watch, FSWatcher } from 'chokidar';
import { createReadStream, statSync } from 'fs';
import { createInterface } from 'readline';
import { EventEmitter } from 'events';

interface StreamItem {
  type: 'thinking' | 'tool_input' | 'tool_output' | 'text';
  sessionId: string;
  agentId?: string;
  agentName: string;
  timestamp: Date;
  content: string;
  toolName?: string;
  toolId?: string;
}

interface RawMessage {
  type: 'assistant' | 'user';
  agentId?: string;
  sessionId: string;
  timestamp: string;
  message: AssistantMessage | ToolResultMessage;
}

interface AssistantMessage {
  role: 'assistant';
  content: ContentBlock[];
}

interface ContentBlock {
  type: 'thinking' | 'text' | 'tool_use';
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface ToolResultMessage {
  type: 'tool_result';
  tool_use_id: string;
  content: string | Array<{ type: string; text: string }>;
  is_error: boolean;
}

export class TranscriptWatcher extends EventEmitter {
  private filePositions: Map<string, number> = new Map();
  private watcher: FSWatcher | null = null;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly DEBOUNCE_MS = 50;

  constructor(private sessionPath: string) {
    super();
  }

  start(): void {
    // chokidar로 파일 감시 (fsnotify 역할)
    this.watcher = watch(this.sessionPath, {
      persistent: true,
      ignoreInitial: false,
      awaitWriteFinish: false,
    });

    this.watcher.on('add', (path) => this.handleNewFile(path));
    this.watcher.on('change', (path) => this.handleFileChange(path));
  }

  stop(): void {
    this.watcher?.close();
    this.debounceTimers.forEach((timer) => clearTimeout(timer));
  }

  private handleNewFile(path: string): void {
    if (path.endsWith('.jsonl')) {
      this.readFile(path);
    }
  }

  private handleFileChange(path: string): void {
    if (!path.endsWith('.jsonl')) return;

    // 디바운싱 - 50ms 내 연속 쓰기 합치기
    const existingTimer = this.debounceTimers.get(path);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.readFile(path);
      this.debounceTimers.delete(path);
    }, this.DEBOUNCE_MS);

    this.debounceTimers.set(path, timer);
  }

  private async readFile(path: string): Promise<void> {
    const startPos = this.filePositions.get(path) || 0;
    const stat = statSync(path);

    if (stat.size <= startPos) return;

    const stream = createReadStream(path, {
      start: startPos,
      encoding: 'utf8',
    });

    const rl = createInterface({ input: stream });

    for await (const line of rl) {
      if (line.trim()) {
        const items = this.parseLine(line);
        items.forEach((item) => this.emit('item', item));
      }
    }

    this.filePositions.set(path, stat.size);
  }

  private parseLine(line: string): StreamItem[] {
    try {
      const raw: RawMessage = JSON.parse(line);
      return this.convertToStreamItems(raw);
    } catch {
      return [];
    }
  }

  private convertToStreamItems(raw: RawMessage): StreamItem[] {
    const items: StreamItem[] = [];
    const baseItem = {
      sessionId: raw.sessionId,
      agentId: raw.agentId,
      agentName: raw.agentId ? `Agent-${raw.agentId.slice(0, 7)}` : 'Main',
      timestamp: new Date(raw.timestamp),
    };

    if (raw.type === 'assistant') {
      const msg = raw.message as AssistantMessage;
      for (const block of msg.content) {
        if (block.type === 'thinking') {
          items.push({
            ...baseItem,
            type: 'thinking',
            content: block.thinking || '',
          });
        } else if (block.type === 'tool_use') {
          items.push({
            ...baseItem,
            type: 'tool_input',
            content: this.formatToolInput(block),
            toolName: block.name,
            toolId: block.id,
          });
        } else if (block.type === 'text') {
          items.push({
            ...baseItem,
            type: 'text',
            content: block.text || '',
          });
        }
      }
    } else if (raw.type === 'user') {
      const msg = raw.message as ToolResultMessage;
      if (msg.type === 'tool_result') {
        items.push({
          ...baseItem,
          type: 'tool_output',
          content: this.extractToolResultContent(msg.content),
          toolId: msg.tool_use_id,
        });
      }
    }

    return items;
  }

  private formatToolInput(block: ContentBlock): string {
    const input = block.input || {};
    switch (block.name) {
      case 'Bash':
        return `${input.command}\n  # ${input.description || ''}`;
      case 'Read':
        return String(input.file_path || '');
      case 'Write':
        const content = String(input.content || '');
        return `${input.file_path} (${content.length} bytes)`;
      case 'Task':
        return String(input.prompt || '');
      default:
        return JSON.stringify(input);
    }
  }

  private extractToolResultContent(
    content: string | Array<{ type: string; text: string }>
  ): string {
    if (typeof content === 'string') {
      return content;
    }
    return content.map((c) => c.text).join('\n');
  }
}

// 사용 예시
const watcher = new TranscriptWatcher(
  '~/.claude/projects/-Users-me-myproject/session-123.jsonl'
);

watcher.on('item', (item: StreamItem) => {
  if (item.type === 'thinking') {
    console.log(`🧠 ${item.agentName}: ${item.content}`);
  } else if (item.type === 'tool_input') {
    console.log(`🔧 ${item.agentName} » ${item.toolName}: ${item.content}`);
  } else if (item.type === 'tool_output') {
    console.log(`📤 ${item.agentName}: ${item.content.slice(0, 100)}...`);
  }
});

watcher.start();
```

---

## 참고 자료

- [claude-esp Repository](https://github.com/phiat/claude-esp)
- [Bubbletea Framework](https://github.com/charmbracelet/bubbletea) - 터미널 이벤트 루프
- [Lipgloss](https://github.com/charmbracelet/lipgloss) - 터미널 스타일링
- [fsnotify](https://github.com/fsnotify/fsnotify) - 크로스 플랫폼 파일시스템 알림
- [Chokidar](https://github.com/paulmillr/chokidar) - Node.js용 파일 감시 (fsnotify 대안)
