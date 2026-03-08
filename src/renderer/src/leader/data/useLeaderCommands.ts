/**
 * useLeaderCommands Hook
 *
 * Command layer for leader (parent agent) widgets.
 * Provides methods to send commands to the main process.
 */

import { useCallback } from 'react';

export interface LeaderCommands {
  /** Send a command to execute */
  sendCommand: (command: string) => void;
  /** Request to close the leader widget */
  requestClose: () => void;
  /** Notify that the leader widget is ready */
  notifyReady: () => void;
}

/**
 * Hook for leader command methods
 */
export function useLeaderCommands(): LeaderCommands {
  const sendCommand = useCallback((command: string) => {
    window.leaderAPI?.sendCommand(command);
  }, []);

  const requestClose = useCallback(() => {
    window.leaderAPI?.requestClose();
  }, []);

  const notifyReady = useCallback(() => {
    window.leaderAPI?.notifyReady();
  }, []);

  return {
    sendCommand,
    requestClose,
    notifyReady
  };
}

export default useLeaderCommands;
