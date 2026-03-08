/**
 * LeaderWidget Component
 *
 * Main leader (parent agent) widget component with 3-layer architecture:
 * - Data Layer: useLeaderDataSource, useLeaderCommands (IPC subscriptions from SDK stream)
 * - Business Logic: useLeaderState, useLeaderMessages, useSubagentTracking
 * - View Layer: LeaderHeader, LeaderStatusBar, SubagentOverview, LeaderMessageList, LeaderInput
 *
 * Leader receives data via SDK stream directly:
 * ClaudeAgentService SDK stream → IPC → Widget
 */

import { useEffect, useCallback } from 'react';

// Data Layer
import { useLeaderDataSource, useLeaderCommands } from './data';

// Business Logic Layer
import { useLeaderState, useLeaderMessages, useSubagentTracking } from './hooks';

// View Layer
import { LeaderHeader, LeaderStatusBar, SubagentOverview, LeaderMessageList, LeaderInput } from './components';

function LeaderWidget() {
  // Business Logic Layer - State Management
  const { state, setLeaderId, setWorkingDirectory, setStatus, setIsProcessing, setError, clearError } =
    useLeaderState();
  const { messages, handleMessage, clearMessages } = useLeaderMessages();
  const { subAgents, addSubAgent, removeSubAgent, updateSubAgentStatus } = useSubagentTracking();

  // Data Layer - Commands
  const { sendCommand, requestClose } = useLeaderCommands();

  // Data Layer - IPC Subscriptions (stream-based data from SDK)
  const params = useLeaderDataSource({
    onMessage: useCallback(
      (message) => {
        if (message.type === 'complete') {
          setIsProcessing(false);
          return;
        }
        if (message.type === 'error') {
          setError(message.content);
          setIsProcessing(false);
          return;
        }
        handleMessage(message);
      },
      [handleMessage, setIsProcessing, setError]
    ),
    onStatus: useCallback(
      (status) => {
        setStatus(status);
      },
      [setStatus]
    ),
    onSubAgentStatus: useCallback(
      (data) => {
        updateSubAgentStatus(data.agentId, data.role, data.status);
      },
      [updateSubAgentStatus]
    ),
    onSubAgentCreated: useCallback(
      (data) => {
        addSubAgent(data.agentId, data.role);
      },
      [addSubAgent]
    ),
    onSubAgentRemoved: useCallback(
      (data) => {
        removeSubAgent(data.agentId);
      },
      [removeSubAgent]
    ),
    onResult: useCallback(() => {
      setIsProcessing(false);
    }, [setIsProcessing]),
    onError: useCallback(
      (error) => {
        setError(error);
        setIsProcessing(false);
      },
      [setError, setIsProcessing]
    )
  });

  // Initialize leader identity from URL params
  useEffect(() => {
    setLeaderId(params.leaderId);
    setWorkingDirectory(params.workingDirectory);
  }, [params.leaderId, params.workingDirectory, setLeaderId, setWorkingDirectory]);

  // Handle command submission
  const handleSubmit = useCallback(
    (command: string) => {
      setIsProcessing(true);
      clearError();
      clearMessages();
      sendCommand(command);
    },
    [sendCommand, setIsProcessing, clearError, clearMessages]
  );

  // Handle close
  const handleClose = useCallback(() => {
    requestClose();
  }, [requestClose]);

  return (
    <div className="w-full h-full flex flex-col bg-gradient-to-b from-slate-900 to-slate-950 rounded-2xl overflow-hidden border border-slate-700/50 shadow-2xl">
      {/* Header with Leader Badge */}
      <LeaderHeader
        workingDirectory={state.workingDirectory}
        isProcessing={state.isProcessing}
        onClose={handleClose}
      />

      {/* Status Bar */}
      <LeaderStatusBar status={state.status} isProcessing={state.isProcessing} subAgentCount={subAgents.length} />

      {/* Sub-agents Overview */}
      <SubagentOverview subAgents={subAgents} />

      {/* Messages Area - Accumulated */}
      <LeaderMessageList messages={messages} isProcessing={state.isProcessing} error={state.error} />

      {/* Input Area */}
      <LeaderInput isProcessing={state.isProcessing} onSubmit={handleSubmit} />
    </div>
  );
}

export default LeaderWidget;
