/**
 * UsagePanel Component
 *
 * Displays Claude Code usage (session/weekly utilization) in the sidebar.
 * Fetches data from the Anthropic OAuth Usage API via main process.
 */

import { useState, useEffect, useCallback } from 'react';

interface UsageWindow {
  utilization: number;
  resets_at: string;
}

interface UsageData {
  five_hour?: UsageWindow;
  seven_day?: UsageWindow;
  seven_day_sonnet?: UsageWindow;
  extra_usage?: {
    is_enabled: boolean;
    used_credits: number;
    monthly_limit: number;
  };
}

interface UsageResult {
  success: boolean;
  data?: UsageData;
  plan?: string;
  error?: string;
}

function formatResetTime(resetsAt: string): string {
  const reset = new Date(resetsAt);
  const now = new Date();
  const diffMs = reset.getTime() - now.getTime();
  if (diffMs <= 0) return '곧 초기화';

  const totalMin = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;

  if (hours > 0) return `${hours}시간 ${mins}분 후 초기화`;
  return `${mins}분 후 초기화`;
}

function getBarColor(utilization: number): string {
  if (utilization >= 90) return 'bg-red-500';
  if (utilization >= 70) return 'bg-amber-500';
  return 'bg-emerald-500';
}

function getTextColor(utilization: number): string {
  if (utilization >= 90) return 'text-red-400';
  if (utilization >= 70) return 'text-amber-400';
  return 'text-emerald-400';
}

function UsageBar({
  label,
  utilization,
  resetsAt,
}: {
  label: string;
  utilization: number;
  resetsAt?: string;
}) {
  const clamped = Math.min(100, Math.max(0, utilization));

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">{label}</span>
        <span className={`text-xs font-medium ${getTextColor(clamped)}`}>
          {Math.round(clamped)}%
        </span>
      </div>
      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${getBarColor(clamped)}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {resetsAt && (
        <div className="text-[10px] text-slate-500">{formatResetTime(resetsAt)}</div>
      )}
    </div>
  );
}

export function UsagePanel() {
  const [usage, setUsage] = useState<UsageResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const fetchUsage = useCallback(async () => {
    if (!window.usageAPI) return;
    setLoading(true);
    try {
      const result = await window.usageAPI.getClaudeUsage();
      setUsage(result);
    } catch {
      setUsage({ success: false, error: 'Failed to fetch' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsage();
    // Auto-refresh every 5 minutes
    const interval = setInterval(fetchUsage, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchUsage]);

  // Not logged in or no API
  if (!usage || (!usage.success && !loading)) {
    return (
      <div className="px-3 py-2 border-t border-slate-700">
        <button
          onClick={fetchUsage}
          className="w-full text-xs text-slate-500 hover:text-slate-400 transition-colors text-center py-1"
        >
          {usage?.error === 'Not logged in. Run `claude` to authenticate.'
            ? 'Claude 로그인 필요'
            : '사용량 로드 실패 · 재시도'}
        </button>
      </div>
    );
  }

  const data = usage.data;
  if (!data) return null;

  const hasSession = data.five_hour && typeof data.five_hour.utilization === 'number';
  const hasWeekly = data.seven_day && typeof data.seven_day.utilization === 'number';
  const hasSonnet = data.seven_day_sonnet && typeof data.seven_day_sonnet.utilization === 'number';
  const hasExtra = data.extra_usage?.is_enabled;

  return (
    <div className="border-t border-slate-700">
      {/* Header - clickable to expand/collapse */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-700/30 transition-colors"
      >
        <div className="flex items-center gap-1.5">
          <svg className="w-3 h-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <span className="text-xs text-slate-400">사용량</span>
          {usage.plan && (
            <span className="text-[10px] text-slate-500 bg-slate-700 px-1 rounded">
              {usage.plan}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {loading && (
            <svg className="animate-spin w-3 h-3 text-slate-500" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {/* Mini indicator when collapsed */}
          {!expanded && hasSession && (
            <div className="flex items-center gap-1">
              <div className="w-8 h-1 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${getBarColor(data.five_hour!.utilization)}`}
                  style={{ width: `${Math.min(100, data.five_hour!.utilization)}%` }}
                />
              </div>
              <span className={`text-[10px] font-medium ${getTextColor(data.five_hour!.utilization)}`}>
                {Math.round(data.five_hour!.utilization)}%
              </span>
            </div>
          )}
          <svg
            className={`w-3 h-3 text-slate-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-3 pb-2 space-y-2">
          {hasSession && (
            <UsageBar
              label="세션 (5시간)"
              utilization={data.five_hour!.utilization}
              resetsAt={data.five_hour!.resets_at}
            />
          )}
          {hasWeekly && (
            <UsageBar
              label="주간 (7일)"
              utilization={data.seven_day!.utilization}
              resetsAt={data.seven_day!.resets_at}
            />
          )}
          {hasSonnet && (
            <UsageBar
              label="Sonnet (7일)"
              utilization={data.seven_day_sonnet!.utilization}
              resetsAt={data.seven_day_sonnet!.resets_at}
            />
          )}
          {hasExtra && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">추가 사용</span>
                <span className="text-xs text-slate-300">
                  ${(data.extra_usage!.used_credits / 100).toFixed(2)}
                  {data.extra_usage!.monthly_limit > 0 && (
                    <span className="text-slate-500">
                      {' / $'}{(data.extra_usage!.monthly_limit / 100).toFixed(0)}
                    </span>
                  )}
                </span>
              </div>
              {data.extra_usage!.monthly_limit > 0 && (
                <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all duration-500"
                    style={{
                      width: `${Math.min(100, (data.extra_usage!.used_credits / data.extra_usage!.monthly_limit) * 100)}%`,
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Refresh button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              fetchUsage();
            }}
            disabled={loading}
            className="w-full text-[10px] text-slate-500 hover:text-slate-400 transition-colors text-center py-0.5"
          >
            {loading ? '갱신 중...' : '새로고침'}
          </button>
        </div>
      )}
    </div>
  );
}
