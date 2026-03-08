/**
 * Agent ID Matcher Utility
 *
 * IMPORTANT: ID 형식 차이로 인한 버그 방지를 위한 중앙 집중화된 매칭 로직
 *
 * ============================================================================
 * ID 형식 정리 (절대 변경하지 마세요!)
 * ============================================================================
 *
 * 1. SDK agentId (Claude Agent SDK에서 제공):
 *    - 형식: 전체 UUID 또는 긴 해시
 *    - 예시: "toolu_01ABCdef123456" 또는 "ab215e8f-1234-5678-..."
 *    - 출처: agentStart 이벤트의 event.agentId
 *
 * 2. Transcript agentId (JSONL의 agentId 필드):
 *    - 형식: 7자리 짧은 해시
 *    - 예시: "ab215e8"
 *    - 출처: JSONL 파일 내 {"agentId": "ab215e8", ...}
 *
 * 3. File path agentId (파일 경로에서 추출):
 *    - 형식: agent-a<hash>.jsonl에서 <hash> 부분
 *    - 예시: "1b2c3d4e5f6" (agent-a1b2c3d4e5f6.jsonl에서)
 *    - 출처: ~/.claude/projects/.../subagents/agent-a<hash>.jsonl
 *
 * ============================================================================
 * 매칭 규칙
 * ============================================================================
 *
 * Claude ESP 참고 (docs/claude-esp-reference.md):
 * - 파일 경로의 agentId가 가장 신뢰할 수 있음
 * - JSONL의 agentId가 비어있으면 파일 경로에서 추출
 * - SDK agentId와 transcript agentId는 부분 매칭 필요
 *
 * 매칭 우선순위:
 * 1. 정확한 일치 (exact match)
 * 2. SDK ID가 transcript ID를 포함 (sdkId.includes(transcriptId))
 * 3. 첫 7자리 prefix 일치 (sdkId.startsWith(transcriptId.substring(0,7)))
 */

/**
 * ID 형식 타입 (명확한 구분을 위해)
 */
export type SdkAgentId = string;
export type TranscriptAgentId = string;
export type FilePathAgentId = string;

/**
 * 두 agentId가 같은 에이전트를 가리키는지 확인
 *
 * @param sdkId - SDK에서 받은 agentId (전체 형식)
 * @param transcriptId - JSONL 또는 파일 경로에서 추출한 agentId (짧은 형식)
 * @returns 매칭 여부
 */
export function matchAgentIds(sdkId: SdkAgentId, transcriptId: TranscriptAgentId): boolean {
  if (!sdkId || !transcriptId) {
    return false;
  }

  // 1. 정확한 일치
  if (sdkId === transcriptId) {
    return true;
  }

  // 2. SDK ID가 transcript ID를 포함
  if (sdkId.includes(transcriptId)) {
    return true;
  }

  // 3. Transcript ID가 SDK ID를 포함 (역방향)
  if (transcriptId.includes(sdkId.substring(0, 7))) {
    return true;
  }

  // 4. 첫 7자리 prefix 일치
  const sdkPrefix = sdkId.substring(0, 7).toLowerCase();
  const transcriptPrefix = transcriptId.substring(0, 7).toLowerCase();
  if (sdkPrefix === transcriptPrefix) {
    return true;
  }

  return false;
}

/**
 * activeAgents Set에서 매칭되는 agentId 찾기
 *
 * @param activeAgents - SDK agentId들의 Set
 * @param transcriptId - JSONL/파일 경로에서 추출한 agentId
 * @returns 매칭된 SDK agentId 또는 null
 */
export function findMatchingAgentId(
  activeAgents: Set<SdkAgentId>,
  transcriptId: TranscriptAgentId
): SdkAgentId | null {
  if (!transcriptId) {
    return null;
  }

  // 정확한 일치 먼저 확인
  if (activeAgents.has(transcriptId)) {
    return transcriptId;
  }

  // 부분 매칭 확인
  for (const sdkId of activeAgents) {
    if (matchAgentIds(sdkId, transcriptId)) {
      return sdkId;
    }
  }

  return null;
}

/**
 * 파일 경로에서 agentId 추출
 *
 * 패턴: /subagents/agent-a<hash>.jsonl -> <hash>
 * 예시: agent-a1b2c3d4e5f6.jsonl -> "1b2c3d4e5f6"
 *
 * @param filePath - 전체 파일 경로
 * @returns 추출된 agentId 또는 null
 */
export function extractAgentIdFromFilePath(filePath: string): FilePathAgentId | null {
  // Match agent-a<hash>.jsonl pattern
  const match = filePath.match(/agent-a([a-f0-9]+)\.jsonl$/i);
  if (match) {
    return match[1]; // Return the hash without 'a' prefix
  }
  return null;
}

/**
 * 유효한 agentId 결정 (우선순위 적용)
 *
 * 우선순위:
 * 1. JSONL의 agentId (가장 신뢰할 수 있음)
 * 2. 파일 경로에서 추출한 agentId
 * 3. null
 *
 * @param jsonlAgentId - JSONL에서 파싱한 agentId
 * @param filePathAgentId - 파일 경로에서 추출한 agentId
 * @returns 사용할 agentId
 */
export function resolveEffectiveAgentId(
  jsonlAgentId: string | undefined,
  filePathAgentId: string | null
): string {
  return jsonlAgentId || filePathAgentId || '';
}

/**
 * 디버그용: ID 매칭 상태 로깅
 */
export function logIdMatchingDebug(
  context: string,
  params: {
    jsonlAgentId?: string;
    filePathAgentId?: string | null;
    effectiveAgentId: string;
    activeAgents: Set<string>;
    matchResult: string | null;
  }
): void {
  console.log(`[${context}] ID Matching Debug:`, {
    jsonlAgentId: params.jsonlAgentId || '(empty)',
    filePathAgentId: params.filePathAgentId || '(empty)',
    effectiveAgentId: params.effectiveAgentId || '(empty)',
    activeAgents: Array.from(params.activeAgents),
    matchResult: params.matchResult || 'NO MATCH',
  });
}
