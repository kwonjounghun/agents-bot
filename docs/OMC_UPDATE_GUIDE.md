# OMC 업데이트 가이드

> oh-my-claudecode (OMC) 플러그인 업데이트 시 agents-bot 프로젝트의 수정 범위를 파악하기 위한 참조 문서

## 개요

이 문서는 OMC 플러그인이 업데이트될 때 agents-bot 프로젝트에서 어떤 파일들을 확인하고 수정해야 하는지 매핑합니다.

```
OMC 플러그인                           agents-bot 프로젝트
~/.claude/plugins/cache/omc/          /src/sdk-omc/
oh-my-claudecode/{version}/
```

---

## 레이어별 파일 매핑

### 1. 에이전트 정의

| OMC 소스 | agents-bot 대응 파일 | 변경 유형 |
|----------|---------------------|----------|
| `src/agents/definitions.ts` | `src/sdk-omc/agents.ts` | 에이전트 추가/제거/통합 |
| `agents/*.md` | `src/sdk-omc/agents.ts` (프롬프트 필드) | 에이전트 프롬프트 변경 |
| `docs/CLAUDE.md` (agent_catalog) | `src/sdk-omc/agents.ts` | 에이전트 모델 할당 |

**확인해야 할 변경사항:**
- [ ] 새 에이전트 추가됨
- [ ] 기존 에이전트 제거됨
- [ ] 에이전트 통합/분리됨
- [ ] 별칭(alias) 추가됨
- [ ] 기본 모델 변경됨 (haiku/sonnet/opus)
- [ ] 에이전트 프롬프트 수정됨

**수정 예시:**
```typescript
// src/sdk-omc/agents.ts

// 새 에이전트 추가
export const omcAgents: Record<string, AgentDefinition> = {
  'new-agent': {
    name: 'new-agent',
    model: 'sonnet',
    prompt: '...',
    description: '...'
  },
  // ...기존 에이전트
};

// 별칭 추가 (deprecated 에이전트 라우팅)
export const AGENT_ALIASES: Record<string, string> = {
  'old-name': 'new-name',
};
```

---

### 2. 훅 시스템

| OMC 소스 | agents-bot 대응 파일 | 변경 유형 |
|----------|---------------------|----------|
| `hooks/hooks.json` | `src/sdk-omc/hooks.ts` | 훅 이벤트 타입 |
| `scripts/keyword-detector.mjs` | `src/sdk-omc/hooks.ts` → `detectKeywordsWithType()` | 키워드 패턴 |
| `src/hooks/keyword-detector/index.ts` | `src/sdk-omc/hooks.ts` | 감지 로직 |
| `scripts/persistent-mode.cjs` | `src/sdk-omc/hooks.ts` → `modeProtectionHook()` | 지속 모드 로직 |
| `src/hooks/bridge.ts` | `src/sdk-omc/hooks.ts` | 훅 라우팅 |

**확인해야 할 변경사항:**
- [ ] 새 훅 이벤트 타입 추가됨
- [ ] 키워드 패턴 변경됨 (정규식)
- [ ] 키워드 우선순위/충돌 규칙 변경됨
- [ ] 필드 정규화 방식 변경됨 (camelCase ↔ snake_case)
- [ ] 상태 파일 체크 로직 변경됨

**수정 예시:**
```typescript
// src/sdk-omc/hooks.ts

// 새 키워드 추가
const KEYWORD_PATTERNS = {
  // 기존
  ralph: /\b(ralph|don't stop|must complete)\b/i,
  // 신규 추가
  newmode: /\b(newmode|new-mode)\b/i,
};

// 우선순위 변경
const KEYWORD_PRIORITY = [
  'cancel',    // 최우선
  'ralph',
  'newmode',   // 신규 추가
  'autopilot',
  // ...
];
```

---

### 3. 상태 관리

| OMC 소스 | agents-bot 대응 파일 | 변경 유형 |
|----------|---------------------|----------|
| `src/hooks/ralph/index.ts` | `src/sdk-omc/state.ts` | Ralph 상태 구조 |
| `src/hooks/autopilot/index.ts` | `src/sdk-omc/state.ts` | Autopilot 상태 구조 |
| `src/hooks/team-pipeline/index.ts` | `src/sdk-omc/state.ts` | Team 상태 구조 |
| `src/lib/worktree-paths.ts` | `src/sdk-omc/state.ts` | 상태 파일 경로 |
| MCP `state_read/write/clear` | `src/sdk-omc/state.ts` | 상태 CRUD 인터페이스 |

