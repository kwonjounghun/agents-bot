import { ReasoningChain, ReasoningStep } from '../types.js';
import { generateFrontmatter, generateTitle } from './templates.js';

export function generateMarkdown(chain: ReasoningChain): string {
  const sections: string[] = [];

  // 1. Frontmatter
  sections.push(generateFrontmatter(chain));

  // 2. Title
  const title = generateTitle(chain);
  sections.push(`# ${title}`);

  // 3. Problem section
  sections.push('## 문제 정의');
  if (chain.problem) {
    const problemLines = chain.problem
      .split('\n')
      .map(line => `> ${line}`)
      .join('\n');
    sections.push(problemLines);
  } else {
    sections.push('> (문제 설명 없음)');
  }

  // 4. Reasoning steps (thinking + conclusion only, exclude tool calls/results)
  const thinkingSteps = chain.steps.filter(
    s => s.type === 'thinking' || s.type === 'conclusion',
  );
  if (thinkingSteps.length > 0) {
    sections.push('## 추론 과정');
    let stepNum = 0;
    const stepBlocks = thinkingSteps.map(step => {
      stepNum++;
      return formatStep(step, stepNum);
    });
    sections.push(stepBlocks.join('\n\n'));
  }

  // 5. Conclusion
  sections.push('## 결론');
  if (chain.conclusion) {
    sections.push(chain.conclusion);
  } else {
    sections.push('(결론 없음)');
  }

  // 6. Metadata footer
  sections.push('## 메타데이터');
  const duration = formatDuration(chain.startTime, chain.endTime);
  const metaLines = [
    `| 항목 | 값 |`,
    `|------|-----|`,
    `| 세션 ID | \`${chain.sessionId}\` |`,
    `| 에이전트 ID | \`${chain.agentId}\` |`,
    `| 모델 | ${chain.model} |`,
    `| 프로젝트 | ${chain.project} |`,
    `| 브랜치 | ${chain.branch} |`,
    `| 시작 시간 | ${chain.startTime} |`,
    `| 종료 시간 | ${chain.endTime} |`,
    `| 소요 시간 | ${duration} |`,
    `| 단계 수 | ${chain.steps.length} |`,
    `| 사용 도구 | ${chain.toolsUsed.join(', ') || '없음'} |`,
  ];
  sections.push(metaLines.join('\n'));

  return sections.join('\n\n');
}

function formatStep(step: ReasoningStep, stepNum: number): string {
  switch (step.type) {
    case 'thinking': {
      const content = step.content.length > 1000
        ? step.content.slice(0, 997) + '...'
        : step.content;
      return `### Step ${stepNum}\n\n${content}`;
    }

    case 'conclusion': {
      return `### Step ${stepNum}: 결론\n\n${step.content}`;
    }

    default:
      return `### Step ${stepNum}\n\n${step.content}`;
  }
}

function formatDuration(startTime: string, endTime: string): string {
  if (!startTime || !endTime) return '알 수 없음';

  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();

  if (isNaN(start) || isNaN(end)) return '알 수 없음';

  const diffMs = Math.max(0, end - start);
  const totalSeconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) return `${seconds}초`;
  if (seconds === 0) return `${minutes}분`;
  return `${minutes}분 ${seconds}초`;
}
