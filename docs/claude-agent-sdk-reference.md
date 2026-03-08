# Claude Agent SDK TypeScript Reference

> Claude Agent SDK의 인터페이스와 스펙을 정리한 참조 문서입니다.

## Table of Contents

- [1. 메인 실행 함수](#1-메인-실행-함수)
- [2. SDKMessage 타입](#2-sdkmessage-타입)
- [3. 에이전트 추적 데이터](#3-에이전트-추적-데이터)
- [4. 훅 이벤트](#4-훅-이벤트)
- [5. Query 객체](#5-query-객체)
- [6. Options 인터페이스](#6-options-인터페이스)
- [7. 추적 가능 데이터 요약](#7-추적-가능-데이터-요약)

---

## 1. 메인 실행 함수

### 기본 API

```typescript
// 메인 진입점 - AsyncGenerator 반환
function query({
  prompt: string | AsyncIterable<SDKUserMessage>,
  options?: Options
}): Query;
```

### V2 세션 기반 API (미리보기)

```typescript
// 세션 생성
function unstable_v2_createSession(options): SDKSession;

// 세션 재개
function unstable_v2_resumeSession(sessionId, options): SDKSession;
```

---

## 2. SDKMessage 타입

에이전트에서 받을 수 있는 모든 메시지 타입입니다.

```typescript
type SDKMessage =
  | SDKAssistantMessage        // Claude 응답 턴
  | SDKUserMessage             // 사용자 입력 에코
  | SDKResultMessage           // 최종 실행 요약 (비용, 턴 수, 에러)
  | SDKSystemMessage           // 초기화/상태/컴팩션 이벤트
  | SDKPartialAssistantMessage // 스트리밍 토큰 (includePartialMessages: true)
  | SDKHookStartedMessage      // 훅 실행 시작
  | SDKHookProgressMessage     // 훅 stdout/stderr
  | SDKHookResponseMessage     // 훅 완료
  | SDKToolProgressMessage     // 도구 실행 하트비트
  | SDKTaskStartedMessage      // 백그라운드 태스크 시작
  | SDKTaskProgressMessage     // 백그라운드 태스크 진행
  | SDKTaskNotificationMessage // 태스크 완료/실패/중지
  | SDKRateLimitEvent          // 레이트 리밋
  | SDKPromptSuggestionMessage;// 다음 프롬프트 예측
```

### 메시지 타입 상세

| 타입 | 설명 | 용도 |
|------|------|------|
| `SDKAssistantMessage` | Claude의 응답 턴 | 에이전트 출력 처리 |
| `SDKUserMessage` | 사용자 입력 에코 | 입력 확인 |
| `SDKResultMessage` | 최종 실행 요약 | 비용/성능 분석 |
| `SDKSystemMessage` | 시스템 이벤트 | 초기화/상태 추적 |
| `SDKPartialAssistantMessage` | 스트리밍 토큰 | 실시간 UI 업데이트 |
| `SDKToolProgressMessage` | 도구 실행 하트비트 | 장시간 도구 모니터링 |
| `SDKTaskNotificationMessage` | 태스크 완료/실패 | 백그라운드 작업 추적 |

---

## 3. 에이전트 추적 데이터

### 3.1 세션 초기화 정보 (SDKSystemMessage - init)

```typescript
{
  type: "system",
  subtype: "init",
  session_id: string,       // 세션 ID (재개용)
  agents?: string[],        // 사용 가능한 서브에이전트
  tools: string[],          // 사용 가능한 모든 도구
  mcp_servers: {
    name: string;
    status: string
  }[],
  model: string,
  cwd: string,
  permissionMode: PermissionMode
}
```

### 3.2 실행 결과 요약 (SDKResultMessage)

```typescript
{
  type: "result",
  subtype: "success" | "error_max_turns" | "error_during_execution" | ...,
  duration_ms: number,           // 총 실행 시간
  duration_api_ms: number,       // API 호출 시간
  num_turns: number,             // 에이전틱 턴 수
  total_cost_usd: number,        // 총 비용
  usage: {
    input_tokens: number,
    output_tokens: number,
    cache_read_input_tokens: number,
    // ...
  },
  modelUsage: {
    [modelName: string]: ModelUsage
  } // 모델별 사용량
}
```

### 3.3 서브에이전트/태스크 추적

```typescript
// 모든 서브에이전트 메시지는 parent_tool_use_id를 포함
// -> 어떤 Task 호출이 이 메시지를 생성했는지 추적 가능

// 태스크 시작
{
  type: "system",
  subtype: "task_started",
  task_id: string,
  tool_use_id?: string,
  description: string
}

// 태스크 진행
{
  type: "system",
  subtype: "task_progress",
  task_id: string,
  usage: {
    total_tokens: number,
    tool_uses: number,
    duration_ms: number
  }
}

// 태스크 완료
{
  type: "system",
  subtype: "task_notification",
  task_id: string,
  status: "completed" | "failed" | "stopped"
}
```

### 3.4 도구 실행 추적

```typescript
// 도구 실행 중 하트비트
{
  type: "tool_progress",
  tool_name: string,
  tool_use_id: string,
  elapsed_time_seconds: number
}
```

---

## 4. 훅 이벤트

### 4.1 HookEvent 타입

```typescript
type HookEvent =
  | "PreToolUse"         // 도구 호출 전 (차단/수정 가능)
  | "PostToolUse"        // 도구 성공 후
  | "PostToolUseFailure" // 도구 실패 후
  | "SubagentStart"      // 서브에이전트 생성
  | "SubagentStop"       // 서브에이전트 완료
  | "SessionStart"       // 세션 초기화
  | "SessionEnd"         // 세션 종료
  | "PreCompact"         // 컨텍스트 압축 전
  | "PermissionRequest"  // 권한 요청
  | "TaskCompleted"      // 백그라운드 태스크 완료
  | "TeammateIdle";      // 팀 멤버 유휴 상태
  // ...
```

### 4.2 훅 콜백 시그니처

```typescript
type HookCallback = (
  input: HookInput,
  toolUseID: string | undefined,
  options: { signal: AbortSignal }
) => Promise<HookJSONOutput>;
```

### 4.3 훅 반환값 (에이전트 제어)

```typescript
type HookJSONOutput = {
  continue?: boolean,              // false면 실행 중지
  systemMessage?: string,          // 컨텍스트 주입
  hookSpecificOutput?: {
    permissionDecision?: "allow" | "deny" | "ask",
    updatedInput?: Record<string, unknown>,  // 도구 인자 수정
    additionalContext?: string
  }
};
```

### 4.4 훅 활용 예시

```typescript
// PreToolUse 훅 - 도구 호출 전 검증/수정
const preToolUseHook: HookCallback = async (input, toolUseID, { signal }) => {
  // 특정 도구 차단
  if (input.tool_name === 'dangerous_tool') {
    return { continue: false };
  }

  // 도구 인자 수정
  return {
    continue: true,
    hookSpecificOutput: {
      updatedInput: { ...input.tool_input, validated: true }
    }
  };
};
```

---

## 5. Query 객체

### Query 인터페이스

```typescript
interface Query extends AsyncGenerator<SDKMessage, void> {
  // 현재 턴 중지
  interrupt(): Promise<void>;

  // 백그라운드 태스크 중지
  stopTask(taskId: string): Promise<void>;

  // 권한 모드 변경
  setPermissionMode(mode: PermissionMode): Promise<void>;

  // 모델 변경
  setModel(model: string): Promise<void>;

  // 파일 되돌리기
  rewindFiles(
    userMessageId: string,
    opts?: RewindOptions
  ): Promise<RewindFilesResult>;

  // MCP 서버 상태 조회
  mcpServerStatus(): Promise<McpServerStatus[]>;

  // 세션 종료
  close(): void;
}
```

### 사용 예시

```typescript
const q = query({ prompt: "파일을 분석해주세요" });

for await (const message of q) {
  if (message.type === "assistant") {
    console.log(message.content);
  }

  // 특정 조건에서 중단
  if (shouldStop) {
    await q.interrupt();
    break;
  }
}

q.close();
```

---

## 6. Options 인터페이스

```typescript
interface Options {
  // === 실행 제한 ===
  maxTurns?: number;            // 최대 턴 수
  maxBudgetUsd?: number;        // 예산 제한 (USD)

  // === 모델 설정 ===
  model?: string;               // 모델 선택
  effort?: 'low' | 'medium' | 'high' | 'max';  // 사고 깊이

  // === 도구 권한 제어 ===
  allowedTools?: string[];      // 허용 도구 목록
  disallowedTools?: string[];   // 차단 도구 목록
  canUseTool?: CanUseTool;      // 커스텀 권한 콜백

  // === 서브에이전트 정의 ===
  agents?: Record<string, AgentDefinition>;

  // === 훅 ===
  hooks?: Partial<Record<HookEvent, HookCallbackMatcher[]>>;

  // === 출력 제어 ===
  includePartialMessages?: boolean;  // 토큰 단위 스트리밍
  outputFormat?: {
    type: 'json_schema';
    schema: JSONSchema
  };

  // === 세션 관리 ===
  resume?: string;              // 세션 재개 (session_id)
  persistSession?: boolean;     // 세션 저장 여부
}
```

### 서브에이전트 정의 예시

```typescript
const options: Options = {
  agents: {
    "code-reviewer": {
      prompt: "코드 리뷰 전문가로서 코드를 분석합니다.",
      model: "claude-sonnet-4-20250514",
      allowedTools: ["Read", "Grep", "Glob"]
    },
    "test-writer": {
      prompt: "테스트 작성 전문가입니다.",
      model: "claude-sonnet-4-20250514",
      allowedTools: ["Read", "Write", "Bash"]
    }
  }
};
```

---

## 7. 추적 가능 데이터 요약

| 항목 | 추적 가능 | 데이터 소스 |
|------|:--------:|-------------|
| **세션 정보** | ✅ | `session_id`, `model`, `tools`, `mcp_servers` |
| **턴 수** | ✅ | `num_turns` |
| **토큰 사용량** | ✅ | `input/output/cache tokens` (모델별 분리) |
| **비용** | ✅ | `total_cost_usd` |
| **실행 시간** | ✅ | `duration_ms`, `duration_api_ms` |
| **도구 호출** | ✅ | `PreToolUse`/`PostToolUse` 훅, `tool_progress` |
| **서브에이전트** | ✅ | `parent_tool_use_id`로 추적, `SubagentStart`/`Stop` |
| **백그라운드 태스크** | ✅ | `task_id`로 시작/진행/완료 추적 |
| **스트리밍 토큰** | ✅ | `includePartialMessages: true` |
| **컨텍스트 압축** | ✅ | `compact_boundary`, `PreCompact` 훅 |
| **권한 요청** | ✅ | `PermissionRequest` 훅, `canUseTool` 콜백 |
| **에러** | ✅ | `result.errors`, `result.subtype` |

---

## 부록: 타입 정의 참조

### PermissionMode

```typescript
type PermissionMode =
  | "default"      // 기본 (위험한 작업은 확인)
  | "acceptEdits"  // 파일 편집 자동 승인
  | "bypassPermissions"  // 모든 권한 우회
  | "plan";        // 계획 모드 (실행 없음)
```

### ModelUsage

```typescript
interface ModelUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}
```

### RewindFilesResult

```typescript
interface RewindFilesResult {
  rewoundFiles: string[];
  skippedFiles: string[];
}
```

---

## 참고 사항

- 이 SDK는 에이전트 실행의 거의 모든 측면을 추적할 수 있는 세밀한 인터페이스를 제공합니다.
- `includePartialMessages: true` 옵션으로 실시간 토큰 스트리밍을 활성화할 수 있습니다.
- 훅을 통해 도구 호출을 가로채고, 수정하거나, 차단할 수 있습니다.
- `parent_tool_use_id`를 통해 서브에이전트 호출 체인을 추적할 수 있습니다.

---

*마지막 업데이트: 2026-03-08*