**확인해야 할 변경사항:**
- [ ] 상태 파일 경로 변경됨 (`.omc/state/` 구조)
- [ ] 세션 격리 방식 변경됨
- [ ] 상태 필드 추가/제거됨
- [ ] 새 모드 추가됨

**수정 예시:**
```typescript
// src/sdk-omc/state.ts

// 상태 파일 경로 변경 대응
export function resolveStatePath(
  workingDirectory: string,
  mode: SkillMode,
  sessionId?: string
): string {
  // v4.1.1+: 세션 격리
  if (sessionId) {
    return path.join(workingDirectory, '.omc/state/sessions', sessionId, `${mode}-state.json`);
  }
  // 레거시 폴백
  return path.join(workingDirectory, '.omc/state', `${mode}-state.json`);
}

// 새 상태 필드 추가
export interface TeamState extends ModeState {
  team_name: string;
  current_phase: string;
  fix_loop_count: number;      // 기존
  stage_history: string;       // v4.5.0 추가
  handoff_path?: string;       // v4.5.0 추가
}
```

---

### 4. 모델 라우팅

| OMC 소스 | agents-bot 대응 파일 | 변경 유형 |
|----------|---------------------|----------|
| `docs/CLAUDE.md` (model_routing) | `src/sdk-omc/routing.ts` | 라우팅 규칙 |
| `src/agents/definitions.ts` | `src/sdk-omc/routing.ts` | 에이전트별 기본 모델 |

**확인해야 할 변경사항:**
- [ ] 모델 ID 변경됨 (예: `opus` → `claude-opus-4-6`)
- [ ] 에이전트별 기본 모델 변경됨
- [ ] 복잡도 기반 라우팅 규칙 변경됨

**수정 예시:**
```typescript
// src/sdk-omc/routing.ts

// 모델 ID 업데이트
export const MODEL_IDS = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-5-20250929',
  opus: 'claude-opus-4-6-20260101',  // 버전 업데이트
};

// 에이전트별 모델 매핑
export const AGENT_MODEL_MAP: Record<string, ModelTier> = {
  'explore': 'haiku',
  'executor': 'sonnet',
  'architect': 'opus',
  'new-agent': 'sonnet',  // 신규 추가
};
```

---

### 5. 스킬 정의

| OMC 소스 | agents-bot 대응 파일 | 변경 유형 |
|----------|---------------------|----------|
| `skills/*/index.md` | `src/sdk-omc/skills.ts` | 스킬 메타데이터 |
| `src/skills/builtin-skills.ts` | `src/sdk-omc/skills.ts` | 스킬 목록 |
| `docs/CLAUDE.md` (skills) | `src/sdk-omc/skills.ts` | 트리거 패턴 |

**확인해야 할 변경사항:**
- [ ] 새 스킬 추가됨
- [ ] 스킬 제거/통합됨
- [ ] 스킬 별칭 추가됨
- [ ] 트리거 패턴 변경됨

**수정 예시:**
```typescript
// src/sdk-omc/skills.ts

export const omcSkillTools: ToolDefinition[] = [
  // 신규 스킬 추가
  {
    name: 'newskill',
    description: '...',
    triggers: ['newskill', 'new-skill'],
  },
  // ...기존 스킬
];

// 스킬 별칭
export const SKILL_ALIASES: Record<string, string> = {
  'swarm': 'team',      // 레거시 호환
  'psm': 'project-session-manager',
};
```

---

### 6. 도구 (Tools)

| OMC 소스 | agents-bot 대응 파일 | 변경 유형 |
|----------|---------------------|----------|
| `src/mcp/lsp-server.ts` | `src/sdk-omc/tools/lsp-tools.ts` | LSP 도구 |
| `src/mcp/ast-server.ts` | `src/sdk-omc/tools/ast-tools.ts` | AST 도구 |
| `src/mcp/team-server.ts` | `src/sdk-omc/tools/team-tools.ts` | 팀 도구 |
| `src/mcp/notepad-server.ts` | `src/sdk-omc/tools/notepad-tools.ts` | 노트패드 도구 |
| `src/mcp/memory-server.ts` | `src/sdk-omc/tools/memory-tools.ts` | 메모리 도구 |
| `src/tools/team-orchestrator.ts` | `src/sdk-omc/tools/team-orchestrator.ts` | 팀 오케스트레이션 |

