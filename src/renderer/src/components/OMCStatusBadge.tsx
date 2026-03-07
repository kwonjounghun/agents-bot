/**
 * OMCStatusBadge Component
 * Single Responsibility: Display OMC installation status badge
 *
 * This component shows:
 * - OMC installation status
 * - Version number
 * - Skill count
 *
 * Usage:
 *   <OMCStatusBadge status={omcStatus} onClick={handleClick} />
 */

import type { OMCStatusInfo } from '../../../shared/types';

export interface OMCStatusBadgeProps {
  /**
   * OMC status information.
   */
  status: OMCStatusInfo | null;

  /**
   * Called when badge is clicked.
   */
  onClick: () => void;
}

/**
 * OMCStatusBadge component displays OMC installation status.
 */
export function OMCStatusBadge({ status, onClick }: OMCStatusBadgeProps) {
  // Loading/unknown state
  if (!status) {
    return (
      <button
        onClick={onClick}
        className="flex items-center gap-1 px-2 py-1 rounded-full bg-slate-700/50 border border-slate-600/50 text-slate-400 text-xs hover:bg-slate-700 transition-colors"
      >
        <span className="w-2 h-2 rounded-full bg-slate-500" />
        <span>OMC</span>
      </button>
    );
  }

  // Not installed state
  if (!status.installed) {
    return (
      <button
        onClick={onClick}
        className="flex items-center gap-1 px-2 py-1 rounded-full bg-yellow-900/30 border border-yellow-700/50 text-yellow-400 text-xs hover:bg-yellow-900/50 transition-colors"
        title="OMC not installed"
      >
        <span className="w-2 h-2 rounded-full bg-yellow-500" />
        <span>OMC</span>
      </button>
    );
  }

  // Installed state
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-900/30 border border-emerald-700/50 text-emerald-400 text-xs hover:bg-emerald-900/50 transition-colors"
      title={`OMC v${status.version} - ${status.skillCount} skills`}
    >
      <span className="w-2 h-2 rounded-full bg-emerald-500" />
      <span>OMC {status.version}</span>
      {status.skillCount > 0 && (
        <span className="text-emerald-300/70">({status.skillCount})</span>
      )}
    </button>
  );
}

export default OMCStatusBadge;
