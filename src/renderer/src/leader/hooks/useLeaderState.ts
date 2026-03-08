/**
 * useLeaderState Hook
 *
 * Business Logic Layer for leader (parent agent) state management.
 * Manages leader identity, status, processing state, and errors.
 */

import { useState, useCallback, useMemo } from 'react';
import type { AgentStatus } from '../../shared';
import { getStatusText, getStatusColorClass, isActiveStatus } from '../../shared';

export interface LeaderState {
  leaderId: string;
  workingDirectory: string;
  status: AgentStatus;
  isProcessing: boolean;
  error: string | null;
}

export interface LeaderDerivedState {
  isActive: boolean;
  statusText: string;
  statusColorClass: string;
  displayDirectory: string;
}

export interface UseLeaderStateReturn {
  state: LeaderState;
  derived: LeaderDerivedState;
  setLeaderId: (id: string) => void;
  setWorkingDirectory: (dir: string) => void;
  setStatus: (status: AgentStatus) => void;
  setIsProcessing: (processing: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
}

/**
 * Hook for managing leader state
 */
export function useLeaderState(
  initialLeaderId: string = '',
  initialWorkingDirectory: string = ''
): UseLeaderStateReturn {
  const [leaderId, setLeaderId] = useState(initialLeaderId);
  const [workingDirectory, setWorkingDirectory] = useState(initialWorkingDirectory);
  const [status, setStatus] = useState<AgentStatus>('idle');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const state: LeaderState = useMemo(
    () => ({
      leaderId,
      workingDirectory,
      status,
      isProcessing,
      error
    }),
    [leaderId, workingDirectory, status, isProcessing, error]
  );

  const derived: LeaderDerivedState = useMemo(
    () => ({
      isActive: isActiveStatus(status),
      statusText: getStatusText(status),
      statusColorClass: getStatusColorClass(status),
      // Truncate working directory for display
      displayDirectory: workingDirectory.split('/').slice(-2).join('/')
    }),
    [status, workingDirectory]
  );

  const handleSetLeaderId = useCallback((id: string) => {
    setLeaderId(id);
  }, []);

  const handleSetWorkingDirectory = useCallback((dir: string) => {
    setWorkingDirectory(dir);
  }, []);

  const handleSetStatus = useCallback((newStatus: AgentStatus) => {
    setStatus(newStatus);
    // Auto-update processing state based on status
    if (newStatus === 'idle' || newStatus === 'complete') {
      setIsProcessing(false);
    } else if (newStatus === 'thinking' || newStatus === 'responding') {
      setIsProcessing(true);
    }
  }, []);

  const handleSetIsProcessing = useCallback((processing: boolean) => {
    setIsProcessing(processing);
  }, []);

  const handleSetError = useCallback((err: string | null) => {
    setError(err);
    if (err) {
      setIsProcessing(false);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    state,
    derived,
    setLeaderId: handleSetLeaderId,
    setWorkingDirectory: handleSetWorkingDirectory,
    setStatus: handleSetStatus,
    setIsProcessing: handleSetIsProcessing,
    setError: handleSetError,
    clearError
  };
}

export default useLeaderState;