**확인해야 할 변경사항:**
- [ ] MCP 도구 추가/제거됨
- [ ] 도구 파라미터 변경됨
- [ ] 도구 응답 형식 변경됨
- [ ] 팀 파이프라인 스테이지 변경됨

**수정 예시:**
```typescript
// src/sdk-omc/tools/team-tools.ts

// 새 도구 추가
export const teamTools = {
  // 기존
  omc_run_team_start: { ... },
  omc_run_team_wait: { ... },

  // v4.5.0 추가
  omc_run_team_nudge: {
    description: 'Nudge idle worker panes',
    parameters: {
      job_id: { type: 'string' },
      nudge_message: { type: 'string' },
    },
  },
};
```

---

### 7. 타입 정의

| OMC 소스 | agents-bot 대응 파일 | 변경 유형 |
|----------|---------------------|----------|
| `src/types/*.ts` | `src/sdk-omc/types.ts` | 공통 타입 |
| `src/hooks/*/types.ts` | `src/sdk-omc/types.ts` | 훅 관련 타입 |

**확인해야 할 변경사항:**
- [ ] 새 타입 추가됨
- [ ] 기존 타입 필드 변경됨
- [ ] enum 값 추가/제거됨

---

## 업데이트 체크리스트

### OMC 버전 업데이트 시

```bash
# 1. OMC CHANGELOG 확인
cat ~/.claude/plugins/cache/omc/oh-my-claudecode/*/CHANGELOG.md | head -200

# 2. 버전 비교
diff ~/.claude/plugins/cache/omc/oh-my-claudecode/{old_version}/src/agents/definitions.ts \
     ~/.claude/plugins/cache/omc/oh-my-claudecode/{new_version}/src/agents/definitions.ts
```

### 레이어별 체크 순서

1. **CHANGELOG.md 확인** → 어떤 영역이 변경되었는지 파악
2. **Breaking Changes 확인** → 호환성 문제 있는지 확인
3. **해당 레이어 파일 수정** → 위 매핑 참조
4. **TypeScript 컴파일** → 타입 오류 확인
5. **테스트 실행** → 기능 검증

```bash
# 빌드 및 테스트
npm run build
npm run test
```

---

## 버전 호환성 매트릭스

| agents-bot 버전 | OMC 최소 버전 | OMC 최대 버전 | 비고 |
|----------------|--------------|--------------|------|
| 1.0.0 | 4.5.0 | 4.5.x | 초기 버전 |

---

## 주요 Breaking Changes 히스토리

### OMC v4.4.0
- **Codex/Gemini MCP 서버 제거**
  - `mcp__x__ask_codex`, `mcp__g__ask_gemini` 사용 불가
  - tmux CLI 워커로 대체 (`omc_run_team_*`)

### OMC v4.3.1
- **에이전트 통합 (30 → 21)**
  - `style-reviewer` → `quality-reviewer`
  - `api-reviewer` → `code-reviewer`
  - `performance-reviewer` → `quality-reviewer`

### OMC v4.1.0
- **티어 에이전트 제거**
  - `-low`, `-medium`, `-high` 접미사 제거
  - 모델은 파라미터로 지정

---

## 파일 변경 시 영향 범위

```
src/sdk-omc/
├── agents.ts          → ClaudeAgentService.getSdkOmcAgents()
├── hooks.ts           → ClaudeAgentService.initSdkOmc(), createOmcHooks()
├── state.ts           → 상태 읽기/쓰기 전체
├── routing.ts         → getModelForAgent(), routeModel()
├── skills.ts          → getSkillTool(), listSkillToolNames()
├── types.ts           → 전체 타입 의존성
└── tools/
    ├── lsp-tools.ts   → LSP 관련 기능
    ├── ast-tools.ts   → AST 검색/치환
    ├── team-tools.ts  → 팀 오케스트레이션
    ├── notepad-tools.ts → 노트패드 CRUD
    └── memory-tools.ts  → 프로젝트 메모리
```

---

## 참고 링크

- OMC GitHub: https://github.com/anthropics/claude-code-plugins
- OMC CHANGELOG: `~/.claude/plugins/cache/omc/oh-my-claudecode/{version}/CHANGELOG.md`
- OMC 문서: `~/.claude/plugins/cache/omc/oh-my-claudecode/{version}/docs/`
