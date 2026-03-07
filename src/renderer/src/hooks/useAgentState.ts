/**
 * useAgentState Hook
 * Single Responsibility: Manage agent-related state
 *
 * This hook encapsulates all agent state (messages, status, tool use, error, result)
 * and provides actions to update them.
 *
 * Usage:
 *   const [state, actions] = useAgentState();
 *   actions.addMessage({ type: 'text', content: 'Hello' });
 *   actions.setStatus('responding');
 */

import { useState, useCallback, useMemo } from 'react';
import type { AgentStatus, MessageType } from '../../../shared/types';

export interface Message {
  id: string;
  type: MessageType;
  content: string;
  toolName?: string;
  timestamp: number;
}

export interface ResultData {
  result: string;
  costUsd: number;
  turns: number;
}

export interface AgentState {
  messages: Message[];
  status: AgentStatus;
  currentToolUse: string | null;
  error: string | null;
  result: ResultData | null;
}

export interface AgentStateActions {
  /**
   * Add a new message or update existing one by ID.
   */
  addMessage(msg: Partial<Message> & { id: string }): void;

  /**
   * Update an existing message by appending content.
   */
  updateMessage(id: string, chunk: string): void;

  /**
   * Set the agent status.
   */
  setStatus(status: AgentStatus): void;

  /**
   * Set the current tool being used.
   */
  setToolUse(toolName: string | null): void;

  /**
   * Set an error message.
   */
  setError(error: string | null): void;

  /**
   * Set the result data.
   */
  setResult(result: ResultData | null): void;

  /**
   * Clear all state.
   */
  clear(): void;

  /**
   * Handle incoming message from IPC.
   * Creates new message or appends to existing.
   */
  handleMessage(data: { messageId: string; chunk: string; type: MessageType }): void;
}

const initialState: AgentState = {
  messages: [],
  status: 'idle',
  currentToolUse: null,
  error: null,
  result: null
};

/**
 * Hook for managing agent state.
 *
 * @returns Tuple of [state, actions]
 */
export function useAgentState(): [AgentState, AgentStateActions] {
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<AgentStatus>('idle');
  const [currentToolUse, setCurrentToolUse] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResultData | null>(null);

  const addMessage = useCallback((msg: Partial<Message> & { id: string }) => {
    setMessages(prev => {
      const existing = prev.find(m => m.id === msg.id);
      if (existing) {
        return prev.map(m =>
          m.id === msg.id
            ? { ...m, ...msg }
            : m
        );
      }
      return [...prev, {
        id: msg.id,
        type: msg.type || 'text',
        content: msg.content || '',
        toolName: msg.toolName,
        timestamp: msg.timestamp || Date.now()
      }];
    });
  }, []);

  const updateMessage = useCallback((id: string, chunk: string) => {
    setMessages(prev => prev.map(m =>
      m.id === id
        ? { ...m, content: m.content + chunk }
        : m
    ));
  }, []);

  const handleMessage = useCallback((data: {
    messageId: string;
    chunk: string;
    type: MessageType;
  }) => {
    setMessages(prev => {
      const existing = prev.find(m => m.id === data.messageId);
      if (existing) {
        return prev.map(m =>
          m.id === data.messageId
            ? { ...m, content: m.content + data.chunk }
            : m
        );
      }
      return [...prev, {
        id: data.messageId,
        type: data.type,
        content: data.chunk,
        timestamp: Date.now()
      }];
    });
  }, []);

  const handleSetStatus = useCallback((newStatus: AgentStatus) => {
    setStatus(newStatus);
    if (newStatus === 'idle' || newStatus === 'complete') {
      setCurrentToolUse(null);
    }
  }, []);

  const handleSetToolUse = useCallback((toolName: string | null) => {
    setCurrentToolUse(toolName);
  }, []);

  const handleSetError = useCallback((err: string | null) => {
    setError(err);
  }, []);

  const handleSetResult = useCallback((res: ResultData | null) => {
    setResult(res);
  }, []);

  const clear = useCallback(() => {
    setMessages([]);
    setStatus('idle');
    setCurrentToolUse(null);
    setError(null);
    setResult(null);
  }, []);

  const state: AgentState = useMemo(() => ({
    messages,
    status,
    currentToolUse,
    error,
    result
  }), [messages, status, currentToolUse, error, result]);

  const actions: AgentStateActions = useMemo(() => ({
    addMessage,
    updateMessage,
    setStatus: handleSetStatus,
    setToolUse: handleSetToolUse,
    setError: handleSetError,
    setResult: handleSetResult,
    clear,
    handleMessage
  }), [addMessage, updateMessage, handleSetStatus, handleSetToolUse, handleSetError, handleSetResult, clear, handleMessage]);

  return [state, actions];
}
