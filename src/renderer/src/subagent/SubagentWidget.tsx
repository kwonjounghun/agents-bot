/**
 * SubagentWidget Component
 *
 * Main sub-agent widget component with 3-layer architecture:
 * - Data Layer: useSubagentDataSource (IPC subscriptions from TranscriptWatcher polling)
 * - Business Logic: useSubagentState, useSubagentMessages
 * - View Layer: SubagentAvatar, SubagentBubble, SubagentStatus
 *
 * Sub-agent receives data via polling (claude-esp style):
 * TranscriptWatcher polls JSONL files → IPC → Widget
 */

import { useEffect, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';

// Data Layer
import { useSubagentDataSource } from './data';

// Business Logic Layer
import { useSubagentState, useSubagentMessages } from './hooks';

// View Layer
import { SubagentAvatar, SubagentBubble, SubagentStatus } from './components';

// Shared
import { ThinkingDots } from '../shared';

function SubagentWidget() {
  // Business Logic Layer - State Management
  const { state, derived, setAgentId, setRole, setStatus } = useSubagentState();
  const { messages, isStreaming, handleMessage, handleStatusChange, clearMessages } = useSubagentMessages();

  // Data Layer - IPC Subscriptions (polling-based data from TranscriptWatcher)
  const params = useSubagentDataSource({
    onMessage: useCallback(
      (message) => {
        console.log('[SubagentWidget] Received message:', message.type, 'content length:', message.content?.length);
        handleMessage(message);
      },
      [handleMessage]
    ),
    onStatus: useCallback(
      (status) => {
        console.log('[SubagentWidget] Received status:', status);
        setStatus(status);
        handleStatusChange(status);
      },
      [setStatus, handleStatusChange]
    ),
    onClose: useCallback(() => {
      window.close();
    }, [])
  });

  // Initialize agent identity from URL params
  useEffect(() => {
    setAgentId(params.agentId);
    setRole(params.role);
  }, [params.agentId, params.role, setAgentId, setRole]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearMessages();
    };
  }, [clearMessages]);

  return (
    <div className="w-full h-full flex flex-col items-center justify-end p-3">
      {/* Speech Bubble Area - Accumulated messages */}
      <div className="flex-1 w-full flex items-end mb-2 min-h-0 relative">
        <SubagentBubble role={state.role} messages={messages} isStreaming={isStreaming} />

        {/* Floating thought dots when thinking but no message yet */}
        <AnimatePresence>
          {derived.isActive && messages.length === 0 && (
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2">
              <ThinkingDots color="bg-white" size="md" />
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* Avatar with glow effect when active */}
      <SubagentAvatar role={state.role} status={state.status} size="lg" />

      {/* Status and Role Badge */}
      <div className="mt-2">
        <SubagentStatus role={state.role} status={state.status} />
      </div>
    </div>
  );
}

export default SubagentWidget;
